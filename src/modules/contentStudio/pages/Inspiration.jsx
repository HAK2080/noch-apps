import { useEffect, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Lightbulb, Plus, Loader2 } from 'lucide-react'
import EmptyState from '../components/EmptyState'
import InspirationCard from '../components/InspirationCard'
import AddInspirationModal from '../components/AddInspirationModal'
import { listInspirations } from '../services/inspirations'
import { INSPIRATION_STATUSES } from '../lib/constants'

export default function Inspiration() {
  const { businessId, businesses, loading: ctxLoading } = useOutletContext()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')

  const refresh = useCallback(async () => {
    if (!businessId) { setItems([]); return }
    setLoading(true)
    try {
      const rows = await listInspirations({ businessId, status: statusFilter || undefined })
      setItems(rows)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [businessId, statusFilter])

  useEffect(() => { refresh() }, [refresh])

  if (ctxLoading) return null
  if (!businesses?.length) return <NeedBusiness />
  if (!businessId) return <PickBusiness />

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
            {INSPIRATION_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-noch-green text-noch-dark font-medium text-sm"
        >
          <Plus size={14} /> Add inspiration
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10 text-noch-muted"><Loader2 size={20} className="animate-spin" /></div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          title="No inspiration yet"
          description="Add references via URL, screenshot, pasted text, or a quick note."
          ctaLabel="Add your first inspiration"
          onCta={() => setShowAdd(true)}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(it => <InspirationCard key={it.id} item={it} />)}
        </div>
      )}

      {showAdd && (
        <AddInspirationModal
          businessId={businessId}
          onClose={() => setShowAdd(false)}
          onCreated={refresh}
        />
      )}
    </div>
  )
}

function NeedBusiness() {
  return (
    <EmptyState
      icon={Lightbulb}
      title="Create a business first"
      description="Inspiration is scoped to a business. Create one to get started."
      ctaLabel="Add a business"
      ctaTo="/content-studio/businesses/new"
    />
  )
}

function PickBusiness() {
  return (
    <EmptyState
      icon={Lightbulb}
      title="Pick a business"
      description="Select a business from the top of the page to view its inspiration."
    />
  )
}
