// InsightsTab — Phase 8 owner insights.
// Read-only summaries built on RPCs. AI-only on text generation; no
// segmentation actions taken from this tab.

import { useEffect, useState } from 'react'
import { TrendingUp, Coffee, Award, Loader2 } from 'lucide-react'
import {
  ownerInsightsTopReturning,
  ownerInsightsNearReward,
  ownerInsightsTopDrinks,
} from '../lib/marketing-supabase'
import toast from 'react-hot-toast'

export default function InsightsTab() {
  const [days, setDays] = useState(30)
  const [topReturning, setTopReturning] = useState([])
  const [nearReward, setNearReward] = useState([])
  const [topDrinks, setTopDrinks] = useState([])
  const [loading, setLoading] = useState(true)

  const reload = async () => {
    setLoading(true)
    try {
      const [a, b, c] = await Promise.all([
        ownerInsightsTopReturning(days, 10),
        ownerInsightsNearReward(2, 20),
        ownerInsightsTopDrinks(10),
      ])
      setTopReturning(a); setNearReward(b); setTopDrinks(c)
    } catch (err) { toast.error(err.message || 'Insights failed') }
    finally { setLoading(false) }
  }
  useEffect(() => { reload() }, [days])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp size={14} className="text-noch-green" />
          <h3 className="text-white text-sm font-semibold">Insights</h3>
        </div>
        <select className="input text-xs" value={days} onChange={e => setDays(Number(e.target.value))}>
          <option value={7}>last 7 days</option>
          <option value={30}>last 30 days</option>
          <option value={90}>last 90 days</option>
        </select>
      </div>

      {loading && <p className="text-noch-muted text-center py-12 flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading…</p>}

      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Panel
            icon={Award}
            title={`Top returning (${days}d)`}
            empty="No repeat customers in this window."
            rows={topReturning.map(r => ({
              key: r.customer_id,
              left: r.full_name,
              middle: r.tier,
              right: `${r.visits} visits`,
              sub: r.top_drink || '—',
            }))}
          />

          <Panel
            icon={Coffee}
            title="Top favourite drinks"
            empty="No favourite drinks recorded yet."
            rows={topDrinks.map((r, i) => ({
              key: `${r.drink}-${i}`,
              left: r.drink,
              right: `${r.customers} customers`,
            }))}
          />

          <div className="md:col-span-2">
            <Panel
              icon={Award}
              title="Within 2 stamps of a reward"
              empty="No one is close right now."
              rows={nearReward.map(r => ({
                key: r.customer_id,
                left: r.full_name,
                middle: r.tier,
                right: `${r.current_stamps}/9 (${r.stamps_to_reward} more)`,
                sub: r.last_visit_at ? `last seen ${new Date(r.last_visit_at).toLocaleDateString('en-GB')}` : '—',
              }))}
            />
          </div>
        </div>
      )}

      <p className="text-noch-muted text-[11px] text-center pt-2">
        Phase 8 — these summaries are deterministic v1. The AI rewrite only changes the wording, never the segmentation.
      </p>
    </div>
  )
}

function Panel({ icon: Icon, title, rows, empty }) {
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} className="text-noch-green" />
        <h4 className="text-white text-sm font-semibold">{title}</h4>
        <span className="text-noch-muted text-[11px]">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-noch-muted text-xs text-center py-4">{empty}</p>
      ) : (
        <ul className="text-xs divide-y divide-noch-border/40">
          {rows.map(r => (
            <li key={r.key} className="py-1.5 flex items-center gap-2">
              <span className="text-white flex-1 truncate">{r.left}</span>
              {r.middle && <span className="text-noch-muted text-[11px]">{r.middle}</span>}
              <span className="text-noch-green font-medium shrink-0">{r.right}</span>
              {r.sub && <span className="text-noch-muted text-[10px] truncate hidden md:inline">— {r.sub}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
