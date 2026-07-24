// CategoryModal.jsx — Add/edit category form, extracted from POSProducts.jsx
import { useState, useRef } from 'react'
import { createPOSCategory, updatePOSCategory } from '../lib/pos-supabase'
import toast from 'react-hot-toast'
import { supabase } from '../../../lib/supabase'

export default function CategoryModal({ branchId, category, branches = [], onSave, onClose }) {
  const isEdit = !!category
  const [name, setName] = useState(category?.name || '')
  const [nameAr, setNameAr] = useState(category?.name_ar || '')
  const [color, setColor] = useState(category?.color || '#10b981')
  const [imageUrl, setImageUrl] = useState(category?.image_url || '')
  const [showInPos, setShowInPos] = useState(category?.show_in_pos ?? true)
  const [showOnWebsite, setShowOnWebsite] = useState(category?.show_on_website ?? true)
  const [showInOnlineStore, setShowInOnlineStore] = useState(category?.show_in_online_store ?? false)
  const [menuDisplayStyle, setMenuDisplayStyle] = useState(category?.menu_display_style || 'scroll')
  const [visibleBranchIds, setVisibleBranchIds] = useState(
    category?.visible_branch_ids?.length ? category.visible_branch_ids : branchId ? [branchId] : []
  )
  const [saving, setSaving] = useState(false)
  const [uploadingImg, setUploadingImg] = useState(false)
  const imgRef = useRef(null)

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingImg(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `cat_${Date.now()}.${ext}`
      const { error: uploadErr } = await supabase.storage.from('staff-photos').upload(path, file, { upsert: true })
      if (uploadErr) throw uploadErr
      const { data } = supabase.storage.from('staff-photos').getPublicUrl(path)
      setImageUrl(data.publicUrl)
      toast.success('Image uploaded')
    } catch (err) {
      toast.error(err.message || 'Upload failed')
    } finally {
      setUploadingImg(false)
    }
  }

  const handleSave = async () => {
    if (!name) return toast.error('Name required')
    setSaving(true)
    try {
      const payload = { name, name_ar: nameAr, color, image_url: imageUrl || null, show_in_pos: showInPos, show_on_website: showOnWebsite, show_in_online_store: showInOnlineStore, visible_branch_ids: visibleBranchIds, menu_display_style: menuDisplayStyle }
      if (isEdit) {
        await updatePOSCategory(category.id, payload)
        toast.success('Category updated')
      } else {
        await createPOSCategory({ branch_id: branchId, ...payload })
        toast.success('Category created')
      }
      onSave()
    } catch (err) {
      toast.error(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-noch-card border border-noch-border rounded-2xl w-full max-w-xs p-5 max-h-[90vh] overflow-y-auto">
        <h2 className="text-white font-bold mb-4">{isEdit ? 'Edit Category' : 'New Category'}</h2>

        {/* Avatar / Icon */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-16 h-16 rounded-xl border-2 border-noch-border overflow-hidden bg-noch-bg flex items-center justify-center flex-shrink-0">
            {imageUrl
              ? <img src={imageUrl} alt="category" className="w-full h-full object-cover" />
              : <span className="text-2xl">🌿</span>
            }
          </div>
          <div>
            <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            <button onClick={() => imgRef.current?.click()} disabled={uploadingImg}
              className="text-xs bg-noch-border text-noch-muted px-3 py-1.5 rounded-lg hover:text-white transition-colors block mb-1">
              {uploadingImg ? 'Uploading...' : 'Upload image'}
            </button>
            {imageUrl && (
              <button onClick={() => setImageUrl('')} className="text-xs text-red-400 hover:text-red-300">
                Remove
              </button>
            )}
          </div>
        </div>

        <label className="label block mb-1">Name (EN) *</label>
        <input value={name} onChange={e => setName(e.target.value)} className="input w-full mb-3" placeholder="Hot Drinks" />
        <label className="label block mb-1">Name (AR)</label>
        <input value={nameAr} onChange={e => setNameAr(e.target.value)} className="input w-full mb-3 text-right" dir="rtl" placeholder="المشروبات الساخنة" />
        <label className="label block mb-1">Color</label>
        <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-full h-10 rounded cursor-pointer mb-4" />
        {/* Customer menu layout style */}
        <div className="mb-3">
          <label className="label block mb-1">Customer menu layout</label>
          <select value={menuDisplayStyle} onChange={e => setMenuDisplayStyle(e.target.value)} className="input w-full text-sm">
            <option value="scroll">Horizontal scroll cards (default)</option>
            <option value="list">Compact list rows</option>
            <option value="grid">2-column image grid</option>
            <option value="addons">Add-ons icon strip</option>
            <option value="text">Text only — name &amp; price, expandable</option>
          </select>
          <p className="text-noch-muted text-[11px] mt-1">Controls how this category appears on the customer menu page</p>
        </div>

        <div className="border border-noch-border rounded-xl p-3 mb-3 flex flex-col gap-2">
          <p className="text-noch-muted text-xs mb-1">Visible in</p>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={showInPos} onChange={e => setShowInPos(e.target.checked)} className="accent-noch-green" />
            <span className="text-white text-sm">POS <span className="text-noch-muted text-xs">— in-store staff terminal</span></span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={showOnWebsite} onChange={e => setShowOnWebsite(e.target.checked)} className="accent-noch-green" />
            <span className="text-white text-sm">Customer menu <span className="text-noch-muted text-xs">— cafe menu (noch.cloud/menu)</span></span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={showInOnlineStore} onChange={e => setShowInOnlineStore(e.target.checked)} className="accent-noch-green" />
            <span className="text-white text-sm">Online store <span className="text-noch-muted text-xs">— retail shop (noch.cloud/#shop)</span></span>
          </label>
        </div>
        {branches.length > 0 && (
          <div className="border border-noch-border rounded-xl p-3 mb-4 flex flex-col gap-2">
            <p className="text-noch-muted text-xs mb-1">Branches</p>
            {branches.map(b => (
              <label key={b.id} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={visibleBranchIds.includes(b.id)}
                  onChange={e => setVisibleBranchIds(prev =>
                    e.target.checked ? [...prev, b.id] : prev.filter(id => id !== b.id)
                  )}
                  className="accent-noch-green"
                />
                <span className="text-white text-sm">{b.name}</span>
              </label>
            ))}
          </div>
        )}
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
            {saving ? '...' : isEdit ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
