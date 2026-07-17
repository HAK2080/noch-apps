// DashboardTab.jsx — Expenses: totals + breakdowns
import { useState, useEffect } from 'react'
import { Loader2, X } from 'lucide-react'
import { fmt, amtLyd, loadExpenses, loadCostCenters } from './lib/expensesData'

export default function DashboardTab({ refreshKey }) {
  const [expenses, setExpenses] = useState([])
  const [costCenters, setCostCenters] = useState([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('month')
  const [selectedCc, setSelectedCc] = useState('')

  useEffect(() => { load() }, [refreshKey, period])

  async function load() {
    setLoading(true)
    const now = new Date()
    const start = period === 'month'
      ? new Date(now.getFullYear(), now.getMonth(), 1)
      : period === 'quarter'
        ? new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
        : new Date(now.getFullYear(), 0, 1)
    const [exp, ccs] = await Promise.all([
      loadExpenses(),
      loadCostCenters(),
    ])
    const filtered = exp.filter(e => new Date(e.expense_date) >= start)
    setExpenses(filtered)
    setCostCenters(ccs)
    setLoading(false)
  }

  // Exclude rejected from all totals
  const active = expenses.filter(e => e.status !== 'rejected')
  const total = active.reduce((s, e) => s + amtLyd(e), 0)
  const pending = active.filter(e => e.status === 'pending').reduce((s, e) => s + amtLyd(e), 0)
  const approved = active.filter(e => e.status === 'approved').reduce((s, e) => s + amtLyd(e), 0)
  const paid = active.filter(e => e.status === 'paid').reduce((s, e) => s + amtLyd(e), 0)

  // Per cost center totals
  const byCc = costCenters.map(cc => {
    const ccExp = active.filter(e => e.cost_center_id === cc.id)
    return {
      ...cc,
      total: ccExp.reduce((s, e) => s + amtLyd(e), 0),
      count: ccExp.length,
      pending: ccExp.filter(e => e.status === 'pending').length,
    }
  }).filter(cc => cc.count > 0).sort((a, b) => b.total - a.total)

  // Category breakdown — filtered by selected CC when one is chosen
  const drillExp = selectedCc ? active.filter(e => e.cost_center_id === selectedCc) : active
  const catMap = {}
  drillExp.forEach(e => {
    const k = e.expense_categories?.name || 'Other'
    if (!catMap[k]) catMap[k] = { name: k, total: 0, count: 0 }
    catMap[k].total += amtLyd(e)
    catMap[k].count += 1
  })
  const byCategory = Object.values(catMap).sort((a, b) => b.total - a.total)
  const drillTotal = drillExp.reduce((s, e) => s + amtLyd(e), 0)

  const selectedCcName = costCenters.find(cc => cc.id === selectedCc)?.name

  return (
    <div className="space-y-5">
      {/* Period selector */}
      <div className="flex gap-2 flex-wrap">
        {[['month','This Month'],['quarter','This Quarter'],['year','This Year']].map(([v,l]) => (
          <button key={v} onClick={() => setPeriod(v)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors
              ${period === v ? 'bg-noch-green text-black' : 'bg-noch-card border border-noch-border text-noch-muted hover:text-white'}`}>
            {l}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-noch-muted">
          <Loader2 size={20} className="animate-spin mr-2" /> Loading…
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total Submitted', value: total, color: 'text-white' },
              { label: 'Pending Approval', value: pending, color: 'text-yellow-400' },
              { label: 'Approved', value: approved, color: 'text-noch-green' },
              { label: 'Paid Out', value: paid, color: 'text-blue-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-noch-card border border-noch-border rounded-xl p-4">
                <p className={`text-xl font-bold ${color}`}>{fmt(value)}</p>
                <p className="text-xs text-noch-muted mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* By cost center — click a row to drill in */}
          {byCc.length > 0 && (
            <div className="bg-noch-card border border-noch-border rounded-xl p-4">
              <h3 className="text-white font-semibold text-sm mb-3">By Cost Center</h3>
              <div className="space-y-1">
                {byCc.map(cc => {
                  const pct = total > 0 ? Math.round((cc.total / total) * 100) : 0
                  const isSelected = selectedCc === cc.id
                  return (
                    <button key={cc.id}
                      onClick={() => setSelectedCc(isSelected ? '' : cc.id)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors flex items-center justify-between gap-3
                        ${isSelected ? 'bg-noch-green/15 border border-noch-green/30' : 'hover:bg-noch-dark/60'}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-white font-medium">{cc.id} — {cc.name}</span>
                          {cc.pending > 0 && <span className="text-xs text-yellow-400">{cc.pending} pending</span>}
                        </div>
                        <div className="mt-1 h-1 bg-noch-border rounded-full overflow-hidden">
                          <div className="h-full bg-noch-green rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-sm font-semibold text-white tabular-nums">{fmt(cc.total)}</span>
                        <span className="ml-2 text-xs text-noch-muted">{pct}%</span>
                      </div>
                    </button>
                  )
                })}
              </div>
              {selectedCc && (
                <button onClick={() => setSelectedCc('')}
                  className="mt-2 text-xs text-noch-muted hover:text-white flex items-center gap-1">
                  <X size={11} /> Clear filter
                </button>
              )}
            </div>
          )}

          {/* By category — scoped to selected CC */}
          {byCategory.length > 0 && (
            <div className="bg-noch-card border border-noch-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-semibold text-sm">
                  By Category
                  {selectedCcName && (
                    <span className="ml-2 text-noch-green font-normal">— {selectedCcName}</span>
                  )}
                </h3>
                {selectedCc && (
                  <span className="text-xs text-noch-muted">{fmt(drillTotal)} total</span>
                )}
              </div>
              <div className="space-y-2">
                {byCategory.map(c => {
                  const pct = drillTotal > 0 ? Math.round((c.total / drillTotal) * 100) : 0
                  return (
                    <div key={c.name} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-noch-muted">{c.name}
                          <span className="ml-1 text-xs opacity-50">×{c.count}</span>
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-noch-muted">{pct}%</span>
                          <span className="text-sm font-semibold text-white tabular-nums">{fmt(c.total)}</span>
                        </div>
                      </div>
                      <div className="h-1 bg-noch-border rounded-full overflow-hidden">
                        <div className="h-full bg-noch-green/50 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {expenses.length === 0 && (
            <div className="text-center py-8 text-noch-muted">No expenses recorded this period</div>
          )}
        </>
      )}
    </div>
  )
}
