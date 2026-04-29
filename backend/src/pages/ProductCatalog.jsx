// ProductCatalog.jsx — Unified product management across POS, inventory & sales
// Route: /products (owner only)

import { useState, useEffect, useRef } from 'react'
import {
  Plus, Search, Edit2, Trash2, Upload, Package, TrendingUp, Layers, X,
  ScanLine, Image, ChevronDown, Eye, EyeOff, History, ShoppingBag,
  LayoutGrid, List as ListIcon, Wrench, Coffee, Box
} from 'lucide-react'
import Layout from '../components/Layout'
import toast from 'react-hot-toast'
import {
  getPOSBranches, getPOSProducts, getPOSCategories,
  createPOSProduct, updatePOSProduct, deletePOSProduct,
  getProductSalesStats, uploadProductImage,
} from '../modules/pos/lib/pos-supabase'
import { getRecipesForCost, getCurrencyRates, calcCostPerBaseUnit } from '../lib/supabase'
import { loadDraft, saveDraft, clearDraft, listDrafts, draftAge } from '../lib/drafts'
import { supabase } from '../lib/supabase'
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

// Bucket maps a category name to a top-level filter chip.
function bucketOf(categoryName) {
  const n = (categoryName || '').toLowerCase()
  if (!n) return 'other'
  if (n === 'tools' || /tool|equipment|machine|grinder|brewer/.test(n)) return 'tools'
  if (n === 'supplies' || /suppl|filter|cleaner|consumable/.test(n)) return 'supplies'
  if (/coffee|tea|drink|latte|cappucc|mocha|frapp|matcha|chocolate|smoothie|juice|water|milk|chai/.test(n)) return 'drinks'
  if (/cake|pastry|bakery|food|sandwich|pizza|salad|dessert/.test(n)) return 'food'
  return 'other'
}

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
  const draftKey = `product:${product?.id || 'new'}`
  const [form, setForm] = useState(() => product
    ? { ...BLANK, ...product, price: product.price ?? '', cost_price: product.cost_price ?? '', cost_recipe_id: product.cost_recipe_id ?? '' }
    : { ...BLANK }
  )
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [recipeCalc, setRecipeCalc] = useState(null)
  const [pendingDraft, setPendingDraft] = useState(() => loadDraft(draftKey))
  const [pendingFile, setPendingFile] = useState(null)
  const [pendingPreview, setPendingPreview] = useState(null)
  const dirtyRef = useRef(false)
  const fileRef = useRef()
  const isEdit = !!product?.id

  const set = (k, v) => { dirtyRef.current = true; setForm(f => ({ ...f, [k]: v })) }

  // Autosave draft on every user-driven change (24h localStorage)
  useEffect(() => {
    if (!dirtyRef.current) return
    saveDraft(draftKey, form, form.name || product?.name || 'New product')
  }, [form, draftKey, product?.name])

  const restoreDraft = () => {
    setForm({ ...BLANK, ...pendingDraft.form })
    dirtyRef.current = true
    setPendingDraft(null)
    toast.success('Draft restored')
  }
  const discardDraft = () => {
    clearDraft(draftKey)
    setPendingDraft(null)
  }
  const handleCancel = () => {
    clearDraft(draftKey)
    onClose()
  }

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
      // Whitelist payload to BLANK keys — strips joined relations
      // like `pos_categories` and system columns (id, created_at, etc.)
      // that get spread in when editing an existing product.
      const clean = Object.fromEntries(
        Object.keys(BLANK).map(k => [k, form[k]])
      )
      const payload = {
        ...clean,
        name: form.name.trim(),
        branch_id: branchId,
        price: parseFloat(form.price),
        cost_price: form.cost_price ? parseFloat(form.cost_price) : null,
        cost_recipe_id: form.cost_recipe_id || null,
        stock_qty: parseFloat(form.stock_qty) || 0,
        low_stock_alert: parseFloat(form.low_stock_alert) || 5,
        category_id: form.category_id || null,
      }
      if (isEdit) {
        await updatePOSProduct(product.id, payload)
      } else {
        const created = await createPOSProduct(payload)
        if (pendingFile && created?.id) {
          try {
            await uploadProductImage(created.id, pendingFile)
          } catch (uploadErr) {
            const msg = uploadErr.message || ''
            if (/row-level security|policy/i.test(msg)) {
              toast.error('Product saved. Image blocked by storage policy — run PRODUCT_IMAGES_RLS.sql.')
            } else if (/network|fetch/i.test(msg)) {
              toast.error('Product saved. Image upload failed: network error.')
            } else {
              toast.error(`Product saved. Image upload failed: ${msg || 'unknown'}`)
            }
          }
        }
      }
      clearDraft(draftKey)
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
    const preview = URL.createObjectURL(file)
    setPendingPreview(preview)

    if (isEdit) {
      setUploading(true)
      try {
        const url = await uploadProductImage(product.id, file)
        set('image_url', url)
        setPendingFile(null)
        setPendingPreview(null)
        toast.success('Photo uploaded')
      } catch (err) {
        const msg = err.message || ''
        if (/row-level security|policy/i.test(msg)) {
          toast.error('Upload blocked by storage policy — run PRODUCT_IMAGES_RLS.sql.')
        } else if (/network|fetch/i.test(msg)) {
          toast.error('Upload failed: network error. Try again.')
        } else {
          toast.error(msg || 'Upload failed')
        }
      } finally {
        setUploading(false)
      }
    } else {
      setPendingFile(file)
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
            <button onClick={handleCancel} className="text-zinc-500 hover:text-white"><X size={18} /></button>
          </div>

          <div className="p-5 flex flex-col gap-4 flex-1 overflow-y-auto">

            {/* Draft restore banner */}
            {pendingDraft && (
              <div className="rounded-xl px-3 py-2.5 flex items-center gap-3" style={{ background: 'rgba(245,146,46,0.12)', border: '1px solid rgba(245,146,46,0.4)' }}>
                <History size={16} className="text-amber-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium">Unsaved changes from {draftAge(pendingDraft.savedAt)}</p>
                  <p className="text-zinc-400 text-xs truncate">{pendingDraft.label}</p>
                </div>
                <button onClick={restoreDraft} className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{ background: '#F5922E', color: '#0B1020' }}>Restore</button>
                <button onClick={discardDraft} className="text-xs font-medium px-2 py-1.5 rounded-lg text-zinc-400 hover:text-white">Discard</button>
              </div>
            )}

            {/* Photo */}
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                {pendingPreview
                  ? <img src={pendingPreview} alt="" className="w-full h-full object-cover" />
                  : form.image_url
                    ? <img src={form.image_url} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center"><Image size={22} className="text-zinc-600" /></div>
                }
              </div>
              <div>
                <p className="text-white text-sm font-medium mb-1.5">Product Photo</p>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                <button onClick={() => fileRef.current?.click()} disabled={uploading} className="btn-secondary text-xs flex items-center gap-1.5 py-1.5">
                  <Upload size={11} /> {uploading ? 'Uploading…' : (form.image_url || pendingFile) ? 'Change photo' : 'Upload photo'}
                </button>
                <p className="text-zinc-600 text-[11px] mt-1">
                  {!isEdit && pendingFile
                    ? 'Will upload after Create'
                    : 'JPG, PNG, WebP · shown in POS terminal'}
                </p>
              </div>
            </div>

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
                <select
                  value={form.category_id}
                  onChange={e => {
                    const newId = e.target.value
                    const cat = categories.find(c => c.id === newId)
                    const b = bucketOf(cat?.name)
                    // Auto-default visibility: tools/supplies → website only;
                    // drinks/food/other → menu only. User can override after.
                    const defaults = (b === 'tools' || b === 'supplies')
                      ? { visible_on_website: true,  visible_on_menu: false }
                      : { visible_on_website: false, visible_on_menu: true }
                    dirtyRef.current = true
                    setForm(f => ({ ...f, category_id: newId, ...defaults }))
                  }}
                  className="input"
                >
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
              <button onClick={handleCancel} className="btn-secondary flex-1">Cancel</button>
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
  const [drafts, setDrafts] = useState(() => listDrafts('product'))
  const [syncing, setSyncing] = useState(false)
  const [syncReport, setSyncReport] = useState(null)
  const [importing, setImporting] = useState(false)
  const [importReport, setImportReport] = useState(null)
  const [bucket, setBucket] = useState('all')        // all | drinks | food | tools | supplies | other
  const [viewMode, setViewMode] = useState('grouped') // grouped | list
  const [collapsed, setCollapsed] = useState({})     // category_id -> bool

  const handleSyncImages = async () => {
    if (syncing) return
    if (!confirm('Auto-source product images from bloomly.odoo.com?\n\nWill only update products that currently have NO image. Match score threshold 0.7. May take ~30s.')) return
    setSyncing(true)
    setSyncReport(null)
    try {
      const { data, error } = await supabase.functions.invoke('bloomly-image-sync', { body: {} })
      if (error) throw error
      if (!data?.ok) throw new Error(data?.error || 'Sync failed')
      setSyncReport(data)
      toast.success(`Applied ${data.summary.applied} · Unsure ${data.summary.unsure} · No match ${data.summary.no_match}`)
      load()
    } catch (err) {
      toast.error(err.message || 'Image sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const handleImportFromBloomly = async () => {
    if (importing) return
    if (!confirm('Import all bloomly.odoo.com products as new products in this branch?\n\nSkips any name that already exists. New rows get price + image from bloomly, marked visible on website. May take 1-2 minutes.')) return
    setImporting(true)
    setImportReport(null)
    try {
      const { data, error } = await supabase.functions.invoke('bloomly-import-products', {
        body: { branchId: activeBranch?.id },
      })
      if (error) throw error
      if (!data?.ok) throw new Error(data?.error || 'Import failed')
      setImportReport(data)
      toast.success(`Imported ${data.summary.imported} · Duplicates ${data.summary.duplicates} · No price ${data.summary.no_price} · Errors ${data.summary.errors}`)
      load()
    } catch (err) {
      toast.error(err.message || 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  const refreshDrafts = () => setDrafts(listDrafts('product'))

  const resumeDraft = (draft) => {
    const id = draft.key.replace(/^product:/, '')
    if (id === 'new') { setShowAdd(true); return }
    const p = products.find(x => x.id === id)
    if (p) setEditProduct(p)
    else toast.error('Product not found in this branch')
  }
  const discardOneDraft = (key) => { clearDraft(key); refreshDrafts() }
  const discardAllDrafts = () => { drafts.forEach(d => clearDraft(d.key)); refreshDrafts() }

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
    if (bucket !== 'all' && bucketOf(p.pos_categories?.name) !== bucket) return false
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
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={handleImportFromBloomly}
              disabled={importing}
              className="btn-secondary flex items-center gap-2 disabled:opacity-60"
              title="Import all bloomly.odoo.com products as new products"
            >
              <Upload size={14} className={importing ? 'animate-pulse' : ''} />
              {importing ? 'Importing...' : 'Import bloomly'}
            </button>
            <button
              onClick={handleSyncImages}
              disabled={syncing}
              className="btn-secondary flex items-center gap-2 disabled:opacity-60"
              title="Auto-source images for existing products from bloomly.odoo.com"
            >
              <Image size={14} className={syncing ? 'animate-pulse' : ''} />
              {syncing ? 'Syncing...' : 'Sync images'}
            </button>
            <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2">
              <Plus size={14} /> Add Product
            </button>
          </div>
        </div>

        {importReport && (
          <div className="mb-4 rounded-xl px-4 py-3" style={{ background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.25)' }}>
            <div className="flex items-center justify-between gap-3 mb-2">
              <p className="text-white text-sm font-medium">
                Bloomly import: imported {importReport.summary.imported} · duplicates {importReport.summary.duplicates} · no price {importReport.summary.no_price} · errors {importReport.summary.errors}
              </p>
              <button onClick={() => setImportReport(null)} className="text-noch-muted hover:text-white"><X size={14} /></button>
            </div>
            {importReport.summary.errors > 0 && (
              <details className="text-xs text-noch-muted">
                <summary className="cursor-pointer">Show errors ({importReport.summary.errors})</summary>
                <ul className="mt-2 space-y-1">
                  {importReport.decisions.filter(d => d.action === 'error').slice(0, 30).map((d, i) => (
                    <li key={i}>• <span className="text-white">{d.name}</span> — {d.error}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        {syncReport && (
          <div className="mb-4 rounded-xl px-4 py-3" style={{ background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.25)' }}>
            <div className="flex items-center justify-between gap-3 mb-2">
              <p className="text-white text-sm font-medium">
                Image sync: applied {syncReport.summary.applied} · unsure {syncReport.summary.unsure} · no match {syncReport.summary.no_match} · errors {syncReport.summary.errors}
              </p>
              <button onClick={() => setSyncReport(null)} className="text-noch-muted hover:text-white"><X size={14} /></button>
            </div>
            {syncReport.summary.unsure > 0 && (
              <details className="text-xs text-noch-muted">
                <summary className="cursor-pointer">Show unsure matches ({syncReport.summary.unsure})</summary>
                <ul className="mt-2 space-y-1">
                  {syncReport.decisions.filter(d => d.action === 'unsure').slice(0, 50).map(d => (
                    <li key={d.product_id}>• <span className="text-white">{d.product_name}</span> ↔ {d.best_match} ({Math.round((d.score || 0) * 100)}%)</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        {/* Unsaved drafts banner */}
        {drafts.length > 0 && !showAdd && !editProduct && (
          <div className="mb-4 rounded-xl px-4 py-3" style={{ background: 'rgba(245,146,46,0.08)', border: '1px solid rgba(245,146,46,0.35)' }}>
            <div className="flex items-center gap-2 mb-2">
              <History size={14} className="text-amber-400" />
              <p className="text-white text-sm font-semibold">You have {drafts.length} unsaved draft{drafts.length > 1 ? 's' : ''}</p>
              <button onClick={discardAllDrafts} className="ml-auto text-xs text-zinc-400 hover:text-white">Discard all</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {drafts.map(d => (
                <div key={d.key} className="flex items-center gap-2 rounded-lg px-3 py-1.5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <span className="text-white text-xs font-medium">{d.label}</span>
                  <span className="text-zinc-500 text-[11px]">{draftAge(d.savedAt)}</span>
                  <button onClick={() => resumeDraft(d)} className="text-[11px] font-bold px-2 py-0.5 rounded" style={{ background: '#F5922E', color: '#0B1020' }}>Resume</button>
                  <button onClick={() => discardOneDraft(d.key)} className="text-zinc-500 hover:text-white"><X size={12} /></button>
                </div>
              ))}
            </div>
          </div>
        )}

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

        {/* Bucket chips */}
        {(() => {
          const bucketCounts = products.reduce((acc, p) => {
            const b = bucketOf(p.pos_categories?.name)
            acc[b] = (acc[b] || 0) + 1
            return acc
          }, {})
          const chipDefs = [
            { key: 'all', label: 'All', icon: Layers, count: products.length },
            { key: 'drinks', label: 'Drinks', icon: Coffee, count: bucketCounts.drinks || 0 },
            { key: 'food', label: 'Food', icon: ShoppingBag, count: bucketCounts.food || 0 },
            { key: 'tools', label: 'Tools', icon: Wrench, count: bucketCounts.tools || 0 },
            { key: 'supplies', label: 'Supplies', icon: Box, count: bucketCounts.supplies || 0 },
            { key: 'other', label: 'Other', icon: Package, count: bucketCounts.other || 0 },
          ].filter(c => c.key === 'all' || c.count > 0)
          return (
            <div className="flex gap-2 flex-wrap mb-3">
              {chipDefs.map(c => {
                const active = bucket === c.key
                const Icon = c.icon
                return (
                  <button
                    key={c.key}
                    onClick={() => setBucket(c.key)}
                    className="px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 border"
                    style={active
                      ? { background: 'rgba(74,222,128,0.1)', color: '#4ADE80', borderColor: 'rgba(74,222,128,0.3)' }
                      : { background: 'var(--card)', color: 'var(--muted)', borderColor: 'var(--border)' }
                    }
                  >
                    <Icon size={12} /> {c.label} <span className="opacity-60">({c.count})</span>
                  </button>
                )
              })}
            </div>
          )
        })()}

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
          <div className="flex items-center gap-1 rounded-xl border p-1" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
            <button
              onClick={() => setViewMode('grouped')}
              className="px-2 py-1 rounded-lg text-xs font-medium flex items-center gap-1"
              style={viewMode === 'grouped' ? { background: 'rgba(74,222,128,0.12)', color: '#4ADE80' } : { color: 'var(--muted)' }}
            ><LayoutGrid size={12} /> Grid</button>
            <button
              onClick={() => setViewMode('list')}
              className="px-2 py-1 rounded-lg text-xs font-medium flex items-center gap-1"
              style={viewMode === 'list' ? { background: 'rgba(74,222,128,0.12)', color: '#4ADE80' } : { color: 'var(--muted)' }}
            ><ListIcon size={12} /> List</button>
          </div>
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
            <p className="text-zinc-600 text-xs mb-3">{filtered.length} product{filtered.length !== 1 ? 's' : ''}{search || categoryFilter || bucket !== 'all' ? ' (filtered)' : ''}</p>

            {viewMode === 'list' ? (
              <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                <table className="w-full text-sm">
                  <thead style={{ background: 'var(--surface)' }}>
                    <tr className="text-zinc-500 text-xs">
                      <th className="text-left px-3 py-2 font-medium w-12">Img</th>
                      <th className="text-left px-3 py-2 font-medium">Name</th>
                      <th className="text-left px-3 py-2 font-medium">Category</th>
                      <th className="text-right px-3 py-2 font-medium">Price</th>
                      <th className="text-right px-3 py-2 font-medium">Stock</th>
                      <th className="px-3 py-2 w-16"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(p => (
                      <tr
                        key={p.id}
                        onClick={() => setEditProduct(p)}
                        className="cursor-pointer border-t hover:bg-white/5 transition-colors"
                        style={{ borderColor: 'var(--border)' }}
                      >
                        <td className="px-3 py-2">
                          {p.image_url ? (
                            <img src={p.image_url} alt="" className="w-9 h-9 rounded object-cover" />
                          ) : (
                            <div className="w-9 h-9 rounded flex items-center justify-center" style={{ background: 'var(--surface)' }}>
                              <ShoppingBag size={14} className="text-zinc-600" />
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <p className="text-white font-medium">{p.name}</p>
                          {p.name_ar && <p className="text-zinc-500 text-xs" dir="rtl">{p.name_ar}</p>}
                        </td>
                        <td className="px-3 py-2 text-zinc-400">{p.pos_categories?.name || '—'}</td>
                        <td className="px-3 py-2 text-right text-noch-green font-semibold">{fmt(p.price)}</td>
                        <td className="px-3 py-2 text-right">
                          {p.track_inventory ? <StockBadge qty={p.stock_qty} threshold={p.low_stock_alert} track /> : <span className="text-zinc-600 text-xs">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={e => { e.stopPropagation(); handleDelete(p) }}
                            className="text-red-400 hover:text-red-300 p-1"
                            title="Delete"
                          ><Trash2 size={13} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="space-y-6">
                {(() => {
                  // Group filtered by category id (uncategorized as "Uncategorized")
                  const groups = new Map()
                  for (const p of filtered) {
                    const k = p.category_id || 'uncat'
                    if (!groups.has(k)) {
                      groups.set(k, {
                        id: k,
                        name: p.pos_categories?.name || 'Uncategorized',
                        color: p.pos_categories?.color || '#999',
                        items: [],
                      })
                    }
                    groups.get(k).items.push(p)
                  }
                  const ordered = Array.from(groups.values()).sort((a, b) => b.items.length - a.items.length)
                  return ordered.map(g => {
                    const isCollapsed = !!collapsed[g.id]
                    return (
                      <div key={g.id}>
                        <button
                          onClick={() => setCollapsed(c => ({ ...c, [g.id]: !c[g.id] }))}
                          className="w-full flex items-center gap-2 mb-3 group"
                        >
                          <ChevronDown
                            size={14}
                            className="text-zinc-500 transition-transform"
                            style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
                          />
                          <span
                            className="text-xs font-semibold px-2 py-0.5 rounded-full"
                            style={{ background: g.color + '28', color: g.color }}
                          >
                            {g.name}
                          </span>
                          <span className="text-zinc-600 text-xs">{g.items.length}</span>
                          <div className="flex-1 h-px ml-2" style={{ background: 'var(--border)' }} />
                        </button>
                        {!isCollapsed && (
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                            {g.items.map(p => (
                              <ProductCard
                                key={p.id}
                                product={p}
                                stats={salesStats[p.id]}
                                onEdit={setEditProduct}
                                onDelete={handleDelete}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })
                })()}
              </div>
            )}
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
          onSave={() => { setShowAdd(false); setEditProduct(null); refreshDrafts(); load() }}
          onClose={() => { setShowAdd(false); setEditProduct(null); refreshDrafts() }}
        />
      )}
    </Layout>
  )
}
