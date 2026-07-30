// ExpensesTab.jsx - Finance view of approved expenses.
//
// The canonical expense workflow lives in /expenses. This tab reads the
// additive finance_expense_documents view so Finance can see both the
// canonical workflow rows and any older expense_entries without duplicating
// entry screens or mutating legacy data.

import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, ExternalLink, Landmark, Pencil, Plus, Receipt, TrendingDown } from 'lucide-react'
import { lyd } from '../lib/thresholds'
import { getShareholderFundingBalances, recordShareholderRepayment } from '../lib/finance-supabase'
import PeriodSelector from '../components/PeriodSelector'
import { businessToday } from '../../../lib/businessDay'
import { downloadCsv, ExportButtons } from '../../../lib/exportCsv'
import {
  deactivateRecurringExpenseTemplate,
  listCanonicalExpenses,
  listExpenseReferenceData,
  listRecurringExpenseTemplates,
  listRecurringExpensesDue,
  upsertRecurringExpenseTemplate,
} from '../lib/finance-supabase'
import { useAuth } from '../../../contexts/AuthContext'
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

function todayYmd() {
  return new Date().toISOString().slice(0, 10)
}

function blankTemplate() {
  return {
    id: null,
    name: '',
    vendor: '',
    category_id: '',
    cost_center_id: '',
    amount: '',
    cadence: 'monthly',
    next_due_on: todayYmd(),
    paid_by: 'Business',
    notes: '',
    is_active: true,
  }
}

const STATUS_STYLE = {
  approved: 'text-noch-green bg-noch-green/10',
  paid: 'text-blue-400 bg-blue-400/10',
}

const SOURCE_STYLE = {
  expenses: 'text-noch-green bg-noch-green/10 border-noch-green/20',
  expense_entries: 'text-yellow-300 bg-yellow-500/10 border-yellow-500/20',
}

export default function ExpensesTab({ readOnly = false }) {
  const { isOwner, profile } = useAuth()
  const canFund = isOwner || profile?.role === 'accountant'
  const canManageRecurring = !readOnly && profile?.role === 'owner'
  const [period, setPeriod] = useState(defaultPeriod)
  const [rows, setRows] = useState([])
  const [ccFilter, setCcFilter] = useState('all')
  const [catFilter, setCatFilter] = useState('all')
  // Shareholder funding card state (owner/accountant only)
  const today = (() => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` })()
  const [balances, setBalances] = useState([])
  const [repay, setRepay] = useState({ paid_to: '', amount: '', currency: 'LYD', rate: '1', date: today, note: '' })
  const [repaySaving, setRepaySaving] = useState(false)
  const [recurring, setRecurring] = useState([])
  const [templates, setTemplates] = useState([])
  const [referenceData, setReferenceData] = useState({ costCenters: [], categories: [] })
  const [templateForm, setTemplateForm] = useState(blankTemplate)
  const [templateSaving, setTemplateSaving] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!period) return
    let cancelled = false
    setLoading(true)
    Promise.all([
      listCanonicalExpenses({ from: period.from, to: period.to }),
      listRecurringExpensesDue(),
      listRecurringExpenseTemplates(),
      listExpenseReferenceData(),
    ])
      .then(([expenseRows, recurringRows, templateRows, refs]) => {
        if (cancelled) return
        setRows((expenseRows || []).filter(r => ['approved', 'paid'].includes(r.status)))
        setRecurring(recurringRows || [])
        setTemplates(templateRows || [])
        setReferenceData(refs || { costCenters: [], categories: [] })
      })
      .catch(err => toast.error(err.message || 'Failed to load expenses'))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [period?.from, period?.to, canManageRecurring, refreshTick])

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
  const ccOptions = useMemo(() => [...new Set(rows.map(r => r.cost_center_name).filter(Boolean))].sort(), [rows])
  const catOptions = useMemo(() => [...new Set(rows.map(r => r.category_name).filter(Boolean))].sort(), [rows])

  // A selection can outlive the period that offered it — fall back to "all"
  const ccActive = ccFilter !== 'all' && !ccOptions.includes(ccFilter) ? 'all' : ccFilter
  const catActive = catFilter !== 'all' && !catOptions.includes(catFilter) ? 'all' : catFilter

  const filtered = useMemo(() => rows.filter(r =>
    (ccActive === 'all' || r.cost_center_name === ccActive) &&
    (catActive === 'all' || r.category_name === catActive)
  ), [rows, ccActive, catActive])

  const total = useMemo(() => filtered.reduce((s, r) => s + Number(r.amount_lyd || 0), 0), [filtered])
  const categoryLookup = useMemo(
    () => Object.fromEntries((referenceData.categories || []).map(row => [row.id, row.name])),
    [referenceData.categories],
  )
  const costCenterLookup = useMemo(
    () => Object.fromEntries((referenceData.costCenters || []).map(row => [row.id, row.name])),
    [referenceData.costCenters],
  )

  const byCategory = useMemo(() => {
    const m = {}
    for (const r of filtered) {
      const key = r.category_name || 'Uncategorised'
      m[key] = (m[key] || 0) + Number(r.amount_lyd || 0)
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [filtered])

  const recurringDueSoon = recurring.filter(r => Number(r.days_until_due) <= 14)
  const activeTemplates = templates.filter(row => row.is_active !== false)

  async function handleSaveTemplate() {
    const amount = Number(templateForm.amount || 0)
    if (!templateForm.name.trim()) {
      toast.error('Template name is required')
      return
    }
    if (!(amount > 0)) {
      toast.error('Amount must be greater than zero')
      return
    }
    if (!templateForm.next_due_on) {
      toast.error('Next due date is required')
      return
    }

    setTemplateSaving(true)
    try {
      await upsertRecurringExpenseTemplate({
        id: templateForm.id || undefined,
        name: templateForm.name.trim(),
        vendor: templateForm.vendor.trim() || null,
        category_id: templateForm.category_id || null,
        cost_center_id: templateForm.cost_center_id || null,
        amount,
        currency: 'LYD',
        exchange_rate_to_lyd: 1,
        amount_lyd: amount,
        cadence: templateForm.cadence,
        next_due_on: templateForm.next_due_on,
        paid_by: templateForm.paid_by || 'Business',
        notes: templateForm.notes.trim() || null,
        is_active: true,
      })
      toast.success(templateForm.id ? 'Recurring template updated' : 'Recurring template created')
      setTemplateForm(blankTemplate())
      setRefreshTick(x => x + 1)
    } catch (err) {
      toast.error(err.message || 'Failed to save recurring template')
    } finally {
      setTemplateSaving(false)
    }
  }

  async function handleArchiveTemplate(id) {
    if (!window.confirm('Archive this recurring template? It will stay in history but no longer appear as due.')) return
    try {
      await deactivateRecurringExpenseTemplate(id)
      toast.success('Recurring template archived')
      if (templateForm.id === id) setTemplateForm(blankTemplate())
      setRefreshTick(x => x + 1)
    } catch (err) {
      toast.error(err.message || 'Failed to archive recurring template')
    }
  }

  function startEditTemplate(template) {
    setTemplateForm({
      id: template.id,
      name: template.name || '',
      vendor: template.vendor || '',
      category_id: template.category_id || '',
      cost_center_id: template.cost_center_id || '',
      amount: String(template.amount ?? template.amount_lyd ?? ''),
      cadence: template.cadence || 'monthly',
      next_due_on: template.next_due_on || todayYmd(),
      paid_by: template.paid_by || 'Business',
      notes: template.notes || '',
      is_active: template.is_active !== false,
    })
  }

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
            filtered.map(r => [
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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card">
          <p className="text-noch-muted text-xs mb-1">Total OpEx (period)</p>
          <p className="text-white text-xl font-bold">{lyd(total)}</p>
        </div>
        <div className="card">
          <p className="text-noch-muted text-xs mb-1">Entries</p>
          <p className="text-white text-xl font-bold">{filtered.length}</p>
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

      {(canManageRecurring || activeTemplates.length > 0) && (
        <div className="card">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
            <div>
              <h3 className="text-white text-sm font-semibold">Recurring templates</h3>
              <p className="text-noch-muted text-xs mt-1">
                Safe additive planning layer. Templates help track known outflows without deleting or rewriting live expenses.
              </p>
            </div>
            {canManageRecurring && (
              <button
                type="button"
                onClick={() => setTemplateForm(blankTemplate())}
                className="btn-secondary text-xs flex items-center gap-1"
              >
                <Plus size={12} /> {templateForm.id ? 'New template' : 'Add recurring template'}
              </button>
            )}
          </div>

          {canManageRecurring && (
            <div className="rounded-xl border border-noch-border/60 bg-noch-dark/30 p-3 mb-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-noch-muted text-xs block mb-1">Template name</label>
                  <input
                    value={templateForm.name}
                    onChange={e => setTemplateForm(s => ({ ...s, name: e.target.value }))}
                    className="input w-full text-sm"
                    placeholder="Rent, internet, coffee bean retainer..."
                  />
                </div>
                <div>
                  <label className="text-noch-muted text-xs block mb-1">Vendor</label>
                  <input
                    value={templateForm.vendor}
                    onChange={e => setTemplateForm(s => ({ ...s, vendor: e.target.value }))}
                    className="input w-full text-sm"
                    placeholder="Supplier or landlord"
                  />
                </div>
                <div>
                  <label className="text-noch-muted text-xs block mb-1">Amount (LYD)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={templateForm.amount}
                    onChange={e => setTemplateForm(s => ({ ...s, amount: e.target.value }))}
                    className="input w-full text-sm"
                  />
                </div>
                <div>
                  <label className="text-noch-muted text-xs block mb-1">Cadence</label>
                  <select
                    value={templateForm.cadence}
                    onChange={e => setTemplateForm(s => ({ ...s, cadence: e.target.value }))}
                    className="input w-full text-sm"
                  >
                    {['weekly', 'monthly', 'quarterly', 'yearly'].map(value => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-noch-muted text-xs block mb-1">Next due</label>
                  <input
                    type="date"
                    value={templateForm.next_due_on}
                    onChange={e => setTemplateForm(s => ({ ...s, next_due_on: e.target.value }))}
                    className="input w-full text-sm"
                  />
                </div>
                <div>
                  <label className="text-noch-muted text-xs block mb-1">Paid by</label>
                  <select
                    value={templateForm.paid_by}
                    onChange={e => setTemplateForm(s => ({ ...s, paid_by: e.target.value }))}
                    className="input w-full text-sm"
                  >
                    {['Business', 'Owner', 'Petty Cash', 'Bank'].map(value => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-noch-muted text-xs block mb-1">Expense category</label>
                  <select
                    value={templateForm.category_id}
                    onChange={e => setTemplateForm(s => ({ ...s, category_id: e.target.value }))}
                    className="input w-full text-sm"
                  >
                    <option value="">Uncategorised</option>
                    {(referenceData.categories || []).map(category => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-noch-muted text-xs block mb-1">Cost centre</label>
                  <select
                    value={templateForm.cost_center_id}
                    onChange={e => setTemplateForm(s => ({ ...s, cost_center_id: e.target.value }))}
                    className="input w-full text-sm"
                  >
                    <option value="">Unassigned</option>
                    {(referenceData.costCenters || []).map(center => (
                      <option key={center.id} value={center.id}>{center.id} - {center.name}</option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="text-noch-muted text-xs block mb-1">Notes</label>
                  <textarea
                    rows={2}
                    value={templateForm.notes}
                    onChange={e => setTemplateForm(s => ({ ...s, notes: e.target.value }))}
                    className="input w-full text-sm resize-none"
                    placeholder="Optional planning note, contract reminder, payment reference..."
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-3">
                {templateForm.id && (
                  <button
                    type="button"
                    onClick={() => setTemplateForm(blankTemplate())}
                    className="btn-secondary text-xs"
                  >
                    Cancel edit
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSaveTemplate}
                  disabled={templateSaving}
                  className="btn-primary text-xs"
                >
                  {templateSaving ? 'Saving...' : (templateForm.id ? 'Save template' : 'Create template')}
                </button>
              </div>
            </div>
          )}

          {activeTemplates.length === 0 ? (
            <p className="text-noch-muted text-sm">No recurring templates yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {activeTemplates.map(template => (
                <div key={template.id} className="rounded-xl border border-noch-border/60 bg-noch-dark/30 px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-white text-sm font-medium truncate">{template.name}</p>
                      <p className="text-noch-muted text-xs mt-0.5">
                        {template.vendor || 'Recurring vendor'} · {template.cadence} · due {template.next_due_on}
                      </p>
                    </div>
                    <span className="text-noch-green text-sm font-semibold">{lyd(template.amount_lyd ?? template.amount)}</span>
                  </div>
                  <p className="text-noch-muted text-xs mt-2">
                    {categoryLookup[template.category_id] || 'Uncategorised'} · {costCenterLookup[template.cost_center_id] || 'Unassigned'}
                  </p>
                  {template.notes && <p className="text-noch-muted text-xs mt-1">{template.notes}</p>}
                  {canManageRecurring && (
                    <div className="flex justify-end gap-2 mt-3">
                      <button
                        type="button"
                        onClick={() => startEditTemplate(template)}
                        className="text-noch-green text-xs inline-flex items-center gap-1 hover:underline"
                      >
                        <Pencil size={11} /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleArchiveTemplate(template.id)}
                        className="text-red-400 text-xs hover:underline"
                      >
                        Archive
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
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
              {filtered.map(r => (
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
