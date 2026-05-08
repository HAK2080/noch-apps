// CohortsTab.jsx — month-over-month retention heatmap.

import { useEffect, useMemo, useState } from 'react'
import { Activity } from 'lucide-react'
import { getCohortRetention } from '../lib/marketing-supabase'
import toast from 'react-hot-toast'

function colorForPct(pct) {
  if (pct == null) return 'bg-noch-card text-noch-muted'
  if (pct >= 70) return 'bg-noch-green/40 text-white'
  if (pct >= 50) return 'bg-noch-green/25 text-white'
  if (pct >= 30) return 'bg-yellow-500/25 text-white'
  if (pct >= 15) return 'bg-yellow-500/15 text-yellow-200'
  if (pct > 0)   return 'bg-red-500/15 text-red-300'
  return 'bg-noch-card text-noch-muted'
}

export default function CohortsTab() {
  const [months, setMonths] = useState(6)
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    getCohortRetention(months)
      .then(d => { if (!cancelled) setData(d) })
      .catch(err => { if (!cancelled) toast.error(err.message || 'Failed to load') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [months])

  // Group by cohort_month → { offset → { active, retention_pct, cohort_size } }
  const grid = useMemo(() => {
    const byCohort = {}
    for (const r of data) {
      if (!byCohort[r.cohort_month]) {
        byCohort[r.cohort_month] = { cohort_size: r.cohort_size, cells: {} }
      }
      byCohort[r.cohort_month].cells[r.month_offset] = r
    }
    return byCohort
  }, [data])

  const cohortMonths = Object.keys(grid).sort().reverse()
  const offsets = Array.from({ length: months + 1 }, (_, i) => i)

  // Average month-1 retention summary
  const summary = useMemo(() => {
    const m1 = []
    for (const ck of cohortMonths) {
      const cell = grid[ck].cells[1]
      if (cell && cell.retention_pct != null) m1.push(Number(cell.retention_pct))
    }
    return m1.length > 0 ? (m1.reduce((s, v) => s + v, 0) / m1.length) : null
  }, [grid, cohortMonths])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-noch-green"/>
          <h3 className="text-white text-sm font-semibold">Cohort retention</h3>
          <span className="text-noch-muted text-[11px]">% of each acquisition cohort still active in later months</span>
        </div>
        <select className="input py-1 px-2 text-xs" value={months} onChange={e => setMonths(Number(e.target.value))}>
          <option value={6}>6 months</option>
          <option value={12}>12 months</option>
        </select>
      </div>

      {summary != null && (
        <div className="card text-sm text-white">
          <strong>Average month-1 retention:</strong> {summary.toFixed(1)}%
          <span className="text-noch-muted text-xs ml-2">
            {summary >= 30 ? '— healthy' : summary >= 15 ? '— typical café' : '— look at onboarding'}
          </span>
        </div>
      )}

      {loading ? <p className="text-noch-muted text-center py-12">Loading…</p> : (
        cohortMonths.length === 0 ? (
          <div className="card text-center py-10 text-noch-muted text-sm">
            No cohort data yet — needs customers acquired across months.
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="text-xs border-separate" style={{ borderSpacing: '2px' }}>
              <thead>
                <tr>
                  <th className="text-left text-noch-muted pr-2">Cohort</th>
                  <th className="text-right text-noch-muted pr-2">Size</th>
                  {offsets.map(o => <th key={o} className="text-center text-noch-muted px-1">M+{o}</th>)}
                </tr>
              </thead>
              <tbody>
                {cohortMonths.map(ck => (
                  <tr key={ck}>
                    <td className="text-white pr-2">{ck.slice(0, 7)}</td>
                    <td className="text-noch-muted text-right pr-2">{grid[ck].cohort_size}</td>
                    {offsets.map(o => {
                      const cell = grid[ck].cells[o]
                      const pct = cell?.retention_pct != null ? Number(cell.retention_pct) : null
                      return (
                        <td key={o} className="px-0">
                          <div className={`w-12 h-7 rounded text-center leading-7 text-[10px] font-semibold ${colorForPct(pct)}`}>
                            {pct != null ? `${pct.toFixed(0)}%` : ''}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-noch-muted text-[10px] mt-2">
              Each row is a month's new-customer cohort. Cell values = % still active in that month-offset. Activity = pos_orders or loyalty_stamps.
            </p>
          </div>
        )
      )}
    </div>
  )
}
