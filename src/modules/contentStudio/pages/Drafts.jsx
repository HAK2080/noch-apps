import { useEffect, useState, useCallback } from 'react'
import { useOutletContext, Link } from 'react-router-dom'
import { FileText, Loader2 } from 'lucide-react'
import EmptyState from '../components/EmptyState'
import { listDrafts } from '../services/drafts'
import { DRAFT_STATUSES } from '../lib/constants'

export default function Drafts() {
  const { businessId, businesses, loading: ctxLoading } = useOutletContext()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')

  const refresh = useCallback(async () => {
    if (!businessId) { setItems([]); return }
    setLoading(true)
    try {
      const rows = await listDrafts({ businessId, status: status || undefined })
      setItems(rows)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [businessId, status])

  useEffect(() => { refresh() }, [refresh])

  if (ctxLoading) return null
  if (!businesses?.length) return <EmptyState icon={FileText} title="Create a business first" ctaLabel="Add a business" ctaTo="/content-studio/businesses/new" />
  if (!businessId) return <EmptyState icon={FileText} title="Pick a business" />

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <select value={status} onChange={e => setStatus(e.target.value)} className="bg-noch-card border border-noch-border rounded-lg px-3 py-1.5 text-white text-sm">
          <option value="">All statuses</option>
          {DRAFT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {loading ? (
        <div className="flex justify-center py-10 text-noch-muted"><Loader2 size={20} className="animate-spin" /></div>
      ) : items.length === 0 ? (
        <EmptyState icon={FileText} title="No drafts yet" description="Generate drafts from a concept in the workbench." ctaLabel="Go to Concepts" ctaTo="/content-studio/concepts" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map(d => (
            <Link key={d.id} to={`/content-studio/concepts/${d.concept_id}`} className="bg-noch-card border border-noch-border rounded-2xl p-4 hover:border-noch-green/40 transition-colors">
              <div className="flex items-center justify-between gap-2 mb-2 text-xs">
                <span className="text-noch-muted">{d.format?.replace('_', ' ')} · {d.platform}</span>
                <span className="px-2 py-0.5 rounded-full bg-noch-border text-noch-muted capitalize">{d.status}</span>
              </div>
              <p className="text-white text-sm line-clamp-4 whitespace-pre-wrap">{d.body_text}</p>
              {d.voice && <p className="text-noch-muted text-xs mt-2">Voice: {d.voice.name}</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
