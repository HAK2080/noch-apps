// ExpensesTab.jsx — Finance view of approved expenses.
//
// The canonical expense entry, approval workflow, and settings all live in
// the standalone Expenses module (/expenses). This tab is a read-only summary
// that pulls approved/paid rows so Finance has context without duplicating
// data-entry screens. The finance_pnl RPC now UNIONs expense_entries with
// the expenses table, so every approved expense here automatically feeds
// Other OpEx on the Daily P&L.

import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, Landmark, Receipt, TrendingDown } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { lyd } from '../lib/thresholds'
import { getShareholderFundingBalances, recordShareholderRepayment } from '../lib/finance-supabase'
import { useAuth } from '../../../contexts/AuthContext'
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
  const { isOwner, profile } = useAuth()
  const canFund = isOwner || profile?.role === 'accountant'
  const [period, setPeriod] = useState(defaultPeriod)
  const [rows, setRows] = useState([])
  const [loadedKey, setLoadedKey] = useState(null)
  const [ccFilter, setCcFilter] = useState('all')
  const [catFilter, setCatFilter] = useState('all')
  // Shareholder funding card state (owner/accountant only)
  const today = (() => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` })()
  const [balances, setBalances] = useState([])
  const [repay, setRepay] = useState({ paid_to: '', amount: '', currency: 'LYD', rate: '1', date: today, note: '' })
  const [repaySaving, setRepaySaving] = useState(false)

  const periodKey = period ? `${period.from}_${period.to}` : null
  // Derived, not set in the effect: loading until the fetch for this period lands
  const loading = loadedKey !== periodKey

  useEffect(() => {
    if (!period) return
    let cancelled = false
    loadApprovedExpenses({ from: period.from, to: period.to })
      .then(d => { if (!cancelled) { setRows(d); setLoadedKey(`${period.from}_${period.to}`) } })
      .catch(err => {
        toast.error(err.message || 'Failed to load expenses')
        if (!cancelled) setLoadedKey(`${period.from}_${period.to}`)
      })
    return () => { cancelled = true }
  }, [period?.from, period?.to])

  // Shareholder funding balances — owner/accountant only
  useEffect(() => {
    if (!canFund) return
    let cancelled = false
    getShareholderFundingBalances()
      .then(d => { if (!cancelled) setBalances(d) })
      .catch(err => toast.error(err.message || 'Failed to load shareholder balances'))
    return () => { cancelled = true }
  }, [canFund])

  async function reloadBalances() {
    try { setBalances(await getShareholderFundingBalances()) }
    catch (err) { toast.error(err.message || 'Failed to load shareholder balances') }
  }

  const repayAmount = parseFloat(repay.amount || 0)
  const repayRate = parseFloat(repay.rate || 0)
  const repayLyd = repayAmount * repayRate

  async function submitRepayment() {
    if (!repay.paid_to) { toast.error('Select a person'); return }
    if (!repay.amount || isNaN(repayAmount) || repayAmount <= 0) { toast.error('Enter a valid amount'); return }
    if (!repay.rate || isNaN(repayRate) || repayRate <= 0) { toast.error('Enter a valid rate'); return }
    setRepaySaving(true)
    try {
      await recordShareholderRepayment({
        paid_to: repay.paid_to,
        amount: repayAmount,
        currency: repay.currency,
        rate: repayRate,
        amount_lyd: repayLyd,
        date: repay.date,
        note: repay.note || null,
      })
      toast.success('Repayment recorded')
      setRepay({ paid_to: '', amount: '', currency: 'LYD', rate: '1', date: today, note: '' })
      await reloadBalances()
    } catch (err) {
      toast.error(err.message || 'Failed to record repayment')
    } finally {
      setRepaySaving(false)
    }
  }

  // Filter options derive from the loaded rows — no extra queries needed
  const ccOptions = useMemo(() => [...new Set(rows.map(r => r.cost_centers?.name).filter(Boolean))].sort(), [rows])
  const catOptions = useMemo(() => [...new Set(rows.map(r => r.expense_categories?.name).filter(Boolean))].sort(), [rows])

  // A selection can outlive the period that offered it — fall back to "all"
  const ccActive = ccFilter !== 'all' && !ccOptions.includes(ccFilter) ? 'all' : ccFilter
  const catActive = catFilter !== 'all' && !catOptions.includes(catFilter) ? 'all' : catFilter

  const filtered = useMemo(() => rows.filter(r =>
    (ccActive === 'all' || r.cost_centers?.name === ccActive) &&
    (catActive === 'all' || r.expense_categories?.name === catActive)
  ), [rows, ccActive, catActive])

  const total = useMemo(() => filtered.reduce((s, r) => s + Number(r.amount_lyd || 0), 0), [filtered])

  // Group by category
  const byCategory = useMemo(() => {
    const m = {}
    for (const r of filtered) {
      const key = r.expense_categories?.name || 'Uncategorised'
      m[key] = (m[key] || 0) + Number(r.amount_lyd || 0)
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [filtered])

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
            filtered.map(r => [
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

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1"><PeriodSelector value={period} onChange={setPeriod} /></div>
        <div className="flex items-center gap-2">
          <label className="text-noch-muted text-xs whitespace-nowrap">Cost centre</label>
          <select value={ccActive} onChange={e => setCcFilter(e.target.value)} className="input py-2 text-sm">
            <option value="all">All cost centres</option>
            {ccOptions.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-noch-muted text-xs whitespace-nowrap">Category</label>
          <select value={catActive} onChange={e => setCatFilter(e.target.value)} className="input py-2 text-sm">
            <option value="all">All categories</option>
            {catOptions.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        {(ccActive !== 'all' || catActive !== 'all') && (
          <button onClick={() => { setCcFilter('all'); setCatFilter('all') }}
            className="text-noch-muted text-xs hover:text-white whitespace-nowrap">
            Clear filters
          </button>
        )}
      </div>

      {/* Shareholder funding — owner/accountant only */}
      {canFund && (
        <div className="card">
          <h3 className="text-white text-sm font-semibold mb-3 flex items-center gap-2">
            <Landmark size={13} className="text-noch-green" /> Shareholder funding
          </h3>
          {balances.length === 0 ? (
            <p className="text-noch-muted text-xs mb-4">No shareholder funding recorded yet.</p>
          ) : (
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-xs">
                <thead className="text-noch-muted">
                  <tr>
                    <th className="text-left py-1 pr-2">Person</th>
                    <th className="text-right py-1 pr-2">Loaned</th>
                    <th className="text-right py-1 pr-2">Repaid</th>
                    <th className="text-right py-1 pr-2">Outstanding</th>
                    <th className="text-right py-1">Capital injected</th>
                  </tr>
                </thead>
                <tbody>
                  {balances.map(b => (
                    <tr key={b.paid_by} className="border-t border-noch-border/40">
                      <td className="py-1.5 pr-2 text-white">{b.paid_by}</td>
                      <td className="py-1.5 pr-2 text-right font-mono text-white">{lyd(b.loans_lyd)}</td>
                      <td className="py-1.5 pr-2 text-right font-mono text-noch-muted">{lyd(b.repayments_lyd)}</td>
                      <td className="py-1.5 pr-2 text-right font-mono text-white">{lyd(b.outstanding_lyd)}</td>
                      <td className="py-1.5 text-right font-mono text-noch-muted">{lyd(b.capital_lyd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Record repayment */}
          <div className="border-t border-noch-border/40 pt-3">
            <p className="text-noch-muted text-xs font-semibold mb-2">Record repayment</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <select value={repay.paid_to} onChange={e => setRepay(r => ({ ...r, paid_to: e.target.value }))}
                className="input py-2 text-sm">
                <option value="">Person…</option>
                {balances.map(b => <option key={b.paid_by} value={b.paid_by}>{b.paid_by}</option>)}
              </select>
              <input type="number" min="0" step="0.01" placeholder="Amount"
                value={repay.amount} onChange={e => setRepay(r => ({ ...r, amount: e.target.value }))}
                className="input py-2 text-sm" />
              <div className="flex gap-2">
                <select value={repay.currency}
                  onChange={e => setRepay(r => ({ ...r, currency: e.target.value, rate: e.target.value === 'LYD' ? '1' : r.rate }))}
                  className="input py-2 text-sm flex-1">
                  {['LYD', 'USD', 'EUR', 'GBP', 'AED'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input type="number" min="0" step="0.0001" placeholder="Rate" title="Rate to LYD"
                  value={repay.rate} onChange={e => setRepay(r => ({ ...r, rate: e.target.value }))}
                  className="input py-2 text-sm w-24" />
              </div>
              <input type="date" value={repay.date}
                onChange={e => setRepay(r => ({ ...r, date: e.target.value }))}
                className="input py-2 text-sm" />
              <input type="text" placeholder="Note (optional)"
                value={repay.note} onChange={e => setRepay(r => ({ ...r, note: e.target.value }))}
                className="input py-2 text-sm col-span-2" />
            </div>
            <div className="flex items-center justify-between mt-3">
              <p className="text-noch-muted text-xs">
                {repayAmount > 0 && repayRate > 0 ? `≈ ${lyd(repayLyd)}` : 'LYD equivalent preview'}
              </p>
              <button onClick={submitRepayment} disabled={repaySaving} className="btn-secondary text-sm">
                {repaySaving ? 'Recording…' : 'Record repayment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="card">
          <p className="text-noch-muted text-xs mb-1">Total OpEx (period)</p>
          <p className="text-white text-xl font-bold">{lyd(total)}</p>
        </div>
        <div className="card">
          <p className="text-noch-muted text-xs mb-1">Entries</p>
          <p className="text-white text-xl font-bold">{filtered.length}</p>
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
      ) : filtered.length === 0 ? (
        <div className="card text-center py-10">
          <Receipt size={32} className="mx-auto text-noch-muted mb-2 opacity-30" />
          <p className="text-noch-muted text-sm">No expenses match the selected filters.</p>
          <button onClick={() => { setCcFilter('all'); setCatFilter('all') }}
            className="text-noch-green text-xs mt-2 hover:underline">
            Clear filters
          </button>
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
              {filtered.map(r => (
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
