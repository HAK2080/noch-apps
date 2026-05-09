import { useEffect, useState, useCallback } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { FileEdit, Plus, Loader2, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import EmptyState from '../components/EmptyState'
import { listBriefsByBusiness, createBrief, deleteBrief } from '../services/creativeBriefs'
import { BRIEF_STATUSES } from '../lib/constants'

const STATUS_COLORS = {
  draft:       'bg-noch-border text-noch-muted',
  ready:       'bg-noch-green/20 text-noch-green',
  in_progress: 'bg-amber-400/20 text-amber-400',
  completed:   'bg-blue-400/20 text-blue-400',
  archived:    'bg-white/5 text-white/30',
}

export default function ContentBriefs() {
  const { businessId, businesses, loading: ctxLoading } = useOutletContext()
  const [briefs, setBriefs] = useState([])
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [creating, setCreating] = useState(false)

  const refresh = useCallback(async () => {
    if (!businessId) { setBriefs([]); return }
    setLoading(true)
    try {
      const rows = await listBriefsByBusiness(businessId, { status: statusFilter || undefined })
      setBriefs(rows)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [businessId, statusFilter])

  useEffect(() => { refresh() }, [refresh])

  async function handleCreate() {
    if (!businessId) return
    setCreating(true)
    try {
      const brief = await createBrief({ business_id: businessId, status: 'draft' })
      window.location.href = `/content-studio/briefs/${brief.id}`
    } catch (e) {
      toast.error(e.message || 'Failed to create brief')
      setCreating(false)
    }
  }

  async function handleDelete(e, id) {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm('Delete this brief?')) return
    try {
      await deleteBrief(id)
      toast.success('Deleted')
      refresh()
    } catch (err) {
      toast.error(err.message || 'Delete failed')
    }
  }

  if (ctxLoading) return null
  if (!businesses?.length) {
    return (
      <EmptyState
        icon={FileEdit}
        title="Create a business first"
        description="Briefs are scoped to a business."
        ctaLabel="Add a business"
        ctaTo="/content-studio/businesses/new"
      />
    )
  }
  if (!businessId) {
    return (
      <EmptyState
        icon={FileEdit}
        title="Pick a business"
        description="Select a business to view its content briefs."
      />
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-noch-card border border-noch-border rounded-lg px-3 py-1.5 text-white text-sm"
          >
            <option value="">All statuses</option>
            {BRIEF_STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
        </div>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-noch-green text-noch-dark font-medium text-sm disabled:opacity-50"
        >
          {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          New brief
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10 text-noch-muted">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : briefs.length === 0 ? (
        <EmptyState
          icon={FileEdit}
          title="No briefs yet"
          description="Create a brief to plan a piece of content from signal to draft."
          ctaLabel="Create first brief"
          onCta={handleCreate}
        />
      ) : (
        <div className="bg-noch-card border border-noch-border rounded-2xl overflow-hidden">
          <div className="divide-y divide-noch-border">
            {briefs.map(b => (
              <Link
                key={b.id}
                to={`/content-studio/briefs/${b.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-noch-card-hover transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium text-sm truncate">
                    {b.objective || b.content_mission || b.notes || 'Untitled brief'}
                  </p>
                  <p className="text-noch-muted text-xs mt-0.5">
                    {b.platform && <span className="mr-2">{b.platform}</span>}
                    {b.format && <span className="mr-2">{b.format}</span>}
                    {new Date(b.created_at).toLocaleDateString()}
                  </p>
                </div>
                <span className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full ${STATUS_COLORS[b.status] || STATUS_COLORS.draft}`}>
                  {b.status.replace('_', ' ')}
                </span>
                <button
                  onClick={e => handleDelete(e, b.id)}
                  className="text-noch-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity ml-1"
                >
                  <Trash2 size={14} />
                </button>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
