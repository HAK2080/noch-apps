// ProductModal.jsx — Add/edit product form, extracted from POSProducts.jsx
import { useState, useRef } from 'react'
import { ScanLine, X, Globe, Star } from 'lucide-react'
import { createPOSProduct, updatePOSProduct, uploadProductImage } from '../lib/pos-supabase'
import BarcodeScanner from '../components/BarcodeScanner'
import toast from 'react-hot-toast'

export const BLANK_PRODUCT = {
  name: '', name_ar: '', price: '', barcode: '', sku: '',
  description: '', category_id: '', track_inventory: false,
  stock_qty: '0', low_stock_alert: '5', is_active: true,
  visible_on_menu: false, visible_on_customer_menu: true, visible_on_website: true, featured: false,
  image_url: '', menu_description: '', menu_description_ar: '', menu_sort: 100,
  show_description_on_menu: true, show_description_on_website: true,
  secondary_category_ids: [],
}

// Columns that come from JOIN queries — never send these back to PostgREST
const JOINED_FIELDS = ['pos_categories', 'pos_branches']

export default function ProductModal({ product, categories, branchId, onSave, onClose }) {
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
                <label className="label block mb-1">Primary category</label>
                <select value={form.category_id} onChange={e => set('category_id', e.target.value)} className="input w-full">
                  <option value="">No category</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>

            {/* Secondary categories — product appears in multiple sections */}
            {categories.filter(c => c.id !== form.category_id).length > 0 && (
              <div>
                <label className="label block mb-1">Also show in <span className="text-noch-muted text-xs">(optional — extra categories on customer menu)</span></label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {categories.filter(c => c.id !== form.category_id).map(c => {
                    const checked = (form.secondary_category_ids || []).includes(c.id)
                    return (
                      <label key={c.id} className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium cursor-pointer border transition-colors ${checked ? 'bg-noch-green/20 border-noch-green text-noch-green' : 'bg-noch-dark border-noch-border text-noch-muted hover:text-white'}`}>
                        <input
                          type="checkbox"
                          className="hidden"
                          checked={checked}
                          onChange={e => {
                            const ids = form.secondary_category_ids || []
                            set('secondary_category_ids', e.target.checked ? [...ids, c.id] : ids.filter(id => id !== c.id))
                          }}
                        />
                        {c.name}
                      </label>
                    )
                  })}
                </div>
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

              <div className="border border-noch-border rounded-xl p-3 mb-3">
                <p className="text-noch-muted text-xs mb-2">Visibility</p>
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={!!form.visible_on_menu} onChange={e => set('visible_on_menu', e.target.checked)} className="w-4 h-4 accent-noch-green" />
                    <span className="text-white text-sm">POS Menu</span>
                    <span className="text-noch-muted text-xs ml-1">— staff terminal</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.visible_on_customer_menu !== false} onChange={e => set('visible_on_customer_menu', e.target.checked)} className="w-4 h-4 accent-green-400" />
                    <span className="text-white text-sm">Customer Menu</span>
                    <span className="text-noch-muted text-xs ml-1">— ordering page</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.visible_on_website !== false} onChange={e => set('visible_on_website', e.target.checked)} className="w-4 h-4 accent-blue-400" />
                    <span className="text-white text-sm">Online Store</span>
                    <span className="text-noch-muted text-xs ml-1">— retail channel</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={!!form.featured} onChange={e => set('featured', e.target.checked)} className="w-4 h-4 accent-yellow-400" />
                    <span className="text-white text-sm flex items-center gap-1"><Star size={12} className="text-yellow-400" />Featured</span>
                  </label>
                </div>
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

                  <div className="mb-1">
                    <label className="label block mb-1">Menu description (EN)</label>
                    <textarea value={form.menu_description || ''} onChange={e => set('menu_description', e.target.value)} className="input w-full resize-none" rows={2} placeholder="Rich espresso with velvety milk foam" />
                  </div>
                  <div className="mb-3">
                    <label className="label block mb-1">Menu description (AR)</label>
                    <textarea value={form.menu_description_ar || ''} onChange={e => set('menu_description_ar', e.target.value)} className="input w-full resize-none text-right" dir="rtl" rows={2} placeholder="إسبريسو غني مع رغوة الحليب" />
                  </div>
                  {(form.menu_description || form.menu_description_ar) && (
                    <div className="border border-noch-border rounded-xl p-3 mb-3">
                      <p className="text-noch-muted text-xs mb-2">Show description on</p>
                      <div className="flex flex-col gap-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={form.show_description_on_menu !== false} onChange={e => set('show_description_on_menu', e.target.checked)} className="w-4 h-4 accent-green-400" />
                          <span className="text-white text-sm">Customer menu <span className="text-noch-muted text-xs">— ordering page</span></span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={form.show_description_on_website !== false} onChange={e => set('show_description_on_website', e.target.checked)} className="w-4 h-4 accent-blue-400" />
                          <span className="text-white text-sm">Website menu <span className="text-noch-muted text-xs">— noch.cloud/menu</span></span>
                        </label>
                      </div>
                    </div>
                  )}

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
