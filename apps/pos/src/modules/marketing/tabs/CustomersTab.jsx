// CustomersTab.jsx — segment counts, list, link to /loyalty/customers/:id

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, RefreshCw, AlertTriangle } from 'lucide-react'
import { listSegments, refreshSegments, listLoyaltyDuplicates, loyaltyLinkRate } from '../lib/marketing-supabase'
import SegmentBadge from '../components/SegmentBadge'
import toast from 'react-hot-toast'

const SEG_KEYS = ['vip', 'regular', 'occasional', 'at_risk', 'churned', 'new']

export default function CustomersTab() {
  const nav = useNavigate()
  const [segments, setSegments] = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [duplicates, setDuplicates] = useState([])
  const [linkRate, setLinkRate] = useState(null)

  const reload = async () => {
    setLoading(true)
    try {
      const [segs, dups, rate] = await Promise.all([
        listSegments(),
        listLoyaltyDuplicates(),
        loyaltyLinkRate({ from: new Date(Date.now() - 30*86400e3).toISOString() }),
      ])
      setSegments(segs); setDuplicates(dups); setLinkRate(rate)
    } catch (err) { toast.error(err.message || 'Failed to load') }
    finally { setLoading(false) }
  }
  useEffect(() => { reload() }, [])

  const counts = useMemo(() => {
    const c = { vip: 0, regular: 0, occasional: 0, at_risk: 0, churned: 0, new: 0 }
    segments.forEach(s => { c[s.segment] = (c[s.segment] || 0) + 1 })
    return c
  }, [segments])

  const visible = filter === 'all' ? segments : segments.filter(s => s.segment === filter)

  const onRefresh = async () => {
    setRefreshing(true)
    try {
      const n = await refreshSegments()
      toast.success(`Refreshed ${n} customers`)
      reload()
    } catch (err) { toast.error(err.message || 'Refresh failed') }
    finally { setRefreshing(false) }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Health: % of orders linked to loyalty over last 30 days */}
      {linkRate && linkRate.total > 0 && (
        <div className={`rounded-xl border p-3 text-sm ${
          linkRate.pct >= 0.5 ? 'bg-noch-green/10 border-noch-green/30 text-noch-green'
          : linkRate.pct >= 0.3 ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-300'
          : 'bg-red-500/10 border-red-500/30 text-red-300'
        }`}>
          <strong>{(linkRate.pct * 100).toFixed(0)}%</strong> of last 30 days' orders are linked to a loyalty customer ({linkRate.linked} / {linkRate.total}).
          {linkRate.pct < 0.3 && ' Encourage QR scans at the POS — these numbers are biased low.'}
        </div>
      )}

      {/* Duplicates banner */}
      {duplicates.length > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 flex items-start gap-2 text-sm text-yellow-200">
          <AlertTriangle className="text-yellow-400 shrink-0 mt-0.5" size={16} />
          <div>
            <strong>{duplicates.length}</strong> phone-number{duplicates.length === 1 ? '' : 's'} have multiple records. These will inflate VIP/Regular counts.
            <ul className="text-yellow-300/80 text-xs mt-1 list-disc list-inside">
              {duplicates.slice(0, 4).map(d => <li key={d.phone_normalised}>{d.phone_normalised} — {d.dup_count} records</li>)}
              {duplicates.length > 4 && <li>…and {duplicates.length - 4} more</li>}
            </ul>
            <p className="text-yellow-300/70 text-[11px] mt-1">Manual merge for v1; auto-merge UI is Phase 2.5.</p>
          </div>
        </div>
      )}

      {/* Segment KPIs */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        <SegCard k="all"        label="All"         active={filter} count={segments.length} onClick={() => setFilter('all')} />
        {SEG_KEYS.map(k => (
          <SegCard key={k} k={k} label={SegmentBadge.STYLES[k].label} active={filter} count={counts[k]} onClick={() => setFilter(k)} />
        ))}
      </div>

      <div className="flex justify-between items-center">
        <p className="text-noch-muted text-xs">{visible.length} customer{visible.length === 1 ? '' : 's'}</p>
        <button onClick={onRefresh} disabled={refreshing} className="btn-secondary text-xs px-3 py-1 flex items-center gap-1">
          <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''}/> Refresh
        </button>
      </div>

      {loading ? <p className="text-noch-muted text-center py-12">Loading…</p> : visible.length === 0 ? (
        <div className="card text-center py-10 text-noch-muted text-sm">
          <Users size={28} className="mx-auto mb-2"/>
          {filter === 'all'
            ? 'No segmented customers yet. Hit Refresh after the first nightly run, or once orders are linked.'
            : `No customers in "${filter}".`}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-noch-muted">
              <tr>
                <th className="text-left py-1 pr-2">Customer</th>
                <th className="text-left py-1 pr-2">Phone</th>
                <th className="text-left py-1 pr-2">Segment</th>
                <th className="text-right py-1 pr-2">RFM</th>
                <th className="text-right py-1 pr-2">Visits</th>
                <th className="text-right py-1 pr-2">Spend (LYD)</th>
                <th className="text-left py-1 pr-2">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(s => (
                <tr key={s.customer_id} className="border-t border-noch-border/40 cursor-pointer hover:bg-noch-dark/30"
                    onClick={() => nav(`/loyalty/customers/${s.customer_id}`)}>
                  <td className="py-1.5 pr-2 text-white">{s.loyalty_customers?.full_name || '—'}</td>
                  <td className="py-1.5 pr-2 text-noch-muted">{s.loyalty_customers?.phone_normalised || s.loyalty_customers?.phone}</td>
                  <td className="py-1.5 pr-2"><SegmentBadge segment={s.segment}/></td>
                  <td className="py-1.5 pr-2 text-right text-white font-mono">{s.recency_score}-{s.frequency_score}-{s.monetary_score}</td>
                  <td className="py-1.5 pr-2 text-right text-white">{s.total_visits}</td>
                  <td className="py-1.5 pr-2 text-right text-noch-green font-mono">{Number(s.total_spend_lyd).toFixed(2)}</td>
                  <td className="py-1.5 pr-2 text-noch-muted">{s.last_visit_at ? new Date(s.last_visit_at).toLocaleDateString('en-GB') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function SegCard({ k, label, count, active, onClick }) {
  return (
    <button onClick={onClick}
      className={`rounded-xl border p-2 text-center text-xs transition ${
        active === k ? 'border-noch-green bg-noch-green/10' : 'border-noch-border hover:border-noch-green/30'
      }`}
    >
      <p className="text-noch-muted text-[10px] uppercase">{label}</p>
      <p className="text-white font-bold text-lg">{count || 0}</p>
    </button>
  )
}
