import { useCallback, useEffect, useState } from 'react'
import { Loader2, MessageSquare, RefreshCw, RotateCcw } from 'lucide-react'
import Layout from '../components/Layout'
import { getNotificationOutbox, retryNotification } from '../modules/marketing/lib/marketing-supabase'
import toast from 'react-hot-toast'

const STATUS_COLORS = {
  queued: 'bg-sky-400/20 text-sky-300',
  scheduled: 'bg-amber-400/20 text-amber-300',
  processing: 'bg-indigo-400/20 text-indigo-300',
  sent: 'bg-noch-green/20 text-noch-green',
  failed: 'bg-red-400/20 text-red-300',
  skipped: 'bg-noch-border text-noch-muted',
  cancelled: 'bg-white/5 text-white/40',
  draft: 'bg-white/5 text-white/40',
}

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

export default function Messages() {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [selected, setSelected] = useState(null)
  const [retryingId, setRetryingId] = useState(null)
  const selectedId = selected?.id || null

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await getNotificationOutbox(statusFilter || undefined)
      setMessages(rows)
      if (selectedId) {
        const fresh = rows.find((row) => row.id === selectedId)
        setSelected(fresh || null)
      }
    } catch (err) {
      toast.error(err.message || 'Load failed')
    } finally {
      setLoading(false)
    }
  }, [selectedId, statusFilter])

  useEffect(() => { load() }, [load])

  async function handleRetry(outboxId) {
    setRetryingId(outboxId)
    try {
      const result = await retryNotification(outboxId)
      if (result?.status === 'failed') throw new Error(result.error || 'Retry failed')
      await load()
      toast.success(result?.status === 'sent' ? 'Notification sent' : 'Notification re-queued')
    } catch (err) {
      toast.error(err.message || 'Retry failed')
    } finally {
      setRetryingId(null)
    }
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-noch-green/10 text-noch-green flex items-center justify-center">
              <MessageSquare size={20} />
            </div>
            <div>
              <h1 className="text-white font-bold text-xl">Messages</h1>
              <p className="text-noch-muted text-sm">Notification outbox for loyalty, feedback, campaigns, and WhatsApp automations.</p>
            </div>
          </div>
          <button
            onClick={load}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-noch-border text-noch-muted hover:text-white"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>

        <div className="flex gap-2 mb-4 flex-wrap">
          {['', 'queued', 'scheduled', 'processing', 'sent', 'failed', 'skipped', 'cancelled'].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1 rounded-lg text-sm border transition-colors capitalize ${
                statusFilter === status
                  ? 'bg-noch-green text-noch-dark border-noch-green'
                  : 'border-noch-border text-noch-muted hover:text-white'
              }`}
            >
              {status || 'All'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-20 text-noch-muted">
            <Loader2 size={24} className="animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="bg-noch-card border border-noch-border rounded-2xl p-10 text-center">
            <MessageSquare size={32} className="text-noch-muted mx-auto mb-3" />
            <p className="text-white font-semibold mb-1">No notification activity yet</p>
            <p className="text-noch-muted text-sm">Queued sends from loyalty, feedback, and campaigns will appear here automatically.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[1.4fr,0.9fr] gap-4">
            <div className="bg-noch-card border border-noch-border rounded-2xl overflow-hidden">
              <div className="divide-y divide-noch-border">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`w-full text-left px-4 py-3 hover:bg-noch-card-hover transition-colors cursor-pointer ${
                      selected?.id === msg.id ? 'bg-noch-card-hover' : ''
                    }`}
                    onClick={() => setSelected(msg)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-noch-muted text-xs uppercase">{msg.channel}</span>
                          <span className="text-white text-sm font-medium">{msg.template_key || msg.event_key || 'manual message'}</span>
                          {msg.campaign?.name && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-noch-muted">
                              {msg.campaign.name}
                            </span>
                          )}
                        </div>
                        <p className="text-white text-sm truncate">{msg.recipient_name || msg.customer?.full_name || msg.recipient_phone || 'Unknown recipient'}</p>
                        <p className="text-noch-muted text-xs mt-0.5 truncate">
                          {msg.recipient_phone || msg.customer?.phone || 'No phone'} · {msg.source_module || 'unspecified source'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full ${STATUS_COLORS[msg.status] || STATUS_COLORS.draft}`}>
                          {msg.status}
                        </span>
                        {(msg.status === 'failed' || msg.status === 'queued' || msg.status === 'scheduled') && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleRetry(msg.id) }}
                            disabled={retryingId === msg.id}
                            className="text-noch-muted hover:text-noch-green transition-colors disabled:opacity-50"
                            title="Retry send"
                          >
                            {retryingId === msg.id ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-noch-muted text-xs mt-1">
                      Created {formatDate(msg.created_at)}
                      {msg.sent_at ? ` · Sent ${formatDate(msg.sent_at)}` : ''}
                      {msg.failed_at ? ` · Failed ${formatDate(msg.failed_at)}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-noch-card border border-noch-border rounded-2xl p-4">
              {selected ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-noch-muted text-xs uppercase mb-1">Template</p>
                    <p className="text-white font-medium">{selected.template_key || selected.event_key || 'manual message'}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-noch-muted text-xs uppercase mb-1">Recipient</p>
                      <p className="text-white">{selected.recipient_name || selected.customer?.full_name || 'Unknown'}</p>
                      <p className="text-noch-muted text-xs">{selected.recipient_phone || selected.customer?.phone || 'No phone'}</p>
                    </div>
                    <div>
                      <p className="text-noch-muted text-xs uppercase mb-1">Status</p>
                      <p className="text-white">{selected.status}</p>
                      <p className="text-noch-muted text-xs">{selected.provider_status || 'No provider status yet'}</p>
                    </div>
                    <div>
                      <p className="text-noch-muted text-xs uppercase mb-1">Source</p>
                      <p className="text-white">{selected.source_module || 'unspecified source'}</p>
                    </div>
                    <div>
                      <p className="text-noch-muted text-xs uppercase mb-1">Attempts</p>
                      <p className="text-white">{selected.attempts || 0}</p>
                    </div>
                  </div>

                  <div>
                    <p className="text-noch-muted text-xs uppercase mb-1">Timeline</p>
                    <p className="text-white text-sm">Created: {formatDate(selected.created_at)}</p>
                    <p className="text-white text-sm">Scheduled: {formatDate(selected.scheduled_for)}</p>
                    <p className="text-white text-sm">Last attempt: {formatDate(selected.last_attempt_at)}</p>
                    <p className="text-white text-sm">Sent: {formatDate(selected.sent_at)}</p>
                  </div>

                  <div>
                    <p className="text-noch-muted text-xs uppercase mb-1">Preview</p>
                    <div className="rounded-xl bg-noch-dark/70 border border-noch-border p-3 text-sm text-white whitespace-pre-wrap break-words min-h-[96px]">
                      {selected.message_body || 'Template-backed send. Copy is resolved from notification_templates at delivery time.'}
                    </div>
                  </div>

                  <div>
                    <p className="text-noch-muted text-xs uppercase mb-1">Template Variables</p>
                    <pre className="rounded-xl bg-noch-dark/70 border border-noch-border p-3 text-xs text-noch-muted overflow-x-auto">
                      {JSON.stringify(selected.template_variables || {}, null, 2)}
                    </pre>
                  </div>

                  {selected.error_text && (
                    <div>
                      <p className="text-red-300 text-xs uppercase mb-1">Error</p>
                      <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-200 whitespace-pre-wrap break-words">
                        {selected.error_text}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-center text-noch-muted text-sm">
                  Select a notification to inspect delivery details, provider status, and retry history.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
