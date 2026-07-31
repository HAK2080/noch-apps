// MyExpensesTab.jsx — Expenses: staff's own submission history
import { useState, useEffect } from 'react'
import { Loader2, Eye, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { fmt, amtLyd, loadExpenses, loadApprovals, deleteExpense } from './lib/expensesData'
import StatusBadge from './StatusBadge'
import PaymentDeclarationBadge from './PaymentDeclarationBadge'

// Local YYYY-MM-DD bounds — expense_date is a date column, string compare works
function periodRange(p) {
  const pad = n => String(n).padStart(2, '0')
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const now = new Date()
  if (p === 'month') return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(now) }
  if (p === 'lastmonth') {
    return {
      from: ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      to: ymd(new Date(now.getFullYear(), now.getMonth(), 0)),
    }
  }
  if (p === '30d') {
    const from = new Date(now)
    from.setDate(from.getDate() - 29)
    return { from: ymd(from), to: ymd(now) }
  }
  return null
}

export default function MyExpensesTab({ userId, refreshKey }) {
  const [expenses, setExpenses] = useState([])
  const [approvals, setApprovals] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [periodFilter, setPeriodFilter] = useState('all')
  const [ccFilter, setCcFilter] = useState('all')
  const [catFilter, setCatFilter] = useState('all')
  const [deleting, setDeleting] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const data = await loadExpenses({ userId })
      if (cancelled) return
      setExpenses(data)
      if (data.length) {
        const appr = await loadApprovals(data.map(e => e.id))
        if (!cancelled) setApprovals(appr)
      }
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [userId, refreshKey, reloadKey])

  async function handleDelete(id) {
    setDeleting(id)
    try {
      await deleteExpense(id)
      toast.success('Expense removed')
      setConfirmDelete(null)
      setReloadKey(k => k + 1)
    } catch (err) { toast.error(err.message) }
    setDeleting(null)
  }

  // Filter options derive from the user's own loaded rows — no extra queries
  const ccOptions = [...new Set(expenses.map(e => e.cost_centers?.name).filter(Boolean))].sort()
  const catOptions = [...new Set(expenses.map(e => e.expense_categories?.name).filter(Boolean))].sort()
  const range = periodRange(periodFilter)

  const filtered = expenses.filter(e =>
    (filter === 'all' || e.status === filter) &&
    (ccFilter === 'all' || e.cost_centers?.name === ccFilter) &&
    (catFilter === 'all' || e.expense_categories?.name === catFilter) &&
    (!range || (e.expense_date >= range.from && e.expense_date <= range.to))
  )
  const totalLyd = filtered.reduce((s, e) => s + amtLyd(e), 0)

  return (
    <div className="space-y-4">
      {/* Filter pills */}
      <div className="flex gap-2 flex-wrap">
        {['all', 'pending', 'approved', 'rejected', 'paid'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors
              ${filter === s ? 'bg-noch-green text-black' : 'bg-noch-card border border-noch-border text-noch-muted hover:text-white'}`}>
            {s === 'all' ? `All (${expenses.length})` : `${s} (${expenses.filter(e => e.status === s).length})`}
          </button>
        ))}
      </div>

      {/* Period / cost centre / category filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={periodFilter} onChange={e => setPeriodFilter(e.target.value)} className="input py-1.5 text-xs">
          <option value="all">All time</option>
          <option value="month">This month</option>
          <option value="lastmonth">Last month</option>
          <option value="30d">Last 30 days</option>
        </select>
        <select value={ccFilter} onChange={e => setCcFilter(e.target.value)} className="input py-1.5 text-xs">
          <option value="all">All cost centres</option>
          {ccOptions.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="input py-1.5 text-xs">
          <option value="all">All categories</option>
          {catOptions.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        {(periodFilter !== 'all' || ccFilter !== 'all' || catFilter !== 'all') && (
          <button onClick={() => { setPeriodFilter('all'); setCcFilter('all'); setCatFilter('all') }}
            className="text-noch-muted text-xs hover:text-white">
            Clear filters
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-noch-muted">
          <Loader2 size={20} className="animate-spin mr-2" /> Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-noch-muted">No expenses found</div>
      ) : (
        <>
          <div className="text-xs text-noch-muted">Total: <span className="text-white font-semibold">{fmt(totalLyd)}</span></div>
          <div className="space-y-3">
            {filtered.map(exp => {
              const appr = approvals.filter(a => a.expense_id === exp.id)
              const lastAppr = appr[0]
              return (
                <div key={exp.id} className="bg-noch-card border border-noch-border rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white font-semibold text-sm">{fmt(exp.amount, exp.currency)}</span>
                        {exp.currency !== 'LYD' && <span className="text-noch-muted text-xs">≈ {fmt(exp.amount_lyd)}</span>}
                        <StatusBadge status={exp.status} />
                        <PaymentDeclarationBadge expense={exp} />
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-xs text-noch-muted">{exp.cost_centers?.id} — {exp.cost_centers?.name}</span>
                        <span className="text-noch-muted opacity-40">·</span>
                        <span className="text-xs text-noch-muted">{exp.expense_categories?.name}</span>
                      </div>
                      {exp.paid_by && exp.paid_by !== 'Business' && <p className="text-xs text-yellow-400 mt-0.5">💳 Paid by {exp.paid_by}</p>}
                      {exp.vendor && <p className="text-xs text-noch-muted mt-0.5">📍 {exp.vendor}</p>}
                      {exp.description && <p className="text-xs text-noch-muted mt-1 italic">"{exp.description}"</p>}
                      {lastAppr?.notes && (
                        <p className="text-xs text-red-400 mt-1">Note: {lastAppr.notes}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-noch-muted">{exp.expense_date}</p>
                      {exp.receipt_url && (
                        <a href={exp.receipt_url} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-noch-green hover:underline flex items-center gap-1 mt-1 justify-end">
                          <Eye size={11} /> Receipt
                        </a>
                      )}
                    </div>
                  </div>
                  {exp.status === 'rejected' && (
                    <div className="mt-3 pt-3 border-t border-noch-border">
                      {confirmDelete === exp.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-red-400 flex-1">Remove this expense permanently?</span>
                          <button onClick={() => handleDelete(exp.id)} disabled={deleting === exp.id}
                            className="text-xs bg-red-500 text-white px-3 py-1.5 rounded-lg hover:bg-red-600 disabled:opacity-50 flex items-center gap-1">
                            {deleting === exp.id ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />} Delete
                          </button>
                          <button onClick={() => setConfirmDelete(null)}
                            className="text-xs text-noch-muted px-3 py-1.5 rounded-lg hover:text-white">Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDelete(exp.id)}
                          className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1">
                          <X size={12} /> Remove rejected expense
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
