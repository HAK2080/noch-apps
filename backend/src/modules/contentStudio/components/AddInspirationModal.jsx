import { useState } from 'react'
import { X, Link2, Image as ImageIcon, ClipboardPaste, StickyNote, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { createInspiration, uploadInspirationScreenshot } from '../services/inspirations'
import { PLATFORMS } from '../lib/constants'

const TABS = [
  { id: 'url',         label: 'URL',          icon: Link2 },
  { id: 'screenshot',  label: 'Screenshot',   icon: ImageIcon },
  { id: 'pasted_text', label: 'Pasted text',  icon: ClipboardPaste },
  { id: 'note',        label: 'Manual note',  icon: StickyNote },
]

export default function AddInspirationModal({ businessId, onClose, onCreated }) {
  const [tab, setTab] = useState('url')
  const [saving, setSaving] = useState(false)

  const [title, setTitle] = useState('')
  const [platform, setPlatform] = useState('')
  const [pillar, setPillar] = useState('')
  const [tagsRaw, setTagsRaw] = useState('')

  const [sourceUrl, setSourceUrl] = useState('')
  const [sourceText, setSourceText] = useState('')
  const [file, setFile] = useState(null)

  async function handleSave() {
    if (!businessId) { toast.error('Pick a business first'); return }
    if (tab === 'url' && !sourceUrl.trim()) return toast.error('Enter a URL')
    if (tab === 'pasted_text' && !sourceText.trim()) return toast.error('Paste some text')
    if (tab === 'note' && !sourceText.trim()) return toast.error('Write a note')
    if (tab === 'screenshot' && !file) return toast.error('Choose an image')

    setSaving(true)
    try {
      let screenshot_path = null
      let preview_image_url = null
      if (tab === 'screenshot') {
        const up = await uploadInspirationScreenshot(businessId, file)
        screenshot_path = up.path
        preview_image_url = up.publicUrl
      }
      const tags = tagsRaw.split(',').map(s => s.trim()).filter(Boolean)
      const row = await createInspiration({
        business_id: businessId,
        source_type: tab,
        source_url: tab === 'url' ? sourceUrl.trim() : null,
        source_text: (tab === 'pasted_text' || tab === 'note') ? sourceText.trim() : null,
        screenshot_path,
        preview_image_url,
        title: title.trim() || null,
        platform: platform || null,
        content_pillar: pillar.trim() || null,
        tags,
        status: 'new',
      })
      toast.success('Inspiration saved')
      onCreated?.(row)
      onClose?.()
    } catch (err) {
      console.error(err)
      toast.error(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-noch-card border border-noch-border rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-5 py-4 border-b border-noch-border">
          <h2 className="text-white font-semibold">Add inspiration</h2>
          <button onClick={onClose} className="text-noch-muted hover:text-white"><X size={18} /></button>
        </header>

        <div className="px-5 pt-4">
          <div className="flex gap-1 bg-noch-dark rounded-lg p-1">
            {TABS.map(t => {
              const Icon = t.icon
              const active = tab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    active ? 'bg-noch-green text-noch-dark' : 'text-noch-muted hover:text-white'
                  }`}
                >
                  <Icon size={14} />
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="px-5 py-4 space-y-3">
          {tab === 'url' && (
            <Field label="Source URL">
              <input
                type="url"
                value={sourceUrl}
                onChange={e => setSourceUrl(e.target.value)}
                placeholder="https://instagram.com/p/..."
                className={inputCls}
              />
            </Field>
          )}

          {tab === 'screenshot' && (
            <Field label="Screenshot">
              <input
                type="file"
                accept="image/*"
                onChange={e => setFile(e.target.files?.[0] || null)}
                className="text-white text-sm"
              />
              {file && <p className="text-noch-muted text-xs mt-1">{file.name}</p>}
            </Field>
          )}

          {(tab === 'pasted_text' || tab === 'note') && (
            <Field label={tab === 'pasted_text' ? 'Pasted content' : 'Note'}>
              <textarea
                rows={5}
                value={sourceText}
                onChange={e => setSourceText(e.target.value)}
                placeholder={tab === 'pasted_text' ? 'Paste a caption, transcript, or copied text…' : 'Write the idea, observation, or reference…'}
                className={inputCls}
              />
            </Field>
          )}

          <Field label="Title (optional)">
            <input value={title} onChange={e => setTitle(e.target.value)} className={inputCls} placeholder="Short label for this reference" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Platform">
              <select value={platform} onChange={e => setPlatform(e.target.value)} className={inputCls}>
                <option value="">—</option>
                {PLATFORMS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </Field>
            <Field label="Content pillar">
              <input value={pillar} onChange={e => setPillar(e.target.value)} className={inputCls} placeholder="e.g. Behind the scenes" />
            </Field>
          </div>

          <Field label="Tags (comma-separated)">
            <input value={tagsRaw} onChange={e => setTagsRaw(e.target.value)} className={inputCls} placeholder="reel, hook, summer" />
          </Field>
        </div>

        <footer className="px-5 py-4 border-t border-noch-border flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-noch-muted hover:text-white text-sm">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-noch-green text-noch-dark font-medium text-sm disabled:opacity-60 flex items-center gap-2"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Save inspiration
          </button>
        </footer>
      </div>
    </div>
  )
}

const inputCls = 'w-full bg-noch-dark border border-noch-border rounded-lg px-3 py-2 text-white text-sm placeholder:text-noch-muted/60 focus:outline-none focus:border-noch-green'

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-noch-muted text-xs mb-1">{label}</span>
      {children}
    </label>
  )
}
