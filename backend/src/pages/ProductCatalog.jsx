// ProductCatalog.jsx — Unified product management across POS, inventory & sales
// Route: /products (owner only)

import { useState, useEffect, useRef } from 'react'
import {
  Plus, Search, Edit2, Trash2, Upload, Package, TrendingUp, Layers, X,
  ScanLine, Image, ChevronDown, Eye, EyeOff, History, ShoppingBag
} from 'lucide-react'
import Layout from '../components/Layout'
import toast from 'react-hot-toast'
import {
  getPOSBranches, getPOSProducts, getPOSCategories,
  createPOSProduct, updatePOSProduct, deletePOSProduct,
  getProductSalesStats, uploadProductImage,
} from '../modules/pos/lib/pos-supabase'
import { getRecipesForCost, getCurrencyRates, calcCostPerBaseUnit } from '../lib/supabase'
import BarcodeScanner from '../modules/pos/components/BarcodeScanner'

// ─── helpers ──────────────────────────────────────────────────
function calcRecipeCost(recipe, rates) {
  return (recipe.recipe_ingredients || []).reduce((sum, ri) => {
    if (ri.is_fixed_cost) return sum + (parseFloat(ri.fixed_cost_lyd) || 0)
    const ing = ri.ingredient
    if (!ing || !ri.qty_used) return sum
    const cpp = calcCostPerBaseUnit(
      parseFloat(ing.bulk_qty), ing.bulk_unit,
      parseFloat(ing.bulk_cost), ing.purchase_currency, rates
    )
    return sum + cpp * parseFloat(ri.qty_used)
  }, 0)
}

function fmt(n) { return parseFloat(n || 0).toFixed(3) }

// ─── Margin display ───────────────────────────────────────────
function Margin({ price, cost, size = 'sm' }) {
  if (!cost || !price || parseFloat(price) === 0) return null
  const m = ((parseFloat(price) - parseFloat(cost)) / parseFloat(price) * 100)
  const color = m >= 55 ? 'text-emerald-400' : m >= 35 ? 'text-amber-400' : 'text-red-400'
  return <span className={`font-semibold ${color} text-${size}`}>{m.toFixed(0)}%</span>
}

// ─── Stock badge ──────────────────────────────────────────────
function StockBadge({ qty, threshold, track }) {
  if (!track) return null
  const n = parseFloat(qty) || 0
  const t = parseFloat(threshold) || 5
  if (n <= 0) return <span className="px-1.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/12 text-red-400 border border-red-500/20">Out</span>
  if (n <= t) return <span className="px-1.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/12 text-amber-400 border border-amber-500/20">Low {n}</span>
  return <span className="px-1.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/12 text-emerald-400 border border-emerald-500/20">{n}</span>
}

// ─── Product card ─────────────────────────────────────────────
function ProductCard({ product, stats, onEdit, onDelete }) {
  const qty = stats?.qty || 0
  const revenue = stats?.revenue || 0
  return (
    <div
      className="group rounded-2xl border overflow-hidden cursor-pointer transition-all duration-200"
      style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-bright)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
      onClick={() => onEdit(product)}
    >
      {/* Image */}
      <div className="relative aspect-[4/3] overflow-hidden" style={{ background: 'var(--surface)' }}>
        {product.image_url ? (
          <img src={product.image_url} alt={product.name} className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 opacity-40">
            <ShoppingBag size={26} className="text-zinc-500" />
          </div>
        )}
        {/* Category pill */}
        {product.pos_categories && (
          <span
            className="absolute top-2 left-2 text-[11px] font-semibold px-2 py-0.5 rounded-full"
            style={{ background: product.pos_categories.color + '28', color: product.pos_categories.color }}
          >
            {product.pos_categories.name}
          </span>
        )}
        {/* Hidden badge */}
        {!product.is_active && (
          <span className="absolute top-2 right-2 flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-zinc-800/90 text-zinc-400 border border-zinc-600/40">
            <EyeOff size={9} /> Hidden
          </span>
        )}
        {/* Delete on hover */}
        <button
          onClick={e => { e.stopPropagation(); onDelete(product) }}
          className="absolute bottom-2 right-2 w-6 h-6 rounded-full items-center justify-center hidden group-hover:flex bg-red-500/80 text-white transition-all"
        >
          <Trash2 size={11} />
        </button>
      </div>

      {/* Body */}
      <div className="p-3">
        <p className="text-white font-semibold text-sm leading-tight truncate">{product.name}</p>
        {product.name_ar && <p className="text-zinc-500 text-xs mt-0.5 truncate" dir="rtl">{product.name_ar}</p>}

        <div className="flex items-end justify-between mt-2">
          <div>
            <p className="text-noch-green font-bold text-base leading-none">{fmt(product.price)}</p>
            {product.cost_price && <p className="text-zinc-600 text-[11px] leading-tight">cost {fmt(product.cost_price)}</p>}
          </div>
          <div className="flex flex-col items-end gap-1">
            <StockBadge qty={product.stock_qty} threshold={product.low_stock_alert} track={product.track_inventory} />
            <Margin price={product.price} cost={product.cost_price} size="xs" />
          </div>
        </div>

        {qty > 0 && (
          <div className="flex items-center gap-1 mt-2 pt-2 border-t text-[11px] text-zinc-500" style={{ borderColor: 'var(--border)' }}>
            <TrendingUp size={10} className="text-noch-green flex-shrink-0" />
            <span>{qty} sold · {fmt(revenue)} LYD</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Edit / Add modal ─────────────────────────────────────────
const BLANK = {
  name: '', name_ar: '', price: '', cost_price: '', barcode: '', sku: '',
  category_id: '', track_inventory: false, stock_qty: '0',
  low_stock_alert: '5', is_active: true, image_url: '', cost_recipe_id: '',
  visible_on_website: true, visible_on_menu: false,
}

function ProductModal({ product, categories, branchId, recipes, rates, onSave, onClose }) {
  const [form, setForm] = useState(() => product
    ? { ...BLANK, ...product, price: product.price ?? '', cost_price: product.cost_price ?? '', cost_recipe_id: product.cost_recipe_id ?? '' }
    : { ...BLANK }
  )
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [recipeCalc, setRecipeCalc] = useState(null)
  const fileRef = useRef()
  const isEdit = !!product?.id

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // When recipe selected, calc its cost
  useEffect(() => {
    if (!form.cost_recipe_id) { setRecipeCalc(null); return }
    const r = recipes.find(x => x.id === form.cost_recipe_id)
    if (!r) { setRecipeCalc(null); return }
    const cost = calcRecipeCost(r, rates)
    setRecipeCalc({ cost, name: r.name })
  }, [form.cost_recipe_id, recipes, rates])

  const handleSave = async () => {
    if (!form.name.trim() || !form.price) return toast.error('Name and price required')
    if (!branchId) return toast.error('No branch selected')
    setSaving(true)
    try {
      const payload = {
        ...form,
        name: form.name.trim(),
        branch_id: branchId,
        price: parseFloat(form.price),
        cost_price: form.cost_price ? parseFloat(form.cost_price) : null,
        cost_recipe_id: form.cost_recipe_id || null,
        stock_qty: parseFloat(form.stock_qty) || 0,
        low_stock_alert: parseFloat(form.low_stock_alert) || 5,
        category_id: form.category_id || null,
      }
      if (isEdit) await updatePOSProduct(product.id, payload)
      else await createPOSProduct(payload)
      toast.success(isEdit ? 'Product updated' : 'Product created')
      onSave()
    } catch (err) {
      toast.error(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!product?.id) return toast.error('Save the product first, then upload a photo')
    setUploading(true)
    try {
      const url = await uploadProductImage(product.id, file)
      set('image_url', url)
      toast.success('Photo uploaded')
    } catch (err) {
      toast.error(err.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const margin = form.price && form.cost_price
    ? ((parseFloat(form.price) - parseFloat(form.cost_price)) / parseFloat(form.price) * 100)
    : null

  return (
    <>
      {showScanner && (
        <BarcodeScanner onScan={v => { set('barcode', v); setShowScanner(false) }} onClose={() => setShowScanner(false)} />
      )}
      <div className="fixed inset-0 z-50 bg-black/75 flex items-end md:items-center justify-center p-0 md:p-4">
        <div className="w-full md:max-w-xl md:rounded-2xl rounded-t-2xl max-h-[94vh] overflow-y-auto flex flex-col"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 z-10"
            style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
            <h2 className="text-white font-bold">{isEdit ? `Edit: ${product.name}` : 'New Product'}</h2>
            <button onClick={onClose} className="text-zinc-500 hover:text-white"><X size={18} /></button>
          </div>

          <div className="p-5 flex flex-col gap-4 flex-1 overflow-y-auto">

            {/* Photo (edit only) */}
            {isEdit && (
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  {form.image_url
                    ? <img src={form.image_url} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center"><Image size={22} className="text-zinc-600" /></div>
                  }
                </div>
                <div>
                  <p className="text-white text-sm font-medium mb-1.5">Product Photo</p>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                  <button onClick={() => fileRef.current?.click()} disabled={uploading} className="btn-secondary text-xs flex items-center gap-1.5 py-1.5">
                    <Upload size={11} /> {uploading ? 'Uploading…' : form.image_url ? 'Change photo' : 'Upload photo'}
                  </button>
                  <p className="text-zinc-600 text-[11px] mt-1">JPG, PNG, WebP · shown in POS terminal</p>
                </div>
              </div>
            )}
            {!isEdit && <p className="text-zinc-600 text-xs rounded-xl px-3 py-2" style={{ background: 'var(--surface)' }}>💡 Save first, then you can upload a photo.</p>}

            {/* Names */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Name (EN) *</label>
                <input value={form.name} onChange={e => set('name', e.target.value)} className="input" placeholder="Cappuccino" />
              </div>
              <div>
                <label className="label">Name (AR)</label>
                <input value={form.name_ar} onChange={e => set('name_ar', e.target.value)} className="input text-right" dir="rtl" placeholder="كابوتشينو" />
              </div>
            </div>

            {/* Prices */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Sale Price (LYD) *</label>
                <input type="number" value={form.price} onChange={e => set('price', e.target.value)} className="input" placeholder="8.500" step="0.001" min="0" />
              </div>
              <div>
                <label className="label">Cost Price (LYD)</label>
                <input type="number" value={form.cost_price} onChange={e => set('cost_price', e.target.value)} className="input" placeholder="3.200" step="0.001" min="0" />
              </div>
            </div>

            {/* Margin live */}
            {margin !== null && (
              <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <TrendingUp size={14} className={margin >= 55 ? 'text-emerald-400' : margin >= 35 ? 'text-amber-400' : 'text-red-400'} />
                <span className="text-zinc-400 text-xs">Gross margin:</span>
                <span className={`font-bold ${margin >= 55 ? 'text-emerald-400' : margin >= 35 ? 'text-amber-400' : 'text-red-400'}`}>{margin.toFixed(1)}%</span>
                <span className="text-zinc-600 text-xs ml-auto">profit {fmt(parseFloat(form.price || 0) - parseFloat(form.cost_price || 0))} LYD</span>
              </div>
            )}

            {/* Link to recipe */}
            <div>
              <label className="label">Link to Cost Recipe (optional)</label>
              <select value={form.cost_recipe_id} onChange={e => set('cost_recipe_id', e.target.value)} className="input">
                <option value="">— None —</option>
                {recipes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              {recipeCalc && (
                <div className="mt-2 flex items-center gap-3 px-3 py-2 rounded-xl" style={{ background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.18)' }}>
                  <span className="text-zinc-400 text-xs flex-1">Calculated cost from <span className="text-white">{recipeCalc.name}</span>: <span className="text-noch-green font-bold">{fmt(recipeCalc.cost)} LYD</span></span>
                  <button
                    onClick={() => set('cost_price', recipeCalc.cost.toFixed(3))}
                    className="text-xs font-semibold px-3 py-1 rounded-lg transition-colors"
                    style={{ background: 'rgba(74,222,128,0.15)', color: '#4ADE80' }}
                  >
                    Use
                  </button>
                </div>
              )}
            </div>

            {/* Category + SKU */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Category</label>
                <select value={form.category_id} onChange={e => set('category_id', e.target.value)} className="input">
                  <option value="">No category</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">SKU</label>
                <input value={form.sku} onChange={e => set('sku', e.target.value)} className="input" placeholder="CAP-001" />
              </div>
            </div>

            {/* Barcode */}
            <div>
              <label className="label">Barcode</label>
              <div className="flex gap-2">
                <input value={form.barcode} onChange={e => set('barcode', e.target.value)} className="input flex-1" placeholder="1234567890" />
                <button onClick={() => setShowScanner(true)} className="btn-secondary px-3"><ScanLine size={14} /></button>
              </div>
            </div>

            {/* Inventory tracking */}
            <div className="rounded-xl p-3 flex flex-col gap-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <label className="flex items-center gap-3 cursor-pointer" onClick={() => set('track_inventory', !form.track_inventory)}>
                <div className="w-8 h-4 rounded-full flex items-center px-0.5 flex-shrink-0 transition-colors"
                  style={{ background: form.track_inventory ? '#4ADE80' : 'var(--border-bright, #2D3050)' }}>
                  <div className={`w-3 h-3 rounded-full bg-white transition-transform ${form.track_inventory ? 'translate-x-4' : ''}`} />
                </div>
                <span className="text-white text-sm font-medium">Track stock level</span>
              </label>
              {form.track_inventory && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Current Stock</label>
                    <input type="number" value={form.stock_qty} onChange={e => set('stock_qty', e.target.value)} className="input" step="0.01" />
                  </div>
                  <div>
                    <label className="label">Low Stock Alert</label>
                    <input type="number" value={form.low_stock_alert} onChange={e => set('low_stock_alert', e.target.value)} className="input" step="0.01" />
                  </div>
                </div>
              )}
            </div>

            {/* Visibility toggles */}
            <div className="rounded-xl p-3 flex flex-col gap-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <label className="flex items-center gap-3 cursor-pointer" onClick={() => set('is_active', !form.is_active)}>
                <div className="w-8 h-4 rounded-full flex items-center px-0.5 flex-shrink-0 transition-colors"
                  style={{ background: form.is_active ? '#4ADE80' : 'var(--border-bright, #2D3050)' }}>
                  <div className={`w-3 h-3 rounded-full bg-white transition-transform ${form.is_active ? 'translate-x-4' : ''}`} />
                </div>
                <div>
                  <p className="text-white text-sm">Visible in POS terminal</p>
                  <p className="text-zinc-600 text-xs">{form.is_active ? 'Shown to cashiers' : 'Hidden from POS — still in catalog'}</p>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer" onClick={() => set('visible_on_website', !form.visible_on_website)}>
                <div className="w-8 h-4 rounded-full flex items-center px-0.5 flex-shrink-0 transition-colors"
                  style={{ background: form.visible_on_website ? '#4ADE80' : 'var(--border-bright, #2D3050)' }}>
                  <div className={`w-3 h-3 rounded-full bg-white transition-transform ${form.visible_on_website ? 'translate-x-4' : ''}`} />
                </div>
                <div>
                  <p className="text-white text-sm">Visible on online shop (noch.cloud)</p>
                  <p className="text-zinc-600 text-xs">{form.visible_on_website ? 'Shown on storefront' : 'Hidden from storefront'}</p>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer" onClick={() => set('visible_on_menu', !form.visible_on_menu)}>
                <div className="w-8 h-4 rounded-full flex items-center px-0.5 flex-shrink-0 transition-colors"
                  style={{ background: form.visible_on_menu ? '#4ADE80' : 'var(--border-bright, #2D3050)' }}>
                  <div className={`w-3 h-3 rounded-full bg-white transition-transform ${form.visible_on_menu ? 'translate-x-4' : ''}`} />
                </div>
                <div>
                  <p className="text-white text-sm">Visible on NFC menu</p>
                  <p className="text-zinc-600 text-xs">{form.visible_on_menu ? 'Shown on curated tap-menu' : 'Hidden from tap-menu'}</p>
                </div>
              </label>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
                {saving ? 'Saving…' : isEdit ? 'Update' : 'Create Product'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Main page ────────────────────────────────────────────────
export default function ProductCatalog() {
  const [branches, setBranches] = useState([])
  const [activeBranch, setActiveBranch] = useState(null)
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [salesStats, setSalesStats] = useState({})
  const [recipes, setRecipes] = useState([])
  const [rates, setRates] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10) })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10))
  const [editProduct, setEditProduct] = useState(null)
  const [showAdd, setShowAdd] = useState(false)

  // Load branches + recipes + rates once
  useEffect(() => {
    Promise.all([getPOSBranches(), getRecipesForCost(), getCurrencyRates()])
      .then(([b, r, rates]) => {
        setBranches(b)
        setRecipes(r)
        setRates(rates)
        if (b.length > 0) setActiveBranch(b[0])
      })
      .catch(err => toast.error(err.message || 'Failed to load'))
  }, [])

  useEffect(() => {
    if (activeBranch) load()
  }, [activeBranch, dateFrom, dateTo])

  const load = async () => {
    if (!activeBranch) return
    setLoading(true)
    try {
      const [p, c, s] = await Promise.all([
        getPOSProducts(activeBranch.id),
        getPOSCategories(activeBranch.id),
        getProductSalesStats(activeBranch.id, dateFrom, dateTo),
      ])
      setProducts(p); setCategories(c); setSalesStats(s)
    } catch (err) {
      toast.error(err.message || 'Failed to load products')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (product) => {
    if (!confirm(`Delete "${product.name}"?`)) return
    try {
      await deletePOSProduct(product.id)
      setProducts(ps => ps.filter(p => p.id !== product.id))
      toast.success('Deleted')
    } catch (err) {
      toast.error(err.message || 'Delete failed')
    }
  }

  const filtered = products.filter(p => {
    if (search) {
      const q = search.toLowerCase()
      const hit = p.name.toLowerCase().includes(q) ||
        (p.name_ar && p.name_ar.includes(search)) ||
        (p.barcode && p.barcode.includes(search)) ||
        (p.sku && p.sku.toLowerCase().includes(q))
      if (!hit) return false
    }
    if (categoryFilter && p.category_id !== categoryFilter) return false
    return true
  })

  // Stats
  const lowStock = products.filter(p => p.track_inventory && parseFloat(p.stock_qty) <= parseFloat(p.low_stock_alert || 5)).length
  const withCost = products.filter(p => p.cost_price).length
  const margins = products.filter(p => p.cost_price && p.price && parseFloat(p.price) > 0)
    .map(p => (parseFloat(p.price) - parseFloat(p.cost_price)) / parseFloat(p.price) * 100)
  const avgMargin = margins.length > 0 ? (margins.reduce((s, m) => s + m, 0) / margins.length).toFixed(0) : null
  const totalRevenue = Object.values(salesStats).reduce((s, x) => s + (x.revenue || 0), 0)

  return (
    <Layout>
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="page-title flex items-center gap-2">
              <Layers size={20} className="text-noch-green" />
              Products
            </h1>
            <p className="text-zinc-500 text-sm mt-0.5">Central catalog — synced with POS, inventory & cost calculator</p>
          </div>
          <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2">
            <Plus size={14} /> Add Product
          </button>
        </div>

        {/* Branch tabs */}
        {branches.length > 0 && (
          <div className="flex gap-2 mb-5 flex-wrap">
            {branches.map(b => (
              <button key={b.id} onClick={() => setActiveBranch(b)}
                className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
                style={activeBranch?.id === b.id
                  ? { background: 'rgba(74,222,128,0.1)', color: '#4ADE80', border: '1px solid rgba(74,222,128,0.25)' }
                  : { background: 'var(--card)', color: 'var(--muted)', border: '1px solid var(--border)' }
                }
              >{b.name}</button>
            ))}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Total Products', value: products.length },
            { label: 'Low / Out of Stock', value: lowStock, warn: lowStock > 0 },
            { label: 'Cost Tracked', value: `${withCost} / ${products.length}` },
            { label: avgMargin ? 'Avg Gross Margin' : 'Revenue (period)', value: avgMargin ? `${avgMargin}%` : `${fmt(totalRevenue)} LYD`, green: !!avgMargin },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <p className="text-zinc-500 text-xs mb-1">{s.label}</p>
              <p className={`text-xl font-bold ${s.warn ? 'text-amber-400' : s.green ? 'text-noch-green' : 'text-white'}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap gap-3 mb-5">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
            <input value={search} onChange={e => setSearch(e.target.value)} className="input pl-9" placeholder="Search name, SKU, barcode…" />
          </div>
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="input w-auto min-w-36">
            <option value="">All categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="flex items-center gap-2 rounded-xl px-3 border text-sm" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
            <TrendingUp size={13} className="text-zinc-500 flex-shrink-0" />
            <span className="text-zinc-500 text-xs">Sales:</span>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="bg-transparent text-white text-xs outline-none" />
            <span className="text-zinc-600">→</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="bg-transparent text-white text-xs outline-none" />
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="text-center py-24 text-zinc-500">Loading products…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24">
            <ShoppingBag size={40} className="mx-auto text-zinc-700 mb-3" />
            <p className="text-zinc-400 font-medium">{products.length === 0 ? 'No products yet' : 'No matches'}</p>
            <p className="text-zinc-600 text-sm mt-1">{products.length === 0 ? 'Add your first product to get started' : 'Try a different search or filter'}</p>
            {products.length === 0 && <button onClick={() => setShowAdd(true)} className="btn-primary mt-4 text-sm">Add Product</button>}
          </div>
        ) : (
          <>
            <p className="text-zinc-600 text-xs mb-3">{filtered.length} product{filtered.length !== 1 ? 's' : ''}{search || categoryFilter ? ' (filtered)' : ''}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filtered.map(p => (
                <ProductCard
                  key={p.id}
                  product={p}
                  stats={salesStats[p.id]}
                  onEdit={setEditProduct}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Modal */}
      {(showAdd || editProduct) && (
        <ProductModal
          product={editProduct || null}
          categories={categories}
          branchId={activeBranch?.id}
          recipes={recipes}
          rates={rates}
          onSave={() => { setShowAdd(false); setEditProduct(null); load() }}
          onClose={() => { setShowAdd(false); setEditProduct(null) }}
        />
      )}
    </Layout>
  )
}
