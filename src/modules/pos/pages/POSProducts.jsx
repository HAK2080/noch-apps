// POSProducts.jsx — Product & category management
// Route: /pos/:branchId/products

import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Edit2, Trash2, Package, Tag, ScanLine, X, Check, Globe, Star, GripVertical, LayoutList, Grid2X2 } from 'lucide-react'
import {
  getPOSBranch, getPOSProducts, getPOSCategories,
  createPOSProduct, updatePOSProduct, deletePOSProduct,
  createPOSCategory, updatePOSCategory, deletePOSCategory,
  uploadProductImage,
} from '../lib/pos-supabase'
import BarcodeScanner from '../components/BarcodeScanner'
import Layout from '../../../components/Layout'
import toast from 'react-hot-toast'

const BLANK_PRODUCT = {
  name: '', name_ar: '', price: '', barcode: '', sku: '',
  description: '', category_id: '', track_inventory: false,
  stock_qty: '0', low_stock_alert: '5', is_active: true,
  visible_on_menu: false, featured: false,
  image_url: '', menu_description: '', menu_description_ar: '', menu_sort: 100,
}


// Columns that come from JOIN queries — never send these back to PostgREST
const JOINED_FIELDS = ['pos_categories', 'pos_branches']

function ProductModal({ product, categories, branchId, onSave, onClose }) {
  const [form, setForm] = useState(product || { ...BLANK_PRODUCT })
  const [saving, setSaving] = useState(false)
  const [showScanner, setShowScanner] = useState(false)
  const [uploadingImg, setUploadingImg] = useState(false)
  const [pendingFile, setPendingFile] = useState(null)   // file waiting for new-product ID
  const [pendingPreview, setPendingPreview] = useState(null)
  const imgInputRef = useRef(null)
  const isEdit = !!product?.id

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Handle image file selected from disk
  const handleFileSelected = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const preview = URL.createObjectURL(file)
    setPendingPreview(preview)

    if (isEdit) {
      // Existing product: upload immediately
      setUploadingImg(true)
      try {
        const url = await uploadProductImage(product.id, file)
        set('image_url', url)
        setPendingFile(null)
        setPendingPreview(null)
        toast.success('Image uploaded')
      } catch (err) {
        toast.error(err.message || 'Upload failed')
      } finally {
        setUploadingImg(false)
      }
    } else {
      // New product: store file, upload after create
      setPendingFile(file)
      set('image_url', '')   // clear any URL text while file is pending
    }
  }

  const handleSave = async () => {
    if (!form.name || !form.price) {
      toast.error('Name and price are required')
      return
    }
    setSaving(true)
    try {
      // Strip joined/computed fields — PostgREST rejects them
      const stripped = Object.fromEntries(
        Object.entries(form).filter(([k]) => !JOINED_FIELDS.includes(k))
      )
      const data = {
        ...stripped,
        branch_id: branchId,
        price: parseFloat(form.price),
        stock_qty: parseFloat(form.stock_qty) || 0,
        low_stock_alert: parseFloat(form.low_stock_alert) || 5,
        category_id: form.category_id || null,
      }
      if (isEdit) {
        await updatePOSProduct(product.id, data)
      } else {
        const created = await createPOSProduct(data)
        // Upload pending image for new product
        if (pendingFile && created?.id) {
          try {
            await uploadProductImage(created.id, pendingFile)
          } catch {
            toast.error('Product saved but image upload failed')
          }
        }
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

            <div>
              <label className="label block mb-1">Barcode</label>
              <div className="flex gap-2">
                <input value={form.barcode} onChange={e => set('barcode', e.target.value)} className="input flex-1" placeholder="1234567890123" />
                <button onClick={() => setShowScanner(true)} className="btn-secondary px-3">
                  <ScanLine size={14} />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.track_inventory}
                  onChange={e => set('track_inventory', e.target.checked)}
                  className="w-4 h-4 accent-noch-green"
                />
                <span className="text-white text-sm">Track inventory</span>
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

            {/* ── Customer Menu ── */}
            <div className="border-t border-noch-border pt-3 mt-1">
              <p className="text-noch-muted text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Globe size={12} /> Customer Menu
              </p>

              <div className="flex items-center gap-4 mb-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!form.visible_on_menu} onChange={e => set('visible_on_menu', e.target.checked)} className="w-4 h-4 accent-noch-green" />
                  <span className="text-white text-sm">Show on menu</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!form.featured} onChange={e => set('featured', e.target.checked)} className="w-4 h-4 accent-yellow-400" />
                  <span className="text-white text-sm flex items-center gap-1"><Star size={12} className="text-yellow-400" />Featured</span>
                </label>
              </div>

              {form.visible_on_menu && (
                <>
                  <div className="mb-3">
                    <label className="label block mb-1">Product Image</label>
                    {/* Image preview */}
                    {(pendingPreview || form.image_url) && (
                      <div className="relative mb-2">
                        <img
                          src={pendingPreview || form.image_url}
                          alt=""
                          className="h-36 w-full object-cover rounded-lg border border-noch-border"
                          onError={e => e.target.style.display='none'}
                        />
                        {uploadingImg && (
                          <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
                            <span className="text-white text-sm animate-pulse">Uploading…</span>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => { set('image_url', ''); setPendingFile(null); setPendingPreview(null) }}
                          className="absolute top-1 right-1 bg-black/60 hover:bg-red-600 text-white rounded-full p-1 transition-colors"
                          title="Remove image"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    )}
                    {/* Upload from device */}
                    <input
                      ref={imgInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileSelected}
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => imgInputRef.current?.click()}
                        disabled={uploadingImg}
                        className="btn-secondary text-xs flex items-center gap-1.5 px-3 py-2"
                      >
                        📷 {uploadingImg ? 'Uploading…' : (pendingFile ? 'Change photo' : 'Upload photo')}
                      </button>
                      <span className="text-noch-muted text-xs self-center">or paste URL:</span>
                    </div>
                    <input
                      value={pendingFile ? '' : (form.image_url || '')}
                      onChange={e => { set('image_url', e.target.value); setPendingFile(null); setPendingPreview(null) }}
                      className="input w-full mt-2"
                      placeholder="https://..."
                      disabled={!!pendingFile}
                    />
                    {pendingFile && !isEdit && (
                      <p className="text-noch-muted text-xs mt-1">📎 {pendingFile.name} — will upload when product is created</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="label block mb-1">Menu description (EN)</label>
                      <textarea value={form.menu_description || ''} onChange={e => set('menu_description', e.target.value)} className="input w-full resize-none" rows={2} placeholder="Rich espresso with velvety milk foam" />
                    </div>
                    <div>
                      <label className="label block mb-1">Menu description (AR)</label>
                      <textarea value={form.menu_description_ar || ''} onChange={e => set('menu_description_ar', e.target.value)} className="input w-full resize-none text-right" dir="rtl" rows={2} placeholder="إسبريسو غني مع رغوة الحليب" />
                    </div>
                  </div>

                  <div>
                    <label className="label block mb-1">Sort order (lower = first)</label>
                    <input type="number" value={form.menu_sort ?? 100} onChange={e => set('menu_sort', parseInt(e.target.value) || 100)} className="input w-32" min="0" step="10" />
                  </div>
                </>
              )}
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
  const [filterCat, setFilterCat] = useState('all')   // 'all' | category.id
  const [filterVis, setFilterVis] = useState('all')   // 'all' | 'menu' | 'pos'
  const [compact, setCompact] = useState(false)
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

  // ── Drag-and-drop sort (menu-visible items only) ────────────────────────────
  const dragItem = useRef(null)
  const dragOverItem = useRef(null)
  const [dragOverIdx, setDragOverIdx] = useState(null)
  const [savingOrder, setSavingOrder] = useState(false)

  const handleDragStart = (e, idx) => {
    dragItem.current = idx
    e.dataTransfer.effectAllowed = 'move'
  }
  const handleDragOver = (e, idx) => {
    e.preventDefault()
    if (dragOverItem.current !== idx) {
      dragOverItem.current = idx
      setDragOverIdx(idx)
    }
  }
  const handleDragEnd = () => setDragOverIdx(null)
  const handleDrop = async (e, idx) => {
    e.preventDefault()
    setDragOverIdx(null)
    const from = dragItem.current
    dragItem.current = null; dragOverItem.current = null
    if (from === null || from === idx) return

    const newOrder = [...menuItems]
    const [moved] = newOrder.splice(from, 1)
    newOrder.splice(idx, 0, moved)
    const updates = newOrder.map((p, i) => ({ id: p.id, menu_sort: (i + 1) * 10 }))

    // Optimistic update
    setProducts(prev => prev.map(p => {
      const u = updates.find(x => x.id === p.id)
      return u ? { ...p, menu_sort: u.menu_sort } : p
    }))

    setSavingOrder(true)
    try {
      await Promise.all(updates.map(u => updatePOSProduct(u.id, { menu_sort: u.menu_sort })))
      toast.success('Menu order saved')
    } catch {
      toast.error('Failed to save order')
      load()
    } finally {
      setSavingOrder(false)
    }
  }

  const searchMatch = p =>
    !search ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.name_ar && p.name_ar.includes(search)) ||
    (p.barcode && p.barcode.includes(search))

  const catMatch = p =>
    filterCat === 'all' ? true :
    filterCat === '__none__' ? !p.category_id :
    p.category_id === filterCat

  // Menu-visible products in sort order (draggable)
  const menuItems = useMemo(() =>
    products
      .filter(p => p.visible_on_menu && searchMatch(p) && catMatch(p))
      .sort((a, b) => (a.menu_sort ?? 100) - (b.menu_sort ?? 100)),
    [products, search, filterCat]
  )
  // Non-menu products (not draggable)
  const nonMenuItems = useMemo(() =>
    products
      .filter(p => !p.visible_on_menu && searchMatch(p) && catMatch(p))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [products, search, filterCat]
  )

  // Apply visibility filter
  const visMenuItems    = filterVis === 'pos'  ? [] : menuItems
  const visNonMenuItems = filterVis === 'menu' ? [] : nonMenuItems
  const filtered = [...visMenuItems, ...visNonMenuItems]

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
            {/* Search + compact toggle */}
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                placeholder="Search by name or barcode..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="input flex-1"
              />
              <button
                onClick={() => setCompact(c => !c)}
                title={compact ? 'Normal view' : 'Compact view'}
                className={`p-2 rounded-xl border transition-all ${
                  compact
                    ? 'bg-noch-green/10 text-noch-green border-noch-green/30'
                    : 'text-noch-muted border-noch-border hover:text-white'
                }`}
              >
                {compact ? <LayoutList size={16} /> : <Grid2X2 size={16} />}
              </button>
            </div>

            {/* Visibility filter */}
            <div className="flex gap-1.5 mb-3">
              {[
                { id: 'all',  label: `All (${products.length})` },
                { id: 'menu', label: `Menu (${products.filter(p => p.visible_on_menu).length})` },
                { id: 'pos',  label: `POS only (${products.filter(p => !p.visible_on_menu).length})` },
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setFilterVis(opt.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    filterVis === opt.id
                      ? 'bg-noch-green/10 text-noch-green border-noch-green/30'
                      : 'text-noch-muted border-noch-border hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Category filter pills */}
            {categories.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 scrollbar-none">
                <button
                  onClick={() => setFilterCat('all')}
                  className={`px-3 py-1 rounded-full text-xs font-medium border whitespace-nowrap transition-all flex-shrink-0 ${
                    filterCat === 'all'
                      ? 'bg-noch-green text-black border-noch-green'
                      : 'text-noch-muted border-noch-border hover:text-white'
                  }`}
                >
                  All categories
                </button>
                {categories.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setFilterCat(filterCat === c.id ? 'all' : c.id)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border whitespace-nowrap transition-all flex-shrink-0 ${
                      filterCat === c.id
                        ? 'text-black border-transparent'
                        : 'text-noch-muted border-noch-border hover:text-white'
                    }`}
                    style={filterCat === c.id ? { background: c.color, borderColor: c.color } : {}}
                  >
                    {c.name}
                  </button>
                ))}
                <button
                  onClick={() => setFilterCat('__none__')}
                  className={`px-3 py-1 rounded-full text-xs font-medium border whitespace-nowrap transition-all flex-shrink-0 ${
                    filterCat === '__none__'
                      ? 'bg-noch-muted/30 text-white border-noch-muted/30'
                      : 'text-noch-muted border-noch-border hover:text-white'
                  }`}
                >
                  Uncategorized
                </button>
              </div>
            )}

            {/* Count */}
            {filtered.length > 0 && (
              <p className="text-noch-muted text-xs mb-2">
                {filtered.length} product{filtered.length !== 1 ? 's' : ''}
                {filtered.length < products.length ? ` of ${products.length}` : ''}
                {filterVis === 'menu' || visMenuItems.length > 0
                  ? <> · <GripVertical size={10} className="inline-block" /> drag to reorder menu items
                      {savingOrder && <span className="text-noch-green animate-pulse"> · saving…</span>}
                    </>
                  : null}
              </p>
            )}

            {filtered.length === 0 ? (
              <div className="card text-center py-10 text-noch-muted">
                {products.length === 0 ? (
                  <>
                    <p>No products yet.</p>
                    <button onClick={() => setShowAddProduct(true)} className="btn-primary mt-3 text-sm">Add first product</button>
                  </>
                ) : (
                  <p>No products match the current filters.</p>
                )}
              </div>
            ) : (
              <>
                {/* ── Menu-visible: draggable ── */}
                {visMenuItems.length > 0 && (
                  <div className={`flex flex-col mb-3 ${compact ? 'gap-0.5' : 'gap-2'}`}>
                    {visMenuItems.map((p, idx) => (
                      <div
                        key={p.id}
                        draggable
                        onDragStart={e => handleDragStart(e, idx)}
                        onDragOver={e => handleDragOver(e, idx)}
                        onDragEnd={handleDragEnd}
                        onDrop={e => handleDrop(e, idx)}
                        className={`card flex items-center gap-2 transition-all ${compact ? 'py-2 px-3' : 'gap-3'} ${
                          dragOverIdx === idx ? 'ring-2 ring-noch-green ring-offset-1 ring-offset-noch-bg' : ''
                        }`}
                      >
                        <div className="cursor-grab active:cursor-grabbing text-noch-muted hover:text-white shrink-0 touch-none select-none">
                          <GripVertical size={compact ? 14 : 16} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`flex items-center gap-2 ${compact ? '' : 'mb-0.5'}`}>
                            <p className={`text-white font-medium ${compact ? 'text-sm' : ''}`}>{p.name}</p>
                            {compact && p.name_ar && <p className="text-noch-muted text-xs" dir="rtl">{p.name_ar}</p>}
                          </div>
                          {!compact && p.name_ar && <p className="text-noch-muted text-xs" dir="rtl">{p.name_ar}</p>}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-noch-green font-bold ${compact ? 'text-xs' : 'text-sm'}`}>{parseFloat(p.price).toFixed(3)} LYD</span>
                            {!compact && p.pos_categories && (
                              <span className="text-xs px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: p.pos_categories.color + '40', border: `1px solid ${p.pos_categories.color}40` }}>
                                {p.pos_categories.name}
                              </span>
                            )}
                            {compact && p.pos_categories && (
                              <span className="text-[10px] opacity-60">{p.pos_categories.name}</span>
                            )}
                            {!compact && p.barcode && <span className="text-noch-muted text-xs font-mono">{p.barcode}</span>}
                            {!compact && <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30 flex items-center gap-0.5">
                              <Globe size={9} />Menu{p.featured ? ' ★' : ''}
                            </span>}
                            {compact && p.featured && <span className="text-yellow-400 text-xs">★</span>}
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button onClick={() => setEditProduct(p)} className="p-1.5 text-noch-muted hover:text-white">
                            <Edit2 size={compact ? 12 : 14} />
                          </button>
                          <button onClick={() => handleDeleteProduct(p.id)} className="p-1.5 text-noch-muted hover:text-red-400">
                            <Trash2 size={compact ? 12 : 14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── Non-menu products ── */}
                {visNonMenuItems.length > 0 && (
                  <>
                    {visMenuItems.length > 0 && (
                      <p className="text-noch-muted text-xs uppercase tracking-wider mb-2 mt-1 border-t border-noch-border pt-3">
                        POS only — not on customer menu
                      </p>
                    )}
                    <div className={`flex flex-col ${compact ? 'gap-0.5' : 'gap-2'}`}>
                      {visNonMenuItems.map(p => (
                        <div key={p.id} className={`card flex items-center gap-2 ${compact ? 'py-2 px-3' : 'gap-3'}`}>
                          {/* spacer to align with draggable rows */}
                          <div className="w-4 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className={`text-white font-medium ${compact ? 'text-sm' : ''}`}>{p.name}</p>
                              {compact && p.name_ar && <p className="text-noch-muted text-xs" dir="rtl">{p.name_ar}</p>}
                            </div>
                            {!compact && p.name_ar && <p className="text-noch-muted text-xs" dir="rtl">{p.name_ar}</p>}
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-noch-green font-bold ${compact ? 'text-xs' : 'text-sm'}`}>{parseFloat(p.price).toFixed(3)} LYD</span>
                              {!compact && p.pos_categories && (
                                <span className="text-xs px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: p.pos_categories.color + '40', border: `1px solid ${p.pos_categories.color}40` }}>
                                  {p.pos_categories.name}
                                </span>
                              )}
                              {compact && p.pos_categories && (
                                <span className="text-[10px] opacity-60">{p.pos_categories.name}</span>
                              )}
                              {!compact && p.barcode && <span className="text-noch-muted text-xs font-mono">{p.barcode}</span>}
                            </div>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button onClick={() => setEditProduct(p)} className="p-1.5 text-noch-muted hover:text-white">
                              <Edit2 size={compact ? 12 : 14} />
                            </button>
                            <button onClick={() => handleDeleteProduct(p.id)} className="p-1.5 text-noch-muted hover:text-red-400">
                              <Trash2 size={compact ? 12 : 14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
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
