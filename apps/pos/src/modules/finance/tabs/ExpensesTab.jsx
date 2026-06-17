// ExpensesTab.jsx - Finance view of approved expenses.
//
// The canonical expense workflow lives in /expenses. This tab reads the
// additive finance_expense_documents view so Finance can see both the
// canonical workflow rows and any older expense_entries without duplicating
// entry screens or mutating legacy data.

import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, ExternalLink, Receipt, TrendingDown } from 'lucide-react'
import { lyd } from '../lib/thresholds'
import PeriodSelector from '../components/PeriodSelector'
import { downloadCsv, ExportButtons } from '../../../lib/exportCsv'
import { listCanonicalExpenses, listRecurringExpensesDue } from '../lib/finance-supabase'
import toast from 'react-hot-toast'

function defaultPeriod() {
  const to = new Date(); to.setHours(23, 59, 59, 999)
  const from = new Date(); from.setHours(0, 0, 0, 0)
  from.setDate(from.getDate() - 29)
  const ymd = (d) => d.toISOString().slice(0, 10)
  return { preset: '30d', from: ymd(from), to: ymd(to) }
}

const STATUS_STYLE = {
  approved: 'text-noch-green bg-noch-green/10',
  paid: 'text-blue-400 bg-blue-400/10',
}

const SOURCE_STYLE = {
  expenses: 'text-noch-green bg-noch-green/10 border-noch-green/20',
  expense_entries: 'text-yellow-300 bg-yellow-500/10 border-yellow-500/20',
}

export default function ExpensesTab() {
  const [period, setPeriod] = useState(defaultPeriod)
  const [rows, setRows] = useState([])
  const [recurring, setRecurring] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!period) return
    let cancelled = false
    setLoading(true)
    Promise.all([
      listCanonicalExpenses({ from: period.from, to: period.to }),
      listRecurringExpensesDue(),
    ])
      .then(([expenseRows, recurringRows]) => {
        if (cancelled) return
        setRows((expenseRows || []).filter(r => ['approved', 'paid'].includes(r.status)))
        setRecurring(recurringRows || [])
      })
      .catch(err => toast.error(err.message || 'Failed to load expenses'))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [period?.from, period?.to])

  const total = useMemo(() => rows.reduce((s, r) => s + Number(r.amount_lyd || 0), 0), [rows])

  const byCategory = useMemo(() => {
    const m = {}
    for (const r of rows) {
      const key = r.category_name || 'Uncategorised'
      m[key] = (m[key] || 0) + Number(r.amount_lyd || 0)
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [rows])

  const recurringDueSoon = recurring.filter(r => Number(r.days_until_due) <= 14)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-noch-muted text-xs">
            Finance now reads the consolidated expense register. Canonical <strong className="text-white">workflow expenses</strong> stay primary, while older <strong className="text-white">expense_entries</strong> remain visible until they are retired safely.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ExportButtons onCsv={() => downloadCsv(
            `expenses_${period.from}_${period.to}`,
            ['Date', 'Source', 'Category', 'Cost centre / branch', 'Vendor / note', 'Amount (LYD)', 'Status', 'Payment account'],
            rows.map(r => [
              r.booked_at,
              r.source_table,
              r.category_name || '',
              r.cost_center_name || '',
              r.vendor || r.notes || '',
              Number(r.amount_lyd || 0).toFixed(2),
              r.status,
              r.payment_account_key || '',
            ]),
          )} />
          <a
            href="/expenses"
            className="flex items-center gap-1.5 text-noch-green text-xs font-semibold hover:underline no-print"
          >
            <ExternalLink size={12} /> Open Expenses module
          </a>
        </div>
      </div>

      <PeriodSelector value={period} onChange={setPeriod} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card">
          <p className="text-noch-muted text-xs mb-1">Total OpEx (period)</p>
          <p className="text-white text-xl font-bold">{lyd(total)}</p>
        </div>
        <div className="card">
          <p className="text-noch-muted text-xs mb-1">Entries</p>
          <p className="text-white text-xl font-bold">{rows.length}</p>
        </div>
        <div className="card">
          <p className="text-noch-muted text-xs mb-1">Canonical workflow</p>
          <p className="text-white text-xl font-bold">{rows.filter(r => r.is_canonical_workflow).length}</p>
        </div>
        <div className="card">
          <p className="text-noch-muted text-xs mb-1 flex items-center gap-1"><TrendingDown size={11} /> Top category</p>
          {byCategory[0] ? (
            <>
              <p className="text-white font-semibold text-sm">{byCategory[0][0]}</p>
              <p className="text-noch-muted text-xs">{lyd(byCategory[0][1])}</p>
            </>
          ) : <p className="text-noch-muted text-sm">-</p>}
        </div>
      </div>

      {recurring.length > 0 && (
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <CalendarClock size={14} className="text-noch-green" />
            <h3 className="text-white text-sm font-semibold">Recurring expense scaffolding</h3>
            <span className="text-noch-muted text-xs">read-only due list</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {recurring.slice(0, 6).map(row => (
              <div key={row.id} className="rounded-xl border border-noch-border/60 bg-noch-dark/40 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-white text-sm font-medium truncate">{row.name}</p>
                  <span className={`text-[10px] font-semibold ${Number(row.days_until_due) <= 14 ? 'text-yellow-300' : 'text-noch-muted'}`}>
                    {Number(row.days_until_due) <= 0 ? 'due now' : `${row.days_until_due}d`}
                  </span>
                </div>
                <p className="text-noch-muted text-xs mt-0.5">
                  {row.category_name || 'Uncategorised'} · {row.cost_center_name || '—'} · {row.cadence}
                </p>
                <p className="text-noch-green text-sm font-semibold mt-1">{lyd(row.amount_lyd)}</p>
              </div>
            ))}
          </div>
          {recurringDueSoon.length > 0 && (
            <p className="text-yellow-300 text-xs mt-3">
              {recurringDueSoon.length} recurring outflow{recurringDueSoon.length === 1 ? '' : 's'} due within 14 days.
            </p>
          )}
        </div>
      )}

      {byCategory.length > 0 && (
        <div className="card">
          <h3 className="text-white text-sm font-semibold mb-3 flex items-center gap-2">
            <Receipt size={13} className="text-noch-green" /> By category
          </h3>
          <div className="flex flex-col gap-1">
            {byCategory.map(([cat, amt]) => {
              const pct = total > 0 ? (amt / total) * 100 : 0
              return (
                <div key={cat} className="flex items-center gap-2 py-1">
                  <div className="flex-1">
                    <div className="flex justify-between items-baseline mb-0.5">
                      <span className="text-white text-xs">{cat}</span>
                      <span className="text-noch-muted text-xs font-mono">{lyd(amt)} · {pct.toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 bg-noch-border rounded-full overflow-hidden">
                      <div className="h-full bg-noch-green/60 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-noch-muted text-center py-10">Loading...</p>
      ) : rows.length === 0 ? (
        <div className="card text-center py-10">
          <Receipt size={32} className="mx-auto text-noch-muted mb-2 opacity-30" />
          <p className="text-noch-muted text-sm">No approved expenses in this period.</p>
          <a href="/expenses" className="text-noch-green text-xs mt-2 inline-flex items-center gap-1 hover:underline">
            <ExternalLink size={11} /> Submit or approve expenses
          </a>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-noch-muted">
              <tr>
                <th className="text-left py-1 pr-2">Date</th>
                <th className="text-left py-1 pr-2">Source</th>
                <th className="text-left py-1 pr-2">Category</th>
                <th className="text-left py-1 pr-2">Cost centre / branch</th>
                <th className="text-left py-1 pr-2">Vendor / note</th>
                <th className="text-right py-1 pr-2">Amount</th>
                <th className="text-center py-1 pr-2">Status</th>
                <th className="text-left py-1">Paid via</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={`${r.source_table}-${r.id}`} className="border-t border-noch-border/40">
                  <td className="py-1.5 pr-2 text-noch-muted whitespace-nowrap">{r.booked_at}</td>
                  <td className="py-1.5 pr-2">
                    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${SOURCE_STYLE[r.source_table] || 'text-noch-muted bg-noch-dark border-noch-border'}`}>
                      {r.source_table}
                    </span>
                  </td>
                  <td className="py-1.5 pr-2 text-white">{r.category_name || '-'}</td>
                  <td className="py-1.5 pr-2 text-noch-muted">{r.cost_center_name || '-'}</td>
                  <td className="py-1.5 pr-2 text-noch-muted truncate max-w-[200px]">
                    {r.vendor || r.notes || '-'}
                  </td>
                  <td className="py-1.5 pr-2 text-right font-mono text-white">{lyd(r.amount_lyd)}</td>
                  <td className="py-1.5 pr-2 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_STYLE[r.status] || ''}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="py-1.5 text-noch-muted">
                    {r.payment_account_key || r.legacy_paid_by || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
