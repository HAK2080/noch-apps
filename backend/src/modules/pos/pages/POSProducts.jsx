// POSProducts.jsx — Product & category management
// Route: /pos/:branchId/products

import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Edit2, Trash2, Package, Tag, ScanLine, X, Check, Image, Camera, Loader2, Globe, GlobeOff } from 'lucide-react'
import {
  getPOSBranch, getPOSProducts, getPOSCategories,
  createPOSProduct, updatePOSProduct, deletePOSProduct,
  createPOSCategory, updatePOSCategory, deletePOSCategory
} from '../lib/pos-supabase'
import BarcodeScanner from '../components/BarcodeScanner'
import Layout from '../../../components/Layout'
import { usePermission } from '../../../lib/usePermission'
import { supabase } from '../../../lib/supabase'
import { getRecipesForCost } from '../../../lib/supabase'
import toast from 'react-hot-toast'

const BLANK_PRODUCT = {
  name: '', name_ar: '', price: '', barcode: '', sku: '',
  description: '', category_id: '', track_inventory: false,
  stock_qty: '0', low_stock_alert: '5', is_active: true,
  image_url: '', recipe_id: '', cost: '', visible_on_website: true,
}

async function uploadProductImage(productId, file) {
  const ext = file.name.split('.').pop()
  const path = `pos-products/${productId}/${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('attachments').upload(path, file, { upsert: true, contentType: file.type })
  if (error) throw error
  const { data: urlData } = await supabase.storage.from('attachments').createSignedUrl(path, 31536000)
  return urlData.signedUrl
}

function ProductModal({ product, categories, branchId, onSave, onClose }) {
  const can = usePermission()
  const canViewCost = can('pos', 'view_cost')
  const fileInputRef = useRef(null)
  const [form, setForm] = useState(product || { ...BLANK_PRODUCT })
  const [saving, setSaving] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [recipes, setRecipes] = useState([])
  const isEdit = !!product?.id

  useEffect(() => {
    getRecipesForCost().then(setRecipes).catch(() => setRecipes([]))
  }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingImage(true)
    try {
      // Upload to temp path first (we'll get product id on save)
      const tempId = isEdit ? product.id : crypto.randomUUID()
      const url = await uploadProductImage(tempId, file)
      set('image_url', url)
      toast.success('Image ready')
    } catch (err) {
      toast.error(err.message || 'Upload failed')
    } finally {
      setUploadingImage(false)
    }
  }

  // When recipe is selected, auto-fill cost from recipe
  const handleRecipeChange = async (recipeId) => {
    set('recipe_id', recipeId)
    if (recipeId) {
      const recipe = recipes.find(r => r.id === recipeId)
      if (recipe?.cost_price) set('cost', recipe.cost_price)
    }
  }

  const handleSave = async () => {
    if (!form.name || !form.price) {
      toast.error('Name and price are required')
      return
    }
    setSaving(true)
    try {
      const data = {
        ...form,
        branch_id: branchId,
        price: parseFloat(form.price),
        stock_qty: parseFloat(form.stock_qty) || 0,
        low_stock_alert: parseFloat(form.low_stock_alert) || 5,
        category_id: form.category_id || null,
        recipe_id: form.recipe_id || null,
        cost: form.cost ? parseFloat(form.cost) : null,
        image_url: form.image_url || null,
      }
      if (isEdit) {
        await updatePOSProduct(product.id, data)
      } else {
        await createPOSProduct(data)
      }
      toast.success(isEdit ? 'Product updated' : 'Product created')
      onSave()
    } catch (err) {
      toast.error(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {showScanner && (
        <BarcodeScanner
          onScan={(result) => { set('barcode', result); setShowScanner(false) }}
          onClose={() => setShowScanner(false)}
        />
      )}
      <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-4">
        <div className="bg-noch-card border border-noch-border rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between p-5 border-b border-noch-border">
            <h2 className="text-white font-bold">{isEdit ? 'Edit Product' : 'Add Product'}</h2>
            <button onClick={onClose} className="text-noch-muted hover:text-white"><X size={18} /></button>
          </div>
          <div className="p-5 flex flex-col gap-3">
            {/* Product image */}
            <div className="flex items-center gap-3">
              <div className="relative group w-16 h-16 rounded-xl border border-noch-border bg-noch-dark flex items-center justify-center shrink-0 overflow-hidden">
                {form.image_url ? (
                  <img src={form.image_url} alt="Product" className="w-full h-full object-cover" />
                ) : (
                  <Image size={20} className="text-noch-muted" />
                )}
                {uploadingImage && <div className="absolute inset-0 bg-black/50 flex items-center justify-center"><Loader2 size={16} className="animate-spin text-white" /></div>}
                <label className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                  <Camera size={14} className="text-white" />
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                </label>
              </div>
              <div className="text-xs text-noch-muted">
                <p className="text-white font-medium text-sm mb-0.5">Product Image</p>
                <p>Click to upload · Shown in POS grid</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label block mb-1">Name (EN) *</label>
                <input value={form.name} onChange={e => set('name', e.target.value)} className="input w-full" placeholder="Cappuccino" />
              </div>
              <div>
                <label className="label block mb-1">Name (AR)</label>
                <input value={form.name_ar} onChange={e => set('name_ar', e.target.value)} className="input w-full text-right" dir="rtl" placeholder="كابوتشينو" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label block mb-1">Price (LYD) *</label>
                <input type="number" value={form.price} onChange={e => set('price', e.target.value)} className="input w-full" placeholder="8.500" step="0.001" min="0" />
              </div>
              <div>
                <label className="label block mb-1">Category</label>
                <select value={form.category_id} onChange={e => set('category_id', e.target.value)} className="input w-full">
                  <option value="">No category</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>

            {/* Recipe link */}
            <div>
              <label className="label block mb-1">Linked Recipe (optional)</label>
              <select value={form.recipe_id} onChange={e => handleRecipeChange(e.target.value)} className="input w-full">
                <option value="">No recipe linked</option>
                {recipes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>

            {/* Cost — only visible with pos.view_cost permission */}
            {canViewCost && (
              <div>
                <label className="label block mb-1">Cost (LYD)</label>
                <input type="number" value={form.cost} onChange={e => set('cost', e.target.value)} className="input w-full" placeholder="Auto-filled from recipe" step="0.001" />
              </div>
            )}

            <div>
              <label className="label block mb-1">Barcode</label>
              <div className="flex gap-2">
                <input value={form.barcode} onChange={e => set('barcode', e.target.value)} className="input flex-1" placeholder="1234567890123" />
                <button onClick={() => setShowScanner(true)} className="btn-secondary px-3">
                  <ScanLine size={14} />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.track_inventory}
                  onChange={e => set('track_inventory', e.target.checked)}
                  className="w-4 h-4 accent-noch-green"
                />
                <span className="text-white text-sm">Track inventory</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.visible_on_website ?? true}
                  onChange={e => set('visible_on_website', e.target.checked)}
                  className="w-4 h-4 accent-noch-green"
                />
                <span className="text-white text-sm flex items-center gap-1">
                  <Globe size={13} className="text-noch-green" /> Show on noch.cloud
                </span>
              </label>
            </div>

            {form.track_inventory && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label block mb-1">Stock Qty</label>
                  <input type="number" value={form.stock_qty} onChange={e => set('stock_qty', e.target.value)} className="input w-full" step="0.01" />
                </div>
                <div>
                  <label className="label block mb-1">Low Stock Alert</label>
                  <input type="number" value={form.low_stock_alert} onChange={e => set('low_stock_alert', e.target.value)} className="input w-full" step="0.01" />
                </div>
              </div>
            )}

            <div>
              <label className="label block mb-1">SKU</label>
              <input value={form.sku} onChange={e => set('sku', e.target.value)} className="input w-full" placeholder="CAP-001" />
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
                {saving ? 'Saving...' : (isEdit ? 'Update' : 'Create')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function CategoryModal({ branchId, onSave, onClose }) {
  const [name, setName] = useState('')
  const [nameAr, setNameAr] = useState('')
  const [color, setColor] = useState('#10b981')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name) return toast.error('Name required')
    setSaving(true)
    try {
      await createPOSCategory({ branch_id: branchId, name, name_ar: nameAr, color })
      toast.success('Category created')
      onSave()
    } catch (err) {
      toast.error(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-noch-card border border-noch-border rounded-2xl w-full max-w-xs p-5">
        <h2 className="text-white font-bold mb-4">New Category</h2>
        <label className="label block mb-1">Name (EN) *</label>
        <input value={name} onChange={e => setName(e.target.value)} className="input w-full mb-3" placeholder="Hot Drinks" />
        <label className="label block mb-1">Name (AR)</label>
        <input value={nameAr} onChange={e => setNameAr(e.target.value)} className="input w-full mb-3 text-right" dir="rtl" placeholder="المشروبات الساخنة" />
        <label className="label block mb-1">Color</label>
        <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-full h-10 rounded cursor-pointer mb-4" />
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
            {saving ? '...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function POSProducts() {
  const { branchId } = useParams()
  const navigate = useNavigate()

  const [branch, setBranch] = useState(null)
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('products') // products | categories
  const [search, setSearch] = useState('')
  const [editProduct, setEditProduct] = useState(null)
  const [showAddProduct, setShowAddProduct] = useState(false)
  const [showAddCategory, setShowAddCategory] = useState(false)

  const load = async () => {
    try {
      const [b, p, c] = await Promise.all([
        getPOSBranch(branchId),
        getPOSProducts(branchId),
        getPOSCategories(branchId),
      ])
      setBranch(b); setProducts(p); setCategories(c)
    } catch (err) {
      toast.error(err.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [branchId])

  const handleDeleteProduct = async (id) => {
    if (!confirm('Delete this product?')) return
    try {
      await deletePOSProduct(id)
      setProducts(p => p.filter(x => x.id !== id))
      toast.success('Product deleted')
    } catch (err) {
      toast.error(err.message || 'Delete failed')
    }
  }

  const handleDeleteCategory = async (id) => {
    if (!confirm('Delete this category?')) return
    try {
      await deletePOSCategory(id)
      setCategories(c => c.filter(x => x.id !== id))
      toast.success('Category deleted')
    } catch (err) {
      toast.error(err.message || 'Delete failed')
    }
  }

  const filtered = products.filter(p =>
    !search ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.name_ar && p.name_ar.includes(search)) ||
    (p.barcode && p.barcode.includes(search))
  )

  if (loading) return <Layout><p className="text-noch-muted text-center py-16">Loading...</p></Layout>

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate(`/pos/${branchId}/settings`)} className="p-2 text-noch-muted hover:text-white">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <h1 className="text-white font-bold text-xl flex items-center gap-2">
              <Package size={18} className="text-noch-green" />
              Products
            </h1>
            <p className="text-noch-muted text-sm">{branch?.name}</p>
          </div>
          <button
            onClick={() => tab === 'products' ? setShowAddProduct(true) : setShowAddCategory(true)}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <Plus size={14} />
            Add
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          {[
            { id: 'products', icon: Package, label: `Products (${products.length})` },
            { id: 'categories', icon: Tag, label: `Categories (${categories.length})` },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                tab === t.id
                  ? 'bg-noch-green/10 text-noch-green border border-noch-green/30'
                  : 'text-noch-muted border border-noch-border hover:text-white'
              }`}
            >
              <t.icon size={14} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Products tab */}
        {tab === 'products' && (
          <>
            <input
              type="text"
              placeholder="Search by name or barcode..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input w-full mb-4"
            />
            <div className="flex flex-col gap-2">
              {filtered.length === 0 ? (
                <div className="card text-center py-10 text-noch-muted">
                  <p>No products yet.</p>
                  <button onClick={() => setShowAddProduct(true)} className="btn-primary mt-3 text-sm">
                    Add first product
                  </button>
                </div>
              ) : (
                filtered.map(p => (
                  <div key={p.id} className="card flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium">{p.name}</p>
                      {p.name_ar && <p className="text-noch-muted text-xs" dir="rtl">{p.name_ar}</p>}
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-noch-green text-sm font-bold">{parseFloat(p.price).toFixed(3)} LYD</span>
                        {p.pos_categories && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: p.pos_categories.color + '40', border: `1px solid ${p.pos_categories.color}40` }}>
                            {p.pos_categories.name}
                          </span>
                        )}
                        {p.barcode && <span className="text-noch-muted text-xs font-mono">{p.barcode}</span>}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0 items-center">
                      {p.visible_on_website === false
                        ? <GlobeOff size={13} className="text-noch-muted" title="Hidden from website" />
                        : <Globe size={13} className="text-noch-green" title="Visible on noch.cloud" />
                      }
                      <button onClick={() => setEditProduct(p)} className="p-1.5 text-noch-muted hover:text-white">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => handleDeleteProduct(p.id)} className="p-1.5 text-noch-muted hover:text-red-400">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {/* Categories tab */}
        {tab === 'categories' && (
          <div className="flex flex-col gap-2">
            {categories.length === 0 ? (
              <div className="card text-center py-10 text-noch-muted">
                <p>No categories yet.</p>
                <button onClick={() => setShowAddCategory(true)} className="btn-primary mt-3 text-sm">
                  Add first category
                </button>
              </div>
            ) : (
              categories.map(c => (
                <div key={c.id} className="card flex items-center gap-3">
                  <div className="w-3 h-8 rounded-sm shrink-0" style={{ backgroundColor: c.color }} />
                  <div className="flex-1">
                    <p className="text-white font-medium">{c.name}</p>
                    {c.name_ar && <p className="text-noch-muted text-xs" dir="rtl">{c.name_ar}</p>}
                  </div>
                  <button onClick={() => handleDeleteCategory(c.id)} className="p-1.5 text-noch-muted hover:text-red-400">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {(showAddProduct || editProduct) && (
        <ProductModal
          product={editProduct || null}
          categories={categories}
          branchId={branchId}
          onSave={() => { setShowAddProduct(false); setEditProduct(null); load() }}
          onClose={() => { setShowAddProduct(false); setEditProduct(null) }}
        />
      )}

      {showAddCategory && (
        <CategoryModal
          branchId={branchId}
          onSave={() => { setShowAddCategory(false); load() }}
          onClose={() => setShowAddCategory(false)}
        />
      )}
    </Layout>
  )
}
