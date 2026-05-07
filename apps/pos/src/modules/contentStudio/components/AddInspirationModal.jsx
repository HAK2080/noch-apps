import { useRef, useState } from 'react'
import { X, Link2, Image as ImageIcon, ClipboardPaste, StickyNote, Loader2, FolderOpen, FilePlus2 } from 'lucide-react'
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
  const [tab, setTab] = useState('screenshot')
  const [saving, setSaving] = useState(false)

  const [title, setTitle] = useState('')
  const [platform, setPlatform] = useState('')
  const [pillar, setPillar] = useState('')
  const [tagsRaw, setTagsRaw] = useState('')

  const [sourceUrl, setSourceUrl] = useState('')
  const [sourceText, setSourceText] = useState('')
  const [files, setFiles] = useState([])
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const filesInputRef = useRef(null)
  const folderInputRef = useRef(null)

  function addFiles(incoming) {
    const imgs = Array.from(incoming || []).filter(f => f.type?.startsWith('image/'))
    if (!imgs.length) return toast.error('No image files found')
    setFiles(prev => {
      const seen = new Set(prev.map(f => `${f.name}-${f.size}`))
      const merged = [...prev]
      for (const f of imgs) {
        const key = `${f.name}-${f.size}`
        if (!seen.has(key)) { merged.push(f); seen.add(key) }
      }
      return merged
    })
  }

  function removeFile(idx) {
    setFiles(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSave() {
    if (!businessId) { toast.error('Pick a business first'); return }
    if (tab === 'url' && !sourceUrl.trim()) return toast.error('Enter a URL')
    if (tab === 'pasted_text' && !sourceText.trim()) return toast.error('Paste some text')
    if (tab === 'note' && !sourceText.trim()) return toast.error('Write a note')
    if (tab === 'screenshot' && files.length === 0) return toast.error('Choose at least one image')

    setSaving(true)
    const tags = tagsRaw.split(',').map(s => s.trim()).filter(Boolean)

    try {
      if (tab === 'screenshot') {
        setProgress({ done: 0, total: files.length })
        const created = []
        const failed = []
        for (let i = 0; i < files.length; i++) {
          const f = files[i]
          try {
            const up = await uploadInspirationScreenshot(businessId, f)
            const row = await createInspiration({
              business_id: businessId,
              source_type: 'screenshot',
              source_url: null,
              source_text: null,
              screenshot_path: up.path,
              preview_image_url: up.publicUrl,
              title: (title.trim() || f.name.replace(/\.[^.]+$/, '')) || null,
              platform: platform || null,
              content_pillar: pillar.trim() || null,
              tags,
              status: 'new',
            })
            created.push(row)
          } catch (err) {
            console.error('Failed', f.name, err)
            failed.push(f.name)
          }
          setProgress({ done: i + 1, total: files.length })
        }
        if (created.length) {
          toast.success(`${created.length} inspiration${created.length > 1 ? 's' : ''} saved${failed.length ? ` (${failed.length} failed)` : ''}`)
          created.forEach(r => onCreated?.(r))
        }
        if (failed.length && !created.length) {
          toast.error(`All ${failed.length} uploads failed`)
        }
        if (created.length) onClose?.()
      } else {
        const row = await createInspiration({
          business_id: businessId,
          source_type: tab,
          source_url: tab === 'url' ? sourceUrl.trim() : null,
          source_text: (tab === 'pasted_text' || tab === 'note') ? sourceText.trim() : null,
          screenshot_path: null,
          preview_image_url: null,
          title: title.trim() || null,
          platform: platform || null,
          content_pillar: pillar.trim() || null,
          tags,
          status: 'new',
        })
        toast.success('Inspiration saved')
        onCreated?.(row)
        onClose?.()
      }
    } catch (err) {
      console.error(err)
      toast.error(err.message || 'Failed to save')
    } finally {
      setSaving(false)
      setProgress({ done: 0, total: 0 })
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
            <Field label={`Screenshots${files.length ? ` (${files.length})` : ''}`}>
              <input
                ref={filesInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={e => { addFiles(e.target.files); e.target.value = '' }}
                className="hidden"
              />
              <input
                ref={folderInputRef}
                type="file"
                webkitdirectory=""
                directory=""
                multiple
                onChange={e => { addFiles(e.target.files); e.target.value = '' }}
                className="hidden"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => filesInputRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-2 bg-noch-dark border border-noch-border hover:border-noch-green/60 rounded-lg px-3 py-2 text-white text-sm"
                >
                  <FilePlus2 size={14} /> Add files
                </button>
                <button
                  type="button"
                  onClick={() => folderInputRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-2 bg-noch-dark border border-noch-border hover:border-noch-green/60 rounded-lg px-3 py-2 text-white text-sm"
                >
                  <FolderOpen size={14} /> Scan folder
                </button>
              </div>
              {files.length > 0 && (
                <ul className="mt-2 max-h-40 overflow-y-auto border border-noch-border rounded-lg divide-y divide-noch-border">
                  {files.map((f, i) => (
                    <li key={`${f.name}-${f.size}-${i}`} className="flex items-center justify-between px-3 py-1.5 text-xs">
                      <span className="text-white truncate pr-2">{f.webkitRelativePath || f.name}</span>
                      <button type="button" onClick={() => removeFile(i)} className="text-noch-muted hover:text-red-400">
                        <X size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {files.length > 0 && (
                <div className="flex justify-between items-center mt-1.5">
                  <p className="text-noch-muted text-xs">{files.length} image{files.length > 1 ? 's' : ''} selected</p>
                  <button type="button" onClick={() => setFiles([])} className="text-noch-muted hover:text-white text-xs">Clear all</button>
                </div>
              )}
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

          {tab !== 'screenshot' && (
            <>
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
            </>
          )}
        </div>

        <footer className="px-5 py-4 border-t border-noch-border flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-noch-muted hover:text-white text-sm">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-noch-green text-noch-dark font-medium text-sm disabled:opacity-60 flex items-center gap-2"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving && progress.total > 1
              ? `Uploading ${progress.done}/${progress.total}…`
              : tab === 'screenshot' && files.length > 1
                ? `Save ${files.length} inspirations`
                : 'Save inspiration'}
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
