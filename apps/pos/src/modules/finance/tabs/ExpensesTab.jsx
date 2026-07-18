// ExpensesTab.jsx — Finance view of approved expenses.
//
// The canonical expense entry, approval workflow, and settings all live in
// the standalone Expenses module (/expenses). This tab is a read-only summary
// that pulls approved/paid rows so Finance has context without duplicating
// data-entry screens. The finance_pnl RPC now UNIONs expense_entries with
// the expenses table, so every approved expense here automatically feeds
// Other OpEx on the Daily P&L.

import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, Receipt, TrendingDown } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { lyd } from '../lib/thresholds'
import PeriodSelector from '../components/PeriodSelector'
import { businessToday } from '../../pos/lib/pos-supabase'
import { downloadCsv, ExportButtons } from '../../../lib/exportCsv'
import toast from 'react-hot-toast'

function defaultPeriod() {
  // Business days (5 AM → 5 AM): before 5 AM, "today" is still the evening's trading day
  const to = businessToday(); to.setHours(23, 59, 59, 999)
  const from = businessToday(); from.setHours(0, 0, 0, 0)
  from.setDate(from.getDate() - 29)
  // Local date, not UTC — toISOString() shifted dates a day back (Libya UTC+2)
  const ymd = (d) => { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` }
  return { preset: '30d', from: ymd(from), to: ymd(to) }
}

async function loadApprovedExpenses({ from, to }) {
  const { data, error } = await supabase
    .from('expenses')
    .select('id, expense_date, amount_lyd, vendor, description, status, paid_by, cost_centers(name), expense_categories(name)')
    .in('status', ['approved', 'paid'])
    .gte('expense_date', from)
    .lte('expense_date', to)
    .order('expense_date', { ascending: false })
  if (error) throw error
  return data || []
}

const STATUS_STYLE = {
  approved: 'text-noch-green bg-noch-green/10',
  paid:     'text-blue-400 bg-blue-400/10',
}

export default function ExpensesTab() {
  const [period, setPeriod] = useState(defaultPeriod)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!period) return
    let cancelled = false
    setLoading(true)
    loadApprovedExpenses({ from: period.from, to: period.to })
      .then(d => { if (!cancelled) setRows(d) })
      .catch(err => toast.error(err.message || 'Failed to load expenses'))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [period?.from, period?.to])

  const total = useMemo(() => rows.reduce((s, r) => s + Number(r.amount_lyd || 0), 0), [rows])

  // Group by category
  const byCategory = useMemo(() => {
    const m = {}
    for (const r of rows) {
      const key = r.expense_categories?.name || 'Uncategorised'
      m[key] = (m[key] || 0) + Number(r.amount_lyd || 0)
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [rows])

  return (
    <div className="flex flex-col gap-4">

      {/* Header with link to full module */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-noch-muted text-xs">
            Showing <strong className="text-white">approved &amp; paid</strong> expenses — all feed into <strong className="text-white">Other OpEx</strong> on the Daily P&amp;L.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ExportButtons onCsv={() => downloadCsv(`expenses_${period.from}_${period.to}`,
            ['Date', 'Category', 'Cost centre', 'Vendor / note', 'Amount (LYD)', 'Status', 'Paid by'],
            rows.map(r => [
              r.expense_date,
              r.expense_categories?.name || '',
              r.cost_centers?.name || '',
              r.vendor || r.description || '',
              Number(r.amount_lyd || 0).toFixed(2),
              r.status,
              r.paid_by || '',
            ]))} />
          <a
            href="/expenses"
            className="flex items-center gap-1.5 text-noch-green text-xs font-semibold hover:underline no-print"
          >
            <ExternalLink size={12} /> Open Expenses module
          </a>
        </div>
      </div>

      <PeriodSelector value={period} onChange={setPeriod} />

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="card">
          <p className="text-noch-muted text-xs mb-1">Total OpEx (period)</p>
          <p className="text-white text-xl font-bold">{lyd(total)}</p>
        </div>
        <div className="card">
          <p className="text-noch-muted text-xs mb-1">Entries</p>
          <p className="text-white text-xl font-bold">{rows.length}</p>
        </div>
        <div className="card col-span-2 sm:col-span-1">
          <p className="text-noch-muted text-xs mb-1 flex items-center gap-1"><TrendingDown size={11}/> Top category</p>
          {byCategory[0] ? (
            <>
              <p className="text-white font-semibold text-sm">{byCategory[0][0]}</p>
              <p className="text-noch-muted text-xs">{lyd(byCategory[0][1])}</p>
            </>
          ) : <p className="text-noch-muted text-sm">—</p>}
        </div>
      </div>

      {/* By-category breakdown */}
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

      {/* Expense rows */}
      {loading ? (
        <p className="text-noch-muted text-center py-10">Loading…</p>
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
                <th className="text-left py-1 pr-2">Category</th>
                <th className="text-left py-1 pr-2">Cost centre</th>
                <th className="text-left py-1 pr-2">Vendor / note</th>
                <th className="text-right py-1 pr-2">Amount</th>
                <th className="text-center py-1">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t border-noch-border/40">
                  <td className="py-1.5 pr-2 text-noch-muted whitespace-nowrap">{r.expense_date}</td>
                  <td className="py-1.5 pr-2 text-white">{r.expense_categories?.name || '—'}</td>
                  <td className="py-1.5 pr-2 text-noch-muted">{r.cost_centers?.name || '—'}</td>
                  <td className="py-1.5 pr-2 text-noch-muted truncate max-w-[160px]">
                    {r.vendor || r.description || '—'}
                  </td>
                  <td className="py-1.5 pr-2 text-right font-mono text-white">{lyd(r.amount_lyd)}</td>
                  <td className="py-1.5 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_STYLE[r.status] || ''}`}>
                      {r.status}
                    </span>
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
