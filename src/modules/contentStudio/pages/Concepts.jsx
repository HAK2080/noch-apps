import { useEffect, useState, useCallback } from 'react'
import { useOutletContext, Link } from 'react-router-dom'
import { Sparkles, Loader2, ArrowRight } from 'lucide-react'
import EmptyState from '../components/EmptyState'
import { listConcepts } from '../services/concepts'

export default function Concepts() {
  const { businessId, businesses, loading: ctxLoading } = useOutletContext()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!businessId) { setItems([]); return }
    setLoading(true)
    try {
      const rows = await listConcepts({ businessId })
      setItems(rows)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [businessId])

  useEffect(() => { refresh() }, [refresh])

  if (ctxLoading) return null
  if (!businesses?.length) {
    return <EmptyState icon={Sparkles} title="Create a business first" ctaLabel="Add a business" ctaTo="/content-studio/businesses/new" />
  }
  if (!businessId) {
    return <EmptyState icon={Sparkles} title="Pick a business" description="Select one from the top of the page." />
  }
  if (loading) return <div className="flex justify-center py-10 text-noch-muted"><Loader2 size={20} className="animate-spin" /></div>
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title="No concepts yet"
        description="Open an inspiration and click Extract concept."
        ctaLabel="Go to Inspiration"
        ctaTo="/content-studio/inspiration"
      />
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {items.map(c => (
        <Link
          key={c.id}
          to={`/content-studio/concepts/${c.id}`}
          className="bg-noch-card border border-noch-border rounded-2xl p-4 hover:border-noch-green/40 transition-colors"
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1 min-w-0">
              <p className="text-noch-muted text-xs">{c.inspiration?.title || 'Untitled inspiration'}</p>
              <h3 className="text-white font-medium line-clamp-2 mt-1">{c.hook_summary || '(no hook yet)'}</h3>
            </div>
            <ArrowRight size={14} className="text-noch-muted shrink-0 mt-1" />
          </div>
          {c.content_pattern && <p className="text-noch-muted text-xs line-clamp-2"><span className="text-noch-muted/60">Pattern:</span> {c.content_pattern}</p>}
          <div className="mt-2 flex items-center gap-2 text-[11px] text-noch-muted">
            {c.originality_risk && <span className="px-1.5 py-0.5 rounded bg-noch-border capitalize">risk: {c.originality_risk}</span>}
            {c.edited_by_user && <span className="px-1.5 py-0.5 rounded bg-noch-border">edited</span>}
          </div>
        </Link>
      ))}
    </div>
  )
}
