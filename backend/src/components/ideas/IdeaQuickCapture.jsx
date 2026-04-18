// src/components/ideas/IdeaQuickCapture.jsx
import { useState } from 'react'
import { X } from 'lucide-react'

export default function IdeaQuickCapture({ categories, defaultStatus = 'raw', onSave, onClose }) {
  const [title, setTitle] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    try {
      await onSave({
        title: title.trim(),
        category_id: categoryId || null,
        notes: notes.trim() || null,
        status: defaultStatus,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-noch-card border border-noch-border rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-noch-border">
          <h2 className="text-white font-bold text-lg">New Idea</h2>
          <button onClick={onClose} className="text-noch-muted hover:text-white">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          {/* Title */}
          <div>
            <label className="label block mb-1">Idea *</label>
            <input
              autoFocus
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="What's the idea?"
              className="input w-full"
            />
          </div>

          {/* Category */}
          <div>
            <label className="label block mb-1">Category</label>
            <select
              value={categoryId}
              onChange={e => setCategoryId(e.target.value)}
              className="input w-full"
            >
              <option value="">No category</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="label block mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any details... (optional)"
              rows={3}
              className="input w-full resize-none"
            />
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button
              type="submit"
              disabled={!title.trim() || saving}
              className="btn-primary flex-1"
            >
              {saving ? 'Saving...' : 'Save Idea'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
