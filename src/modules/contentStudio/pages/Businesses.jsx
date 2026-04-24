import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, Plus } from 'lucide-react'
import { listBusinesses } from '../services/businesses'
import EmptyState from '../components/EmptyState'

export default function Businesses() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listBusinesses().then(setRows).finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="text-noch-muted text-sm">Loading…</p>

  if (!rows.length) {
    return (
      <EmptyState
        icon={Building2}
        title="No businesses yet"
        description="Create your first business to start collecting inspiration and generating content."
        ctaLabel="Add a business"
        ctaTo="/content-studio/businesses/new"
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link to="/content-studio/businesses/new" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-noch-green text-noch-dark font-medium text-sm hover:opacity-90">
          <Plus size={16} /> New business
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {rows.map(b => (
          <Link
            key={b.id}
            to={`/content-studio/businesses/${b.id}`}
            className="bg-noch-card border border-noch-border hover:border-noch-green/40 rounded-2xl p-4 transition-colors"
          >
            <h3 className="text-white font-semibold">{b.name}</h3>
            {b.name_ar && <p className="text-noch-muted text-sm" dir="rtl">{b.name_ar}</p>}
            {b.description && <p className="text-noch-muted text-sm mt-2 line-clamp-2">{b.description}</p>}
          </Link>
        ))}
      </div>
    </div>
  )
}
