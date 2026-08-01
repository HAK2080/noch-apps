// PayrollTab.jsx — monthly payroll runs (generate draft → edit → complete)
// plus staff loans with running repayment balances.
// Run lifecycle is owned by RPCs (payroll_generate_run / payroll_complete_run /
// payroll_delete_run); draft items and loans are plain table CRUD (owner RLS).

import { useEffect, useRef, useState } from 'react'
import { Banknote, CheckCircle, HandCoins, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  listPayrollRuns, getPayrollRunItems, updatePayrollRunItem,
  updatePayrollRunItemHours,
  generatePayrollRun, completePayrollRun, deletePayrollRun,
  listStaffLoans, createStaffLoan, cancelStaffLoan, listLoanRepayments, listBranches,
} from '../lib/finance-supabase'
import { getAllTeamMembers } from '../../../lib/profiles'
import { netOf, overtimeCostOf } from '../lib/payroll-calculations'
import { lyd } from '../lib/thresholds'
import toast from 'react-hot-toast'

const MANUAL_MONEY_FIELDS = ['base_lyd', 'bonus_lyd', 'deduction_lyd', 'loan_repayment_lyd', 'other_lyd']
const MONEY_LABELS = {
  base_lyd: 'Base',
  bonus_lyd: 'Bonus',
  deduction_lyd: 'Deduction',
  loan_repayment_lyd: 'Loan repayment',
  other_lyd: 'Other',
}
const HOURS_FIELDS = [
  ['manual_hours_per_day', 'Hours/day'],
  ['manual_worked_days', 'Days'],
  ['manual_scheduled_hours', 'Scheduled h'],
  ['manual_overtime_hours', 'OT hours (×1)'],
]

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const ISSUE_LABELS = {
  missing_start_date: 'Missing employment start date',
  missing_cost_allocation: 'Missing branch or cost allocation',
  missing_pay_basis: 'Missing salary or hourly rate',
  no_closed_attendance: 'No closed attendance evidence',
  no_published_schedule: 'No published schedule evidence',
  open_attendance: 'Open attendance must be closed',
}

function itemIssues(item) {
  if (Array.isArray(item?.data_issues)) return item.data_issues
  if (typeof item?.data_issues === 'string') {
    try { return JSON.parse(item.data_issues) || [] } catch { return [] }
  }
  return []
}

function StatusBadge({ status }) {
  const cls = status === 'completed'
    ? 'bg-noch-green/10 border-noch-green/30 text-noch-green'
    : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
  return (
    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold capitalize ${cls}`}>
      {status}
    </span>
  )
}

export default function PayrollTab({ readOnly = false }) {
  const [month, setMonth] = useState(currentMonth())
  const [runs, setRuns] = useState([])
  const [staff, setStaff] = useState([])
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [selected, setSelected] = useState(null)
  const [items, setItems] = useState([])
  const [itemsLoading, setItemsLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const loadedItems = useRef([])

  const nameOf = (id) => staff.find(p => p.id === id)?.full_name || 'Staff'
  const branchOf = (id) => branches.find(b => b.id === id)?.name || '—'

  const reload = async () => {
    setLoading(true)
    try {
      const [list, st, bs] = await Promise.all([
        listPayrollRuns(12),
        getAllTeamMembers(),
        listBranches(),
      ])
      setRuns(list)
      setStaff(st.filter(person => person.is_active !== false))
      setBranches(bs)
      return list
    } catch (err) {
      toast.error(err.message || 'Failed to load payroll')
      return []
    } finally { setLoading(false) }
  }
  // Auto-open the latest run on load so returning to the tab restores
  // the detail view instead of looking like the run disappeared.
  useEffect(() => {
    const init = async () => {
      const list = await reload()
      if (list?.length) openRun(list[0])
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const openRun = async (run) => {
    if (!run) { setSelected(null); setItems([]); return }
    setMonth(String(run.period_month).slice(0, 7))
    setSelected(run)
    setItemsLoading(true)
    try {
      const list = await getPayrollRunItems(run.id)
      const sorted = [...list].sort((a, b) => nameOf(a.profile_id).localeCompare(nameOf(b.profile_id)))
      loadedItems.current = sorted
      setItems(sorted)
    } catch (err) { toast.error(err.message || 'Failed to load run items') }
    finally { setItemsLoading(false) }
  }

  const selectMonth = value => {
    setMonth(value)
    const existingRun = runs.find(run => String(run.period_month).slice(0, 7) === value)
    if (existingRun) openRun(existingRun)
    else { setSelected(null); setItems([]) }
  }

  const generate = async (targetMonth) => {
    const m = targetMonth || month
    if (!m) { toast.error('Pick a month first'); return }
    setGenerating(true)
    try {
      await generatePayrollRun(`${m}-01`)
      toast.success('Draft payroll generated')
      const list = await reload()
      const run = list.find(r => String(r.period_month).slice(0, 7) === m)
      await openRun(run)
    } catch (err) { toast.error(err.message || 'Generate failed') }
    finally { setGenerating(false) }
  }

  const regenerate = () => generate(String(selected.period_month).slice(0, 7))

  const removeRun = async () => {
    if (!window.confirm('Delete this draft payroll run? This cannot be undone.')) return
    setBusy(true)
    try {
      await deletePayrollRun(selected.id)
      toast.success('Draft deleted')
      setSelected(null)
      setItems([])
      reload()
    } catch (err) { toast.error(err.message || 'Delete failed') }
    finally { setBusy(false) }
  }

  const complete = async () => {
    const total = items.reduce((s, it) => s + netOf(it), 0)
    if (!window.confirm(`Complete payroll for ${String(selected.period_month).slice(0, 7)}?\n\nTotal ${lyd(total)} will be posted and the run locked.`)) return
    setBusy(true)
    try {
      await completePayrollRun(selected.id)
      toast.success('Payroll completed')
      const list = await reload()
      await openRun(list.find(r => r.id === selected.id))
    } catch (err) { toast.error(err.message || 'Complete failed') }
    finally { setBusy(false) }
  }

  // Editable draft cells: update local state on change, persist on blur.
  const setLocal = (id, field, value) =>
    setItems(list => list.map(it => (it.id === id ? { ...it, [field]: value } : it)))

  const persistItem = async (item, field) => {
    const original = loadedItems.current.find(it => it.id === item.id)
    const raw = item[field]
    const value = field === 'note' ? (raw || null) : (raw === '' ? 0 : Number(raw))
    if (field !== 'note' && !Number.isFinite(value)) { toast.error('Invalid number'); return }
    if (original && String(original[field] ?? '') === String(item[field] ?? '')) return
    try {
      const updated = await updatePayrollRunItem(item.id, { [field]: value })
      const previous = items.find(row => row.id === item.id)
      const nextTotal = runTotal - netOf(previous || item) + netOf(updated)
      setItems(list => list.map(row => row.id === item.id ? updated : row))
      setSelected(run => run ? { ...run, total_lyd: nextTotal } : run)
      loadedItems.current = loadedItems.current.map(it => (it.id === item.id ? updated : it))
    } catch (err) {
      toast.error(err.message || 'Save failed')
      openRun(selected)
    }
  }

  const persistHours = async item => {
    const toNumber = value => value === '' || value === null || value === undefined ? null : Number(value)
    const updates = {
      hoursPerDay: toNumber(item.manual_hours_per_day),
      workedDays: toNumber(item.manual_worked_days),
      scheduledHours: toNumber(item.manual_scheduled_hours),
      overtimeHours: item.manual_overtime_hours === '' ? 0 : toNumber(item.manual_overtime_hours),
    }
    if (Object.values(updates).some(value => value !== null && !Number.isFinite(value))) {
      toast.error('Invalid payroll hours')
      return
    }
    try {
      const updated = await updatePayrollRunItemHours(item.id, updates)
      const previous = items.find(row => row.id === item.id)
      const nextTotal = runTotal - netOf(previous || item) + netOf(updated)
      setItems(list => list.map(row => row.id === item.id ? updated : row))
      setSelected(run => run ? { ...run, total_lyd: nextTotal } : run)
      loadedItems.current = loadedItems.current.map(row => row.id === item.id ? updated : row)
    } catch (err) {
      toast.error(err.message || 'Failed to save payroll hours')
      openRun(selected)
    }
  }

  const isDraft = selected?.status === 'draft'
  const editable = isDraft && !readOnly
  const runTotal = selected
    ? (isDraft ? items.reduce((s, it) => s + netOf(it), 0) : Number(selected.total_lyd || 0))
    : 0
  const evidenceBlocked = selected?.evidence_status === 'blocked'
    || items.some(item => item.data_status === 'blocked')
  const canComplete = isDraft
    && ['ready', 'warning'].includes(selected?.evidence_status)
  const issueCounts = items.reduce((counts, item) => {
    for (const issue of itemIssues(item)) counts[issue] = (counts[issue] || 0) + 1
    return counts
  }, {})
  const selectedMonthRun = runs.find(run => String(run.period_month).slice(0, 7) === month)

  return (
    <div className="flex flex-col gap-4">
      {/* Header: month picker + generate */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <Banknote size={14} className="text-noch-green" />
          <input type="month" value={month} onChange={event => selectMonth(event.target.value)} className="input py-1 px-2 text-xs" />
        </div>
        {!readOnly && !selectedMonthRun && (
          <button onClick={() => generate()} disabled={generating}
            className="btn-secondary text-xs px-4 py-1.5 flex items-center gap-1.5">
            <RefreshCw size={12} className={generating ? 'animate-spin' : ''} />
            {generating ? 'Generating…' : 'Generate draft'}
          </button>
        )}
        {selectedMonthRun && (
          <span className="text-xs text-noch-muted">
            {selectedMonthRun.status === 'draft' ? 'Draft opened — edit below' : 'Completed payroll — view only'}
          </span>
        )}
      </div>
      <p className="-mt-2 text-[11px] text-noch-muted">
        Select any previous month. Existing drafts open for editing; completed payroll remains locked.
      </p>

      {/* Recent runs */}
      <div className="card">
        <h3 className="text-white text-sm font-semibold mb-3">Payroll runs</h3>
        {loading ? <p className="text-noch-muted">Loading…</p> : runs.length === 0 ? (
          <p className="text-noch-muted text-sm py-3 text-center">No payroll runs yet — pick a month and generate a draft.</p>
        ) : (
          <div className="flex flex-col">
            {runs.map(r => (
              <button key={r.id} onClick={() => openRun(r)}
                className={`flex items-center gap-3 border-t border-noch-border/40 py-2 text-xs text-left transition-colors hover:bg-noch-dark/40 ${selected?.id === r.id ? 'bg-noch-dark/50' : ''}`}>
                <span className="text-white font-medium w-20 shrink-0">{String(r.period_month).slice(0, 7)}</span>
                <StatusBadge status={r.status} />
                <span className="text-noch-green font-mono shrink-0">{lyd(r.total_lyd)}</span>
                <span className="text-noch-muted ml-auto shrink-0">
                  {r.status === 'completed' && r.completed_at ? `completed ${String(r.completed_at).slice(0, 10)}` : ''}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Run detail */}
      {selected && (
        <div className="card">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <h3 className="text-white text-sm font-semibold">{String(selected.period_month).slice(0, 7)}</h3>
            <StatusBadge status={selected.status} />
            <StatusBadge status={selected.evidence_status || 'legacy'} />
            <span className="text-noch-green font-mono text-sm">{lyd(runTotal)}</span>
            {!readOnly && isDraft && (
              <div className="flex items-center gap-2 ml-auto">
                <button onClick={regenerate} disabled={generating || busy}
                  className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5">
                  <RefreshCw size={12} className={generating ? 'animate-spin' : ''} /> Regenerate
                </button>
                <button onClick={removeRun} disabled={busy}
                  className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5 text-red-300">
                  <Trash2 size={12} /> Delete draft
                </button>
                <button onClick={complete} disabled={busy || !canComplete}
                  className="btn-primary text-xs px-4 py-1.5 flex items-center gap-1.5">
                  <CheckCircle size={12} /> {busy ? 'Working…' : 'Complete payroll'}
                </button>
              </div>
            )}
          </div>
          {isDraft && evidenceBlocked && (
            <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
              <p className="font-semibold text-amber-100">Payroll is blocked until the employee evidence is ready.</p>
              {Object.keys(issueCounts).length > 0 && (
                <ul className="mt-2 list-disc space-y-1 ps-4">
                  {Object.entries(issueCounts).map(([issue, count]) => (
                    <li key={issue}>{count} × {ISSUE_LABELS[issue] || issue.replaceAll('_', ' ')}</li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex flex-wrap gap-3 font-semibold">
                <Link to="/staff/team" className="underline underline-offset-2">Open team directory to add dates</Link>
                <Link to="/staff" className="underline underline-offset-2">Review attendance and schedule</Link>
              </div>
            </div>
          )}
          {isDraft && (
            <p className="mb-3 text-xs text-noch-muted">
              Attendance and schedules are optional evidence. Enter overtime hours manually; OT cost = overtime hours × employee hourly rate × 1 and is added to net pay.
            </p>
          )}
          {itemsLoading ? <p className="text-noch-muted">Loading…</p> : items.length === 0 ? (
            <p className="text-noch-muted text-sm py-3 text-center">No items in this run.</p>
          ) : (
            <div className="space-y-3" data-testid="payroll-item-list">
              {items.map(it => (
                <section
                  key={it.id}
                  data-testid="payroll-item-card"
                  className="rounded-xl border border-noch-border/60 bg-noch-dark/30 p-3"
                >
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{nameOf(it.profile_id)}</p>
                      <p className="truncate text-xs text-noch-muted">{branchOf(it.branch_id)}</p>
                    </div>
                    <div className="min-w-0 flex-1 text-xs sm:max-w-sm">
                      <span className="mr-1 text-[10px] uppercase tracking-wide text-noch-muted">Evidence</span>
                      <span className={it.data_status === 'blocked' ? 'text-red-300' : it.data_status === 'warning' ? 'text-amber-300' : 'text-noch-green'}>
                        {it.data_status || 'ready'}
                      </span>
                      {itemIssues(it).length > 0 && (
                        <span className="block text-[10px] text-noch-muted">
                          {itemIssues(it).map(issue => ISSUE_LABELS[issue] || issue.replaceAll('_', ' ')).join(', ')}
                        </span>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[10px] uppercase tracking-wide text-noch-muted">Net pay</p>
                      <p className="font-mono text-sm text-noch-green">{lyd(netOf(it))}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-11">
                    {HOURS_FIELDS.map(([field, label]) => (
                      <label key={field} className="min-w-0 text-[10px] text-noch-muted">
                        <span className="mb-1 block truncate">{label}</span>
                        {editable ? (
                          <input
                            aria-label={`${label} for ${nameOf(it.profile_id)}`}
                            type="number"
                            min="0"
                            step="0.25"
                            value={it[field] ?? (field === 'manual_scheduled_hours' ? it.scheduled_hours ?? '' : '')}
                            onChange={event => setLocal(it.id, field, event.target.value)}
                            onBlur={() => persistHours(it)}
                            className="input w-full min-w-0 px-1.5 py-1 text-right text-xs"
                          />
                        ) : (
                          <span className="block rounded border border-noch-border/60 px-2 py-1 text-right text-white">
                            {it[field] ?? (field === 'manual_scheduled_hours' ? it.scheduled_hours ?? '—' : '—')}
                          </span>
                        )}
                      </label>
                    ))}
                    <div className="min-w-0 text-[10px] text-noch-muted">
                      <span className="mb-1 block truncate">OT cost (×1)</span>
                      <span
                        data-testid="overtime-cost"
                        className="block rounded border border-noch-border/60 bg-noch-dark/40 px-2 py-1 text-right font-mono text-noch-green"
                      >
                        {Number(overtimeCostOf(it)).toFixed(2)}
                      </span>
                    </div>
                    {MANUAL_MONEY_FIELDS.map(field => (
                      <label key={field} className="min-w-0 text-[10px] text-noch-muted">
                        <span className="mb-1 block truncate">{MONEY_LABELS[field]}</span>
                        {editable ? (
                          <input
                            aria-label={`${MONEY_LABELS[field]} for ${nameOf(it.profile_id)}`}
                            type="number"
                            step="0.01"
                            value={it[field] ?? 0}
                            onChange={event => setLocal(it.id, field, event.target.value)}
                            onBlur={() => persistItem(it, field)}
                            className="input w-full min-w-0 px-1.5 py-1 text-right text-xs"
                          />
                        ) : (
                          <span className="block rounded border border-noch-border/60 px-2 py-1 text-right text-white">
                            {Number(it[field] || 0).toFixed(2)}
                          </span>
                        )}
                      </label>
                    ))}
                    <label className="min-w-0 text-[10px] text-noch-muted">
                      <span className="mb-1 block truncate">Note</span>
                      {editable ? (
                        <input
                          aria-label={`Note for ${nameOf(it.profile_id)}`}
                          type="text"
                          value={it.note || ''}
                          placeholder="—"
                          onChange={event => setLocal(it.id, 'note', event.target.value)}
                          onBlur={() => persistItem(it, 'note')}
                          className="input w-full min-w-0 px-1.5 py-1 text-xs"
                        />
                      ) : (
                        <span className="block truncate rounded border border-noch-border/60 px-2 py-1 text-white">{it.note || '—'}</span>
                      )}
                    </label>
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Staff loans */}
      <LoansCard staff={staff} runs={runs} readOnly={readOnly} nameOf={nameOf} />
    </div>
  )
}

// Staff loans — plain CRUD. Est. remaining = amount − repayments booked in
// completed payroll runs (computed client-side from run items).
function LoansCard({ staff, runs, readOnly, nameOf }) {
  const [loans, setLoans] = useState([])
  const [repaid, setRepaid] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ profile_id: '', amount: '', monthly: '', start: currentMonth(), note: '' })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const load = async () => {
    setLoading(true)
    try {
      const completedIds = runs.filter(r => r.status === 'completed').map(r => r.id)
      const [list, reps] = await Promise.all([listStaffLoans(), listLoanRepayments(completedIds)])
      setLoans(list)
      const byProfile = {}
      for (const r of reps) byProfile[r.profile_id] = (byProfile[r.profile_id] || 0) + Number(r.loan_repayment_lyd || 0)
      setRepaid(byProfile)
    } catch (err) { toast.error(err.message || 'Failed to load loans') }
    finally { setLoading(false) }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [runs])

  const add = async () => {
    if (!form.profile_id) { toast.error('Select a staff member'); return }
    const amount = parseFloat(form.amount)
    const monthly = parseFloat(form.monthly)
    if (!form.amount || isNaN(amount) || amount <= 0) { toast.error('Enter a valid amount'); return }
    if (!form.monthly || isNaN(monthly) || monthly <= 0) { toast.error('Enter a valid monthly repayment'); return }
    if (!form.start) { toast.error('Pick a start month'); return }
    setSaving(true)
    try {
      await createStaffLoan({
        profile_id: form.profile_id,
        amount_lyd: amount,
        monthly_repayment_lyd: monthly,
        start_month: `${form.start}-01`,
        status: 'active',
        note: form.note || null,
      })
      toast.success('Loan added')
      setForm({ profile_id: '', amount: '', monthly: '', start: currentMonth(), note: '' })
      load()
    } catch (err) { toast.error(err.message || 'Failed to add loan') }
    finally { setSaving(false) }
  }

  const cancel = async (loan) => {
    if (!window.confirm(`Cancel the loan for ${nameOf(loan.profile_id)}?`)) return
    try {
      await cancelStaffLoan(loan.id)
      toast.success('Loan cancelled')
      load()
    } catch (err) { toast.error(err.message || 'Cancel failed') }
  }

  const active = loans.filter(l => l.status === 'active')

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <HandCoins size={14} className="text-noch-green" />
        <h3 className="text-white text-sm font-semibold">Staff loans</h3>
        <span className="text-noch-muted text-[11px]">repayments are deducted automatically in each payroll run</span>
      </div>

      {!readOnly && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-3">
          <select value={form.profile_id} onChange={e => set('profile_id', e.target.value)} className="input py-1 px-2 text-xs md:col-span-2">
            <option value="">Select staff…</option>
            {staff.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
          <input type="number" min="0" step="0.01" placeholder="Amount (LYD)"
            value={form.amount} onChange={e => set('amount', e.target.value)} className="input py-1 px-2 text-xs" />
          <input type="number" min="0" step="0.01" placeholder="Monthly rep. (LYD)"
            value={form.monthly} onChange={e => set('monthly', e.target.value)} className="input py-1 px-2 text-xs" />
          <input type="month" value={form.start} onChange={e => set('start', e.target.value)} className="input py-1 px-2 text-xs" />
          <input type="text" placeholder="Note (optional)"
            value={form.note} onChange={e => set('note', e.target.value)} className="input py-1 px-2 text-xs" />
          <button onClick={add} disabled={saving}
            className="btn-primary text-xs px-4 py-1.5 flex items-center gap-1.5 col-span-2 md:col-span-6 md:justify-self-end">
            <Plus size={12} /> {saving ? 'Adding…' : 'Add loan'}
          </button>
        </div>
      )}

      {loading ? <p className="text-noch-muted">Loading…</p> : active.length === 0 ? (
        <p className="text-noch-muted text-sm py-2">No active loans.</p>
      ) : (
        <div className="flex flex-col">
          {active.map(l => {
            const remaining = Number(l.amount_lyd || 0) - (repaid[l.profile_id] || 0)
            return (
              <div key={l.id} className="flex items-center gap-3 border-t border-noch-border/40 py-1.5 text-xs">
                <span className="text-white truncate min-w-0">{nameOf(l.profile_id)}</span>
                <span className="text-noch-muted shrink-0">loan <span className="text-white font-mono">{lyd(l.amount_lyd)}</span></span>
                <span className="text-noch-muted shrink-0">repays <span className="text-white font-mono">{lyd(l.monthly_repayment_lyd)}</span>/mo</span>
                <span className="text-noch-muted shrink-0">from {String(l.start_month).slice(0, 7)}</span>
                <span className="text-noch-muted shrink-0">est. remaining <span className="text-yellow-400 font-mono">{lyd(remaining)}</span></span>
                <span className="text-noch-muted truncate flex-1">{l.note || ''}</span>
                {!readOnly && (
                  <button onClick={() => cancel(l)} className="text-noch-muted hover:text-red-300 shrink-0"><Trash2 size={11} /></button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
