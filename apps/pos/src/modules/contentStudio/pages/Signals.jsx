// Signals.jsx — Phase 3 derived content opportunities from POS + loyalty.
// Read-only: no schema added; queries existing tables and groups them
// into signal cards. Each card has "Create brief" → prefills a new
// brief and navigates to it.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, Loader2, RefreshCw, FileText, ShoppingCart, Heart } from 'lucide-react'
import toast from 'react-hot-toast'
import { loadAllSignals } from '../services/signals'
import { createBrief, fromSignal } from '../services/briefs'

const SEVERITY_CLS = {
  good: 'border-noch-green/30 bg-noch-green/5',
  warn: 'border-yellow-500/30 bg-yellow-500/5',
  info: 'border-noch-border bg-noch-card',
}

export default function Signals() {
  const [pos, setPos] = useState([])
  const [loyalty, setLoyalty] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  const reload = async () => {
    setLoading(true); setError(null)
    try {
      const r = await loadAllSignals()
      if (r.error) setError(r.error.message || 'Load failed')
      setPos(r.pos || []); setLoyalty(r.loyalty || [])
    } catch (e) { setError(e.message || 'Load failed') }
    finally { setLoading(false) }
  }
  useEffect(() => { reload() }, [])

  const onCreateBrief = async (signal) => {
    try {
      const draft = fromSignal(signal)
      const row = await createBrief(draft)
      toast.success('Brief created from signal')
      navigate(`/content-studio/briefs/${row.id}`)
    } catch (e) { toast.error(e.message || 'Failed') }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Activity size={18} className="text-noch-green" />
          <h1 className="text-white text-lg font-semibold">Signals</h1>
          <span className="text-noch-muted text-xs">{pos.length + loyalty.length}</span>
        </div>
        <button onClick={reload} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1">
          <RefreshCw size={11} /> Refresh
        </button>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {loading ? (
        <p className="text-noch-muted text-center py-12 flex items-center justify-center gap-2">
          <Loader2 size={14} className="animate-spin" /> Reading POS + loyalty…
        </p>
      ) : (
        <>
          {/* POS */}
          <section>
            <header className="flex items-center gap-2 mb-2">
              <ShoppingCart size={14} className="text-noch-green" />
              <h2 className="text-white text-sm font-semibold">POS signals</h2>
              <span className="text-noch-muted text-xs">{pos.length}</span>
            </header>
            {pos.length === 0 ? (
              <p className="text-noch-muted text-sm pl-6">No POS signals right now — try once you have more sales data.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {pos.map(s => <SignalCard key={s.id} signal={s} onCreateBrief={onCreateBrief} />)}
              </div>
            )}
          </section>

          {/* Loyalty */}
          <section>
            <header className="flex items-center gap-2 mb-2 mt-6">
              <Heart size={14} className="text-noch-green" />
              <h2 className="text-white text-sm font-semibold">Loyalty signals</h2>
              <span className="text-noch-muted text-xs">{loyalty.length}</span>
            </header>
            {loyalty.length === 0 ? (
              <p className="text-noch-muted text-sm pl-6">No loyalty signals right now.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {loyalty.map(s => <SignalCard key={s.id} signal={s} onCreateBrief={onCreateBrief} />)}
              </div>
            )}
          </section>

          <p className="text-noch-muted text-[11px] text-center pt-3">
            No customer phone numbers, names, or PII appear here. Card text is safe to include in public-facing copy.
          </p>
        </>
      )}
    </div>
  )
}

function SignalCard({ signal, onCreateBrief }) {
  return (
    <div className={`border rounded-2xl p-4 ${SEVERITY_CLS[signal.severity] || SEVERITY_CLS.info}`}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 className="text-white text-sm font-semibold">{signal.title}</h3>
        {signal.count != null && (
          <span className="text-[10px] uppercase tracking-wider text-noch-muted shrink-0">{signal.count}</span>
        )}
      </div>
      <p className="text-noch-muted text-xs mb-3">{signal.explanation}</p>
      <div className="text-[11px] space-y-0.5 mb-3">
        {signal.suggested_mission   && <p><span className="text-noch-muted">Mission: </span><span className="text-white/90">{signal.suggested_mission}</span></p>}
        {signal.suggested_audience  && <p><span className="text-noch-muted">Audience: </span><span className="text-white/90">{signal.suggested_audience}</span></p>}
        {signal.suggested_product   && <p><span className="text-noch-muted">Product: </span><span className="text-white/90">{signal.suggested_product}</span></p>}
        {signal.suggested_nochi_format && <p><span className="text-noch-muted">Format: </span><span className="text-noch-green">{signal.suggested_nochi_format}</span></p>}
      </div>
      <button
        onClick={() => onCreateBrief(signal)}
        className="w-full text-xs px-3 py-1.5 rounded-lg bg-noch-green/15 border border-noch-green/30 text-noch-green hover:bg-noch-green/25 flex items-center justify-center gap-1"
      >
        <FileText size={11} /> Create brief from this signal
      </button>
    </div>
  )
}
