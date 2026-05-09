// Briefs.jsx — Phase 2 strategic brief list.

import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FileText, Plus, Filter, Loader2, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import { listBriefs, createBrief, blankBrief, BRIEF_STATUSES, computeBriefQuality } from '../services/briefs'

const STATUS_PILL = {
  draft:    'bg-noch-card text-noch-muted border-noch-border',
  ready:    'bg-noch-green/15 text-noch-green border-noch-green/30',
  used:     'bg-blue-500/15 text-blue-400 border-blue-500/30',
  archived: 'bg-noch-border/50 text-noch-muted/70 border-noch-border',
}

export default function Briefs() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const navigate = useNavigate()

  const reload = async () => {
    setLoading(true)
    try {
      setList(await listBriefs(statusFilter === 'all' ? {} : { status: statusFilter }))
    } catch (e) { toast.error(e.message || 'Load failed') }
    finally { setLoading(false) }
  }
  useEffect(() => { reload() }, [statusFilter])

  const onNew = async () => {
    try {
      const row = await createBrief(blankBrief({ title: 'New brief' }))
      navigate(`/content-studio/briefs/${row.id}`)
    } catch (e) { toast.error(e.message || 'Create failed') }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <FileText size={18} className="text-noch-green" />
          <h1 className="text-white text-lg font-semibold">Content Briefs</h1>
          <span className="text-noch-muted text-xs">{list.length}</span>
        </div>
        <button onClick={onNew} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1">
          <Plus size={12} /> New brief
        </button>
      </div>

      <div className="flex items-center gap-1.5 text-xs">
        <Filter size={12} className="text-noch-muted self-center" />
        {['all', ...BRIEF_STATUSES].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-2.5 py-1 rounded-full border ${
              statusFilter === s
                ? 'border-noch-green text-noch-green bg-noch-green/10'
                : 'border-noch-border text-noch-muted hover:text-white'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-noch-muted text-center py-12 flex items-center justify-center gap-2">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </p>
      ) : list.length === 0 ? (
        <div className="text-center py-12 text-noch-muted text-sm">
          <FileText size={28} className="mx-auto mb-2 opacity-50" />
          No briefs yet. Briefs are the strategic step between an inspiration/signal and a draft.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {list.map(b => <BriefCard key={b.id} b={b} />)}
        </div>
      )}
    </div>
  )
}

function BriefCard({ b }) {
  const score = b.quality_score ?? computeBriefQuality(b)
  return (
    <Link
      to={`/content-studio/briefs/${b.id}`}
      className="block bg-noch-card border border-noch-border rounded-2xl p-4 hover:border-noch-green/50 transition-colors"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-white text-sm font-semibold line-clamp-1">{b.title || 'Untitled'}</h3>
        <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-bold border ${STATUS_PILL[b.status] || STATUS_PILL.draft}`}>
          {b.status}
        </span>
      </div>
      {b.objective && <p className="text-noch-muted text-xs line-clamp-2 mb-2">{b.objective}</p>}
      <div className="flex items-center gap-2 text-[11px] text-noch-muted flex-wrap">
        {b.content_pillar && <span className="px-1.5 py-0.5 rounded bg-noch-border/40">{b.content_pillar}</span>}
        {b.nochi_format && <span className="px-1.5 py-0.5 rounded bg-noch-green/10 text-noch-green">{b.nochi_format}</span>}
        {b.platform && <span>{b.platform}</span>}
        {b.format && <span>· {b.format}</span>}
        {score && (
          <span className="ml-auto inline-flex items-center gap-1 text-yellow-400">
            <Sparkles size={10} /> {score}/5
          </span>
        )}
      </div>
      {b.source_signal_type && b.source_signal_type !== 'manual' && (
        <p className="mt-2 text-[10px] text-noch-muted/70">↳ from {b.source_signal_type.replace('_', ' ')}</p>
      )}
    </Link>
  )
}
