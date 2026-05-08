// src/components/ideas/IdeaDetail.jsx
import { useState, useEffect, useRef } from 'react'
import { X, ExternalLink, Trash2, ArrowRight, Paperclip, Download, Eye, Loader2, FileText, Image } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import toast from 'react-hot-toast'

const STATUSES = ['raw', 'exploring', 'in_progress', 'shelved', 'done', 'discarded']
const STATUS_LABELS = {
  raw: 'Raw', exploring: 'Exploring', in_progress: 'In Progress',
  shelved: 'Shelved', done: 'Done', discarded: 'Discarded'
}
const STAFF_ALLOWED_STATUSES = ['raw', 'exploring', 'in_progress', 'discarded']

// ── Attachment helpers ───────────────────────────────────────
async function loadAttachments(ideaId) {
  const { data, error } = await supabase
    .from('idea_attachments')
    .select('*')
    .eq('idea_id', ideaId)
    .order('created_at')
  if (error) throw error
  return data || []
}

async function uploadIdeaAttachment(ideaId, file) {
  const ext = file.name.split('.').pop()
  const path = `ideas/${ideaId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const { error: uploadErr } = await supabase.storage
    .from('idea-attachments')
    .upload(path, file, { contentType: file.type })
  if (uploadErr) throw uploadErr
  const { data: urlData, error: urlErr } = await supabase.storage
    .from('idea-attachments')
    .createSignedUrl(path, 31536000) // 1 year
  if (urlErr) throw urlErr
  const { data, error } = await supabase
    .from('idea_attachments')
    .insert({ idea_id: ideaId, file_url: urlData.signedUrl, file_name: file.name, file_type: file.type })
    .select()
    .single()
  if (error) throw error
  return data
}

async function deleteIdeaAttachment(id) {
  const { error } = await supabase.from('idea_attachments').delete().eq('id', id)
  if (error) throw error
}

function AttachmentIcon({ fileType }) {
  if (fileType?.startsWith('image/')) return <Image size={14} className="text-blue-400" />
  return <FileText size={14} className="text-noch-muted" />
}

function AttachmentItem({ attachment, canDelete, onDelete }) {
  const [deleting, setDeleting] = useState(false)
  const isImage = attachment.file_type?.startsWith('image/')

  const handleDelete = async () => {
    if (!confirm('Delete this attachment?')) return
    setDeleting(true)
    try {
      await deleteIdeaAttachment(attachment.id)
      onDelete(attachment.id)
    } catch (err) {
      toast.error(err.message || 'Failed to delete')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex items-center gap-2 p-2 bg-noch-dark rounded-lg border border-noch-border group">
      {isImage ? (
        <img src={attachment.file_url} alt={attachment.file_name} className="w-10 h-10 rounded object-cover shrink-0" />
      ) : (
        <div className="w-10 h-10 rounded bg-noch-border flex items-center justify-center shrink-0">
          <AttachmentIcon fileType={attachment.file_type} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-white text-xs font-medium truncate">{attachment.file_name}</p>
        <p className="text-noch-muted text-[10px]">{new Date(attachment.created_at).toLocaleDateString()}</p>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <a href={attachment.file_url} target="_blank" rel="noreferrer" className="p-1 text-noch-muted hover:text-white" title="Preview">
          <Eye size={12} />
        </a>
        <a href={attachment.file_url} download={attachment.file_name} className="p-1 text-noch-muted hover:text-white" title="Download">
          <Download size={12} />
        </a>
        {canDelete && (
          <button onClick={handleDelete} disabled={deleting} className="p-1 text-noch-muted hover:text-red-400" title="Delete">
            {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
          </button>
        )}
      </div>
    </div>
  )
}

export default function IdeaDetail({ idea, categories, isOwner, currentUserId, onUpdate, onDelete, onConvertToTask, onClose }) {
  const { profile } = useAuth()
  const fileInputRef = useRef(null)

  const [title, setTitle]           = useState(idea.title)
  const [notes, setNotes]           = useState(idea.notes || '')
  const [categoryId, setCategoryId] = useState(idea.category_id || '')
  const [status, setStatus]         = useState(idea.status)
  const [linkUrl, setLinkUrl]       = useState(idea.link_url || '')
  const [saving, setSaving]         = useState(false)
  const [dirty, setDirty]           = useState(false)

  // Attachments
  const [attachments, setAttachments] = useState([])
  const [uploading, setUploading] = useState(false)

  const isReadOnly = !!idea.converted_task_id
  const canEdit = isOwner || (idea.submitted_by === currentUserId && !isReadOnly)
  const allowedStatuses = isOwner ? STATUSES : STAFF_ALLOWED_STATUSES

  useEffect(() => {
    setDirty(
      title !== idea.title ||
      notes !== (idea.notes || '') ||
      categoryId !== (idea.category_id || '') ||
      status !== idea.status ||
      linkUrl !== (idea.link_url || '')
    )
  }, [title, notes, categoryId, status, linkUrl, idea])

  useEffect(() => {
    loadAttachments(idea.id)
      .then(setAttachments)
      .catch(() => {}) // table may not exist yet
  }, [idea.id])

  const handleSave = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      await onUpdate(idea.id, {
        title: title.trim(),
        notes: notes.trim() || null,
        category_id: categoryId || null,
        status,
        link_url: linkUrl.trim() || null,
      })
      setDirty(false)
      toast.success('Idea updated')
    } catch (err) {
      toast.error(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Delete this idea?')) return
    try {
      await onDelete(idea.id)
      onClose()
    } catch (err) {
      toast.error(err.message || 'Failed to delete')
    }
  }

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 20 * 1024 * 1024) { toast.error('File too large (max 20MB)'); return }
    setUploading(true)
    try {
      const attachment = await uploadIdeaAttachment(idea.id, file)
      const next = [...attachments, attachment]
      setAttachments(next)
      // Propagate count up so IdeaCard badge stays in sync
      onUpdate(idea.id, { attachment_count: next.length }).catch(() => {})
      toast.success('Attachment uploaded')
    } catch (err) {
      toast.error(err.message || 'Upload failed — bucket may not exist yet')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleAttachmentDeleted = (id) => {
    const next = attachments.filter(a => a.id !== id)
    setAttachments(next)
    // Propagate count up so IdeaCard badge stays in sync
    onUpdate(idea.id, { attachment_count: next.length }).catch(() => {})
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40" onClick={dirty ? undefined : onClose} />

      {/* Panel */}
      <div className="w-full max-w-md bg-noch-card border-l border-noch-border flex flex-col h-full overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-noch-border shrink-0">
          <div className="flex items-center gap-2">
            {idea.category && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: idea.category.color + '22', color: idea.category.color }}>
                {idea.category.icon} {idea.category.name}
              </span>
            )}
            {isReadOnly && <span className="text-xs px-2 py-0.5 rounded-full bg-noch-green/10 text-noch-green">Converted</span>}
          </div>
          <button onClick={onClose} className="text-noch-muted hover:text-white"><X size={18} /></button>
        </div>

        <div className="p-5 flex flex-col gap-5 flex-1">
          {/* Title */}
          <textarea
            value={title}
            onChange={e => setTitle(e.target.value)}
            disabled={!canEdit}
            rows={2}
            className="input w-full resize-none text-base font-semibold disabled:opacity-60"
            placeholder="Idea title"
          />

          {/* Notes */}
          <div>
            <label className="label block mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              disabled={!canEdit}
              rows={5}
              placeholder="Details, context, inspiration..."
              className="input w-full resize-none disabled:opacity-60"
            />
          </div>

          {/* Category */}
          <div>
            <label className="label block mb-1">Category</label>
            <select value={categoryId} onChange={e => setCategoryId(e.target.value)} disabled={!canEdit} className="input w-full disabled:opacity-60">
              <option value="">No category</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="label block mb-1">Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)} disabled={!canEdit} className="input w-full disabled:opacity-60">
              {allowedStatuses.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </div>

          {/* URL */}
          <div>
            <label className="label block mb-1">Link</label>
            <div className="flex gap-2">
              <input type="url" value={linkUrl} onChange={e => setLinkUrl(e.target.value)} disabled={!canEdit} placeholder="https://..." className="input flex-1 disabled:opacity-60" />
              {linkUrl && (
                <a href={linkUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary px-3 flex items-center">
                  <ExternalLink size={14} />
                </a>
              )}
            </div>
          </div>

          {/* ── Attachments ──────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label">Attachments ({attachments.length})</label>
              {canEdit && (
                <>
                  <input ref={fileInputRef} type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" className="hidden" onChange={handleFileSelect} />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-1.5 text-xs text-noch-green hover:text-green-300 transition-colors disabled:opacity-50"
                  >
                    {uploading ? <Loader2 size={12} className="animate-spin" /> : <Paperclip size={12} />}
                    {uploading ? 'Uploading...' : 'Attach file'}
                  </button>
                </>
              )}
            </div>
            {attachments.length > 0 ? (
              <div className="flex flex-col gap-2">
                {attachments.map(a => (
                  <AttachmentItem
                    key={a.id}
                    attachment={a}
                    canDelete={isOwner || idea.submitted_by === currentUserId}
                    onDelete={handleAttachmentDeleted}
                  />
                ))}
              </div>
            ) : (
              <p className="text-noch-muted text-xs">No attachments yet</p>
            )}
          </div>

          {/* Convert to Task */}
          {isOwner && !isReadOnly && (
            <button onClick={() => onConvertToTask(idea)} className="btn-primary w-full flex items-center justify-center gap-2 py-3">
              <ArrowRight size={16} /> Convert to Task
            </button>
          )}

          {/* View Task link */}
          {idea.converted_task_id && (
            <a href={`/tasks/${idea.converted_task_id}`} className="btn-secondary w-full flex items-center justify-center gap-2 py-3 text-noch-green border-noch-green/30">
              <ArrowRight size={16} /> View Task
            </a>
          )}

          {/* Save */}
          {canEdit && dirty && (
            <button onClick={handleSave} disabled={saving || !title.trim()} className="btn-primary w-full py-3">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          )}
        </div>

        {/* Delete footer */}
        {canEdit && (
          <div className="p-5 border-t border-noch-border shrink-0">
            <button onClick={handleDelete} className="flex items-center gap-2 text-red-400/60 hover:text-red-400 text-sm transition-colors">
              <Trash2 size={14} /> Delete idea
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
