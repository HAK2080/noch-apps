import { useEffect, useState, useCallback } from 'react'
import { MessageSquare, Plus, Loader2, Send } from 'lucide-react'
import Layout from '../components/Layout'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'

const STATUS_COLORS = {
  draft:     'bg-noch-border text-noch-muted',
  scheduled: 'bg-amber-400/20 text-amber-400',
  sent:      'bg-noch-green/20 text-noch-green',
  failed:    'bg-red-400/20 text-red-400',
  archived:  'bg-white/5 text-white/30',
}

const CHANNELS = ['instagram', 'whatsapp', 'telegram', 'facebook', 'sms', 'email', 'other']

async function listMessages(status) {
  let q = supabase
    .from('message_drafts')
    .select('*, creator:profiles!created_by(full_name)')
    .order('created_at', { ascending: false })
  if (status) q = q.eq('status', status)
  const { data, error } = await q
  if (error) {
    if (error.code === '42P01') return []
    throw error
  }
  return data || []
}

async function createMessage(fields) {
  const { data, error } = await supabase
    .from('message_drafts')
    .insert(fields)
    .select()
    .single()
  if (error) throw error
  return data
}

async function updateMessage(id, patch) {
  const { data, error } = await supabase
    .from('message_drafts')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export default function Messages() {
  const { profile } = useAuth()
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await listMessages(statusFilter || undefined)
      setMessages(rows)
    } catch (e) {
      toast.error(e.message || 'Load failed')
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => { load() }, [load])

  async function handleMarkSent(id) {
    try {
      const updated = await updateMessage(id, { status: 'sent', sent_at: new Date().toISOString() })
      setMessages(prev => prev.map(m => m.id === id ? updated : m))
      toast.success('Marked as sent')
    } catch (e) {
      toast.error(e.message || 'Failed')
    }
  }

  const filtered = messages

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-noch-green/10 text-noch-green flex items-center justify-center">
              <MessageSquare size={20} />
            </div>
            <div>
              <h1 className="text-white font-bold text-xl">Messages</h1>
              <p className="text-noch-muted text-sm">{messages.length} message drafts</p>
            </div>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-noch-green text-noch-dark font-medium text-sm"
          >
            <Plus size={14} /> New message
          </button>
        </div>

        <div className="flex gap-2 mb-4 flex-wrap">
          {['', 'draft', 'scheduled', 'sent', 'failed', 'archived'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded-lg text-sm border transition-colors capitalize ${statusFilter === s ? 'bg-noch-green text-noch-dark border-noch-green' : 'border-noch-border text-noch-muted hover:text-white'}`}
            >
              {s || 'All'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-20 text-noch-muted">
            <Loader2 size={24} className="animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-noch-card border border-noch-border rounded-2xl p-10 text-center">
            <MessageSquare size={32} className="text-noch-muted mx-auto mb-3" />
            <p className="text-white font-semibold mb-1">No messages yet</p>
            <p className="text-noch-muted text-sm">Draft, schedule, and track messages across all channels.</p>
          </div>
        ) : (
          <div className="bg-noch-card border border-noch-border rounded-2xl overflow-hidden">
            <div className="divide-y divide-noch-border">
              {filtered.map(msg => (
                <div
                  key={msg.id}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-noch-card-hover transition-colors cursor-pointer"
                  onClick={() => setEditing(msg)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-noch-muted text-xs capitalize">{msg.channel}</span>
                      {msg.recipient && <span className="text-noch-muted text-xs">→ {msg.recipient}</span>}
                    </div>
                    <p className="text-white text-sm truncate">{msg.body}</p>
                    <p className="text-noch-muted text-xs mt-0.5">
                      {new Date(msg.created_at).toLocaleDateString()}
                      {msg.scheduled_at && ` · Scheduled ${new Date(msg.scheduled_at).toLocaleDateString()}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full ${STATUS_COLORS[msg.status] || STATUS_COLORS.draft}`}>
                      {msg.status}
                    </span>
                    {msg.status === 'draft' && (
                      <button
                        onClick={e => { e.stopPropagation(); handleMarkSent(msg.id) }}
                        className="text-noch-muted hover:text-noch-green transition-colors"
                        title="Mark as sent"
                      >
                        <Send size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showCreate && (
        <MessageModal
          profile={profile}
          onSaved={(msg) => { setMessages(prev => [msg, ...prev]); setShowCreate(false) }}
          onClose={() => setShowCreate(false)}
          createMessage={createMessage}
        />
      )}

      {editing && (
        <MessageModal
          profile={profile}
          initialData={editing}
          onSaved={(msg) => { setMessages(prev => prev.map(m => m.id === msg.id ? msg : m)); setEditing(null) }}
          onClose={() => setEditing(null)}
          createMessage={createMessage}
          updateMessage={updateMessage}
        />
      )}
    </Layout>
  )
}

function MessageModal({ profile, initialData, onSaved, onClose, createMessage, updateMessage }) {
  const [channel, setChannel] = useState(initialData?.channel || 'whatsapp')
  const [recipient, setRecipient] = useState(initialData?.recipient || '')
  const [body, setBody] = useState(initialData?.body || '')
  const [scheduledAt, setScheduledAt] = useState(initialData?.scheduled_at?.slice(0, 16) || '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!body.trim()) return
    setSaving(true)
    try {
      const payload = {
        channel,
        recipient: recipient.trim() || null,
        body: body.trim(),
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        status: scheduledAt ? 'scheduled' : 'draft',
      }
      let msg
      if (initialData) {
        msg = await updateMessage(initialData.id, payload)
      } else {
        msg = await createMessage({ ...payload, created_by: profile.id })
      }
      onSaved(msg)
    } catch (e) {
      toast.error(e.message || 'Failed')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-noch-card border border-noch-border rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="p-5 space-y-4">
          <h2 className="text-white font-semibold">{initialData ? 'Edit message' : 'New message'}</h2>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-noch-muted text-xs mb-1 block">Channel</label>
              <select
                value={channel}
                onChange={e => setChannel(e.target.value)}
                className="w-full bg-noch-dark border border-noch-border rounded-lg px-3 py-2 text-white text-sm"
              >
                {CHANNELS.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-noch-muted text-xs mb-1 block">Recipient</label>
              <input
                value={recipient}
                onChange={e => setRecipient(e.target.value)}
                placeholder="Name or handle"
                className="w-full bg-noch-dark border border-noch-border rounded-lg px-3 py-2 text-white text-sm placeholder:text-noch-muted/50"
              />
            </div>
          </div>
          <div>
            <label className="text-noch-muted text-xs mb-1 block">Message *</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={4}
              placeholder="Write your message…"
              className="w-full bg-noch-dark border border-noch-border rounded-lg px-3 py-2 text-white text-sm placeholder:text-noch-muted/50 resize-none"
              autoFocus
            />
          </div>
          <div>
            <label className="text-noch-muted text-xs mb-1 block">Schedule for (optional)</label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={e => setScheduledAt(e.target.value)}
              className="w-full bg-noch-dark border border-noch-border rounded-lg px-3 py-2 text-white text-sm"
            />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-noch-border flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-noch-muted hover:text-white text-sm">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving || !body.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-noch-green text-noch-dark font-medium text-sm disabled:opacity-50"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {initialData ? 'Update' : 'Save draft'}
          </button>
        </div>
      </div>
    </div>
  )
}
