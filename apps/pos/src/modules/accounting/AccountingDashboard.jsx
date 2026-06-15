// AccountingDashboard — /accounting. Double-entry GL UI: chart of accounts,
// journal (دفتر اليومية), ledger (دفتر الأستاذ), trial balance (ميزان
// المراجعة), statements, and settings. Mirrors FinanceDashboard patterns.

import { useEffect, useMemo, useState } from 'react'
import {
  BookOpen, ListTree, NotebookPen, Scale, FileBarChart, Settings as Cog, Plus, Save, Trash2, X, AlertTriangle,
} from 'lucide-react'
import Layout from '../../components/Layout'
import { useLanguage } from '../../contexts/LanguageContext'
import { usePermissions } from '../../contexts/PermissionsContext'
import { lyd } from '../finance/lib/thresholds'
import { downloadCsv, ExportButtons } from '../../lib/exportCsv'
import {
  getGlSettings, updateGlSettings,
  listAccounts, upsertAccount, deactivateAccount, listAccountMap, setAccountMap,
  listBatches, getBatchLines, createManualJournal, syncPeriod, postOpeningBalances,
  trialBalance, accountLedger, balanceSheet, incomeStatement, listBranches,
  replaceManualJournal, voidGlBatch,
} from './lib/accounting-supabase'
import toast from 'react-hot-toast'

const ymd = d => d.toISOString().slice(0, 10)
const TODAY = ymd(new Date())
const MONTH_AGO = ymd(new Date(Date.now() - 30 * 86400000))

export default function AccountingDashboard() {
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const { isOwner, canEdit } = usePermissions()
  const canManageChart = isOwner   // chart/settings are owner-only
  const [tab, setTab] = useState('coa')
  const [branches, setBranches] = useState([])
  useEffect(() => { listBranches().then(setBranches) }, [])

  const TABS = [
    { id: 'coa',     label: ar ? 'شجرة الحسابات' : 'Chart of accounts', icon: ListTree },
    { id: 'journal', label: ar ? 'دفتر اليومية' : 'Journal',            icon: NotebookPen },
    { id: 'ledger',  label: ar ? 'دفتر الأستاذ' : 'Ledger',             icon: BookOpen },
    { id: 'tb',      label: ar ? 'ميزان المراجعة' : 'Trial balance',    icon: Scale },
    { id: 'reports', label: ar ? 'القوائم المالية' : 'Statements',      icon: FileBarChart },
    { id: 'settings',label: ar ? 'الإعدادات' : 'Settings',              icon: Cog },
  ]

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <BookOpen className="text-noch-green" size={24} />
          <h1 className="text-2xl font-bold text-white">{ar ? 'المحاسبة' : 'Accounting'}</h1>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 border-b border-noch-border no-print">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                tab === t.id ? 'border-noch-green text-noch-green' : 'border-transparent text-noch-muted hover:text-white'
              }`}>
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>

        {tab === 'coa'      && <ChartOfAccountsTab ar={ar} canEdit={canManageChart} />}
        {tab === 'journal'  && <JournalTab ar={ar} branches={branches} canPost={isOwner || canEdit('accounting')} />}
        {tab === 'ledger'   && <LedgerTab ar={ar} branches={branches} />}
        {tab === 'tb'       && <TrialBalanceTab ar={ar} branches={branches} />}
        {tab === 'reports'  && <ReportsTab ar={ar} branches={branches} />}
        {tab === 'settings' && <SettingsTab ar={ar} canEdit={isOwner} />}
      </div>
    </Layout>
  )
}

// ── Chart of accounts ───────────────────────────────────────────────────
function ChartOfAccountsTab({ ar, canEdit }) {
  const [rows, setRows] = useState([])
  const [editing, setEditing] = useState(null)
  const reload = () => listAccounts().then(setRows)
  useEffect(() => { reload() }, [])

  const blank = { code: '', name_en: '', name_ar: '', type: 'expense', normal_balance: 'debit', is_postable: true, is_active: true }
  const save = async () => {
    try { await upsertAccount(editing); setEditing(null); reload(); toast.success(ar ? 'تم الحفظ' : 'Saved') }
    catch (e) { toast.error(e.message || 'Save failed') }
  }

  const TYPE_LABEL = {
    asset: ar ? 'أصل' : 'Asset', liability: ar ? 'التزام' : 'Liability', equity: ar ? 'حقوق ملكية' : 'Equity',
    revenue: ar ? 'إيراد' : 'Revenue', cogs: ar ? 'تكلفة مبيعات' : 'COGS', expense: ar ? 'مصروف' : 'Expense',
  }

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <ListTree size={16} className="text-noch-green" />
        <h2 className="text-white font-semibold">{ar ? 'شجرة الحسابات' : 'Chart of accounts'}</h2>
        {canEdit && <button onClick={() => setEditing(blank)} className="ms-auto btn-secondary text-xs flex items-center gap-1"><Plus size={12}/> {ar ? 'حساب' : 'Account'}</button>}
      </div>
      {editing && canEdit && (
        <div className="bg-noch-dark/50 rounded-xl p-3 mb-3 grid grid-cols-2 md:grid-cols-7 gap-2 text-sm">
          <input className="input" placeholder={ar ? 'الرمز' : 'Code'} value={editing.code} onChange={e => setEditing({ ...editing, code: e.target.value })} />
          <input className="input md:col-span-2" placeholder={ar ? 'الاسم (عربي)' : 'Name (Arabic)'} value={editing.name_ar} onChange={e => setEditing({ ...editing, name_ar: e.target.value })} />
          <input className="input md:col-span-2" placeholder={ar ? 'الاسم (إنجليزي)' : 'Name (English)'} value={editing.name_en} onChange={e => setEditing({ ...editing, name_en: e.target.value })} />
          <select className="input" value={editing.type} onChange={e => setEditing({ ...editing, type: e.target.value, normal_balance: ['asset','cogs','expense'].includes(e.target.value) ? 'debit' : 'credit' })}>
            {Object.keys(TYPE_LABEL).map(k => <option key={k} value={k}>{TYPE_LABEL[k]}</option>)}
          </select>
          <select className="input" value={editing.normal_balance} onChange={e => setEditing({ ...editing, normal_balance: e.target.value })}>
            <option value="debit">{ar ? 'مدين' : 'Debit'}</option>
            <option value="credit">{ar ? 'دائن' : 'Credit'}</option>
          </select>
          <label className="flex items-center gap-1.5 text-xs text-white"><input type="checkbox" checked={editing.is_postable} onChange={e => setEditing({ ...editing, is_postable: e.target.checked })} /> {ar ? 'قابل للترحيل' : 'Postable'}</label>
          <label className="flex items-center gap-1.5 text-xs text-white"><input type="checkbox" checked={editing.is_active} onChange={e => setEditing({ ...editing, is_active: e.target.checked })} /> {ar ? 'مفعّل' : 'Active'}</label>
          <div className="col-span-2 md:col-span-7 flex justify-end gap-2"><button onClick={() => setEditing(null)} className="btn-secondary text-xs">{ar ? 'إلغاء' : 'Cancel'}</button><button onClick={save} className="btn-primary text-xs">{ar ? 'حفظ' : 'Save'}</button></div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-noch-muted text-xs"><tr>
            <th className="text-left py-1">{ar ? 'الرمز' : 'Code'}</th>
            <th className="text-left py-1">{ar ? 'الاسم' : 'Name'}</th>
            <th className="text-left py-1">{ar ? 'النوع' : 'Type'}</th>
            <th className="text-left py-1">{ar ? 'الطبيعة' : 'Normal'}</th>
            {canEdit && <th></th>}
          </tr></thead>
          <tbody>
            {rows.map(a => (
              <tr key={a.id} className={`border-t border-noch-border/40 ${!a.is_active ? 'opacity-40' : ''} ${!a.is_postable ? 'font-semibold' : ''}`}>
                <td className="py-1.5 font-mono text-white">{a.code}</td>
                <td className="py-1.5 text-white">{ar ? a.name_ar : a.name_en} <span className="text-noch-muted text-xs">{ar ? a.name_en : a.name_ar}</span></td>
                <td className="py-1.5 text-noch-muted">{TYPE_LABEL[a.type]}</td>
                <td className="py-1.5 text-noch-muted">{a.normal_balance === 'debit' ? (ar ? 'مدين' : 'Dr') : (ar ? 'دائن' : 'Cr')}</td>
                {canEdit && <td className="py-1.5 text-right">
                  <button onClick={() => setEditing(a)} className="text-noch-muted hover:text-white text-xs me-2">{ar ? 'تعديل' : 'Edit'}</button>
                  {a.is_active && <button onClick={() => deactivateAccount(a.id).then(reload)} className="text-red-400 text-xs"><Trash2 size={11}/></button>}
                </td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Journal ─────────────────────────────────────────────────────────────
function JournalTab({ ar, branches, canPost }) {
  const [from, setFrom] = useState(MONTH_AGO)
  const [to, setTo] = useState(TODAY)
  const [branchId, setBranchId] = useState(null)
  const [batches, setBatches] = useState([])
  const [expanded, setExpanded] = useState(null)
  const [lines, setLines] = useState([])
  const [creating, setCreating] = useState(false)
  const [correcting, setCorrecting] = useState(null)
  const [syncing, setSyncing] = useState(false)

  const reload = () => listBatches({ from, to, branchId }).then(setBatches)
  useEffect(() => { reload() }, [from, to, branchId]) // eslint-disable-line

  const toggle = async (b) => {
    if (expanded === b.id) { setExpanded(null); return }
    setExpanded(b.id); setLines(await getBatchLines(b.id))
  }

  const runSync = async () => {
    if (!confirm(ar ? `ترحيل المبيعات والمصروفات من ${from} إلى ${to}؟` : `Post sales + expenses from ${from} to ${to}?`)) return
    setSyncing(true)
    try { const r = await syncPeriod({ from, to, branchId, force: true }); toast.success(`${r.sales_batches ?? 0} + ${r.expense_batches ?? 0} ${ar ? 'قيود' : 'batches'}`); reload() }
    catch (e) { toast.error(e.message || 'Sync failed') }
    finally { setSyncing(false) }
  }

  const startCorrection = async (batch) => {
    const batchLines = await getBatchLines(batch.id)
    setCorrecting({
      batch,
      lines: batchLines.map(l => ({
        account_id: l.account_id,
        debit_lyd: Number(l.debit_lyd || 0) || '',
        credit_lyd: Number(l.credit_lyd || 0) || '',
        memo: l.memo || '',
      })),
    })
  }

  const voidBatch = async (batch) => {
    const reason = prompt(ar ? 'سبب إلغاء القيد؟' : 'Reason for voiding this journal?') || ''
    try { await voidGlBatch(batch.id, reason); toast.success(ar ? 'تم إلغاء القيد' : 'Journal voided'); reload() }
    catch (e) { toast.error(e.message || 'Void failed') }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} className="input py-1 px-2 text-xs" />
        <span className="text-noch-muted text-xs">→</span>
        <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} className="input py-1 px-2 text-xs" />
        <select value={branchId || ''} onChange={e => setBranchId(e.target.value || null)} className="input py-1 px-2 text-xs">
          <option value="">{ar ? 'كل الفروع' : 'All branches'}</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        {canPost && <>
          <button onClick={() => setCreating(true)} className="btn-secondary text-xs flex items-center gap-1 ms-auto"><Plus size={12}/> {ar ? 'قيد يدوي' : 'Manual entry'}</button>
          <button onClick={runSync} disabled={syncing} className="btn-primary text-xs">{syncing ? '…' : (ar ? 'ترحيل الفترة' : 'Post period')}</button>
        </>}
      </div>

      {creating && <ManualJournalForm ar={ar} branches={branches} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload() }} />}
      {correcting && (
        <ManualJournalForm
          ar={ar}
          branches={branches}
          initialBatch={correcting.batch}
          initialLines={correcting.lines}
          onClose={() => setCorrecting(null)}
          onSaved={() => { setCorrecting(null); reload() }}
        />
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-noch-muted text-xs"><tr>
            <th className="text-left py-1">{ar ? 'التاريخ' : 'Date'}</th>
            <th className="text-left py-1">{ar ? 'النوع' : 'Type'}</th>
            <th className="text-left py-1">{ar ? 'البيان' : 'Memo'}</th>
            <th className="text-left py-1">{ar ? 'الفرع' : 'Branch'}</th>
            <th className="text-right py-1">{ar ? 'مدين' : 'Debit'}</th>
            <th className="text-right py-1">{ar ? 'دائن' : 'Credit'}</th>
          </tr></thead>
          <tbody>
            {batches.map(b => (
              <>
                <tr key={b.id} onClick={() => toggle(b)} className="border-t border-noch-border/40 cursor-pointer hover:bg-noch-dark/40">
                  <td className="py-1.5 text-white whitespace-nowrap">{b.journal_date}</td>
                  <td className="py-1.5 text-noch-muted">{b.source_type}</td>
                  <td className="py-1.5 text-noch-muted truncate max-w-[220px]">
                    {b.memo}
                    {canPost && ['manual','journal_correction'].includes(b.source_type) && b.status === 'posted' && (
                      <span className="ms-2 inline-flex gap-2">
                        <button onClick={(e) => { e.stopPropagation(); startCorrection(b) }} className="text-noch-green hover:underline text-xs">
                          {ar ? 'تصحيح' : 'Correct'}
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); voidBatch(b) }} className="text-red-400 hover:underline text-xs">
                          {ar ? 'إلغاء' : 'Void'}
                        </button>
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 text-noch-muted">{b.branch?.name || '—'}</td>
                  <td className="py-1.5 text-right font-mono text-white">{lyd(b.total_debit)}</td>
                  <td className="py-1.5 text-right font-mono text-white">{lyd(b.total_credit)}</td>
                </tr>
                {expanded === b.id && lines.map(l => (
                  <tr key={l.id} className="bg-noch-dark/30 text-xs">
                    <td></td>
                    <td colSpan={2} className="py-1 ps-4 text-noch-muted">{l.account?.code} · {ar ? l.account?.name_ar : l.account?.name_en} {l.memo && <span className="opacity-60">— {l.memo}</span>}</td>
                    <td></td>
                    <td className="py-1 text-right font-mono text-noch-green">{Number(l.debit_lyd) ? lyd(l.debit_lyd) : ''}</td>
                    <td className="py-1 text-right font-mono text-blue-300">{Number(l.credit_lyd) ? lyd(l.credit_lyd) : ''}</td>
                  </tr>
                ))}
              </>
            ))}
            {batches.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-noch-muted text-sm">{ar ? 'لا توجد قيود في هذه الفترة.' : 'No journal entries in this range.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ManualJournalForm({ ar, branches, onClose, onSaved, initialBatch = null, initialLines = null }) {
  const isCorrection = !!initialBatch
  const [date, setDate] = useState(initialBatch?.journal_date || TODAY)
  const [branchId, setBranchId] = useState(initialBatch?.branch_id || null)
  const [memo, setMemo] = useState(initialBatch?.memo || '')
  const [accounts, setAccounts] = useState([])
  const [lines, setLines] = useState(initialLines?.length ? initialLines : [{ account_id: '', debit_lyd: '', credit_lyd: '', memo: '' }, { account_id: '', debit_lyd: '', credit_lyd: '', memo: '' }])
  const [saving, setSaving] = useState(false)
  const [reason, setReason] = useState('')
  useEffect(() => { listAccounts({ activeOnly: true }).then(a => setAccounts(a.filter(x => x.is_postable))) }, [])

  const td = lines.reduce((s, l) => s + Number(l.debit_lyd || 0), 0)
  const tc = lines.reduce((s, l) => s + Number(l.credit_lyd || 0), 0)
  const balanced = Math.round(td * 100) === Math.round(tc * 100) && td > 0

  const setLine = (i, k, v) => setLines(ls => ls.map((l, j) => j === i ? { ...l, [k]: v } : l))
  const save = async () => {
    setSaving(true)
    try {
      const payload = { journal_date: date, branch_id: branchId, memo, lines: lines.filter(l => l.account_id) }
      if (isCorrection) {
        await replaceManualJournal({ old_batch_id: initialBatch.id, ...payload, reason })
        toast.success('Journal corrected')
      } else {
        await createManualJournal(payload)
        toast.success('Posted')
      }
      onSaved()
    } catch (e) { toast.error(e.message || 'Failed') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-noch-card border border-noch-border rounded-2xl w-full max-w-2xl p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-white font-bold">{isCorrection ? 'Correct journal entry' : 'Manual journal entry'}</h2>
          <button onClick={onClose}><X className="text-noch-muted" size={18}/></button>
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input text-sm" />
          <select value={branchId || ''} onChange={e => setBranchId(e.target.value || null)} className="input text-sm">
            <option value="">{ar ? 'بدون فرع' : 'No branch'}</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <input className="input text-sm flex-1" placeholder={ar ? 'البيان' : 'Memo'} value={memo} onChange={e => setMemo(e.target.value)} />
        </div>
        {isCorrection && (
          <input className="input text-sm w-full mb-3" placeholder="Correction reason" value={reason} onChange={e => setReason(e.target.value)} />
        )}
        <table className="w-full text-sm mb-2">
          <thead className="text-noch-muted text-xs"><tr><th className="text-left">{ar ? 'الحساب' : 'Account'}</th><th className="text-right w-28">{ar ? 'مدين' : 'Debit'}</th><th className="text-right w-28">{ar ? 'دائن' : 'Credit'}</th></tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td className="py-1 pe-2">
                  <select value={l.account_id} onChange={e => setLine(i, 'account_id', e.target.value)} className="input w-full text-xs">
                    <option value="">—</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.code} · {ar ? a.name_ar : a.name_en}</option>)}
                  </select>
                </td>
                <td className="py-1"><input type="number" step="0.01" value={l.debit_lyd} onChange={e => setLine(i, 'debit_lyd', e.target.value)} className="input w-full text-xs text-right" /></td>
                <td className="py-1"><input type="number" step="0.01" value={l.credit_lyd} onChange={e => setLine(i, 'credit_lyd', e.target.value)} className="input w-full text-xs text-right" /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={() => setLines(ls => [...ls, { account_id: '', debit_lyd: '', credit_lyd: '', memo: '' }])} className="btn-secondary text-xs flex items-center gap-1 mb-3"><Plus size={11}/> {ar ? 'سطر' : 'Line'}</button>
        <div className="flex items-center justify-between">
          <span className={`text-sm font-mono ${balanced ? 'text-noch-green' : 'text-red-400'}`}>
            {ar ? 'مدين' : 'Dr'} {lyd(td)} · {ar ? 'دائن' : 'Cr'} {lyd(tc)} {balanced ? '✓' : `(Δ ${lyd(Math.abs(td - tc))})`}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary text-sm">{ar ? 'إلغاء' : 'Cancel'}</button>
            <button onClick={save} disabled={!balanced || saving} className="btn-primary text-sm flex items-center gap-1"><Save size={13}/> {ar ? 'ترحيل' : 'Post'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Ledger ──────────────────────────────────────────────────────────────
function LedgerTab({ ar, branches }) {
  const [accounts, setAccounts] = useState([])
  const [accountId, setAccountId] = useState('')
  const [from, setFrom] = useState(MONTH_AGO)
  const [to, setTo] = useState(TODAY)
  const [branchId, setBranchId] = useState(null)
  const [rows, setRows] = useState([])
  useEffect(() => { listAccounts({ activeOnly: true }).then(a => { const p = a.filter(x => x.is_postable); setAccounts(p); if (!accountId && p[0]) setAccountId(p[0].id) }) }, []) // eslint-disable-line
  useEffect(() => { if (accountId) accountLedger(accountId, from, to, branchId).then(setRows) }, [accountId, from, to, branchId])

  const exportCsv = () => downloadCsv(`ledger_${from}_${to}`,
    [ar ? 'التاريخ' : 'Date', ar ? 'النوع' : 'Type', ar ? 'البيان' : 'Memo', ar ? 'مدين' : 'Debit', ar ? 'دائن' : 'Credit', ar ? 'الرصيد' : 'Balance'],
    rows.map(r => [r.journal_date, r.source_type, r.memo || '', Number(r.debit_lyd).toFixed(2), Number(r.credit_lyd).toFixed(2), Number(r.running_balance).toFixed(2)]))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={accountId} onChange={e => setAccountId(e.target.value)} className="input py-1 px-2 text-xs min-w-[14rem]">
          {accounts.map(a => <option key={a.id} value={a.id}>{a.code} · {ar ? a.name_ar : a.name_en}</option>)}
        </select>
        <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} className="input py-1 px-2 text-xs" />
        <span className="text-noch-muted text-xs">→</span>
        <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} className="input py-1 px-2 text-xs" />
        <select value={branchId || ''} onChange={e => setBranchId(e.target.value || null)} className="input py-1 px-2 text-xs">
          <option value="">{ar ? 'كل الفروع' : 'All branches'}</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <span className="ms-auto"><ExportButtons onCsv={exportCsv} /></span>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-noch-muted text-xs"><tr>
            <th className="text-left py-1">{ar ? 'التاريخ' : 'Date'}</th><th className="text-left py-1">{ar ? 'النوع' : 'Type'}</th>
            <th className="text-left py-1">{ar ? 'البيان' : 'Memo'}</th>
            <th className="text-right py-1">{ar ? 'مدين' : 'Debit'}</th><th className="text-right py-1">{ar ? 'دائن' : 'Credit'}</th>
            <th className="text-right py-1">{ar ? 'الرصيد' : 'Balance'}</th>
          </tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-noch-border/40">
                <td className="py-1.5 text-white whitespace-nowrap">{r.journal_date}</td>
                <td className="py-1.5 text-noch-muted">{r.source_type}</td>
                <td className="py-1.5 text-noch-muted truncate max-w-[220px]">{r.memo}</td>
                <td className="py-1.5 text-right font-mono">{Number(r.debit_lyd) ? lyd(r.debit_lyd) : ''}</td>
                <td className="py-1.5 text-right font-mono">{Number(r.credit_lyd) ? lyd(r.credit_lyd) : ''}</td>
                <td className="py-1.5 text-right font-mono text-white">{lyd(r.running_balance)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-noch-muted text-sm">{ar ? 'لا توجد حركات.' : 'No movements.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Trial balance ───────────────────────────────────────────────────────
function TrialBalanceTab({ ar, branches }) {
  const [asOf, setAsOf] = useState(TODAY)
  const [branchId, setBranchId] = useState(null)
  const [rows, setRows] = useState([])
  useEffect(() => { trialBalance(asOf, branchId).then(setRows) }, [asOf, branchId])
  const totDr = rows.reduce((s, r) => s + Number(r.total_debit || 0), 0)
  const totCr = rows.reduce((s, r) => s + Number(r.total_credit || 0), 0)
  const balanced = Math.round(totDr * 100) === Math.round(totCr * 100)
  const exportCsv = () => downloadCsv(`trial_balance_${asOf}`,
    [ar ? 'الرمز' : 'Code', ar ? 'الحساب' : 'Account', ar ? 'مدين' : 'Debit', ar ? 'دائن' : 'Credit'],
    rows.map(r => [r.code, ar ? r.name_ar : r.name_en, Number(r.total_debit).toFixed(2), Number(r.total_credit).toFixed(2)]))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-noch-muted">{ar ? 'حتى تاريخ' : 'As of'}</label>
        <input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} className="input py-1 px-2 text-xs" />
        <select value={branchId || ''} onChange={e => setBranchId(e.target.value || null)} className="input py-1 px-2 text-xs">
          <option value="">{ar ? 'كل الفروع' : 'All branches'}</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <span className="ms-auto"><ExportButtons onCsv={exportCsv} /></span>
      </div>
      {!balanced && rows.length > 0 && (
        <div className="card border-red-500/40 flex items-center gap-2 text-red-300 text-sm"><AlertTriangle size={14}/> {ar ? 'الميزان غير متوازن!' : 'Trial balance does not balance!'} (Δ {lyd(Math.abs(totDr - totCr))})</div>
      )}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-noch-muted text-xs"><tr>
            <th className="text-left py-1">{ar ? 'الرمز' : 'Code'}</th><th className="text-left py-1">{ar ? 'الحساب' : 'Account'}</th>
            <th className="text-right py-1">{ar ? 'مدين' : 'Debit'}</th><th className="text-right py-1">{ar ? 'دائن' : 'Credit'}</th>
          </tr></thead>
          <tbody>
            {rows.filter(r => Number(r.total_debit) || Number(r.total_credit)).map(r => (
              <tr key={r.account_id} className="border-t border-noch-border/40">
                <td className="py-1.5 font-mono text-white">{r.code}</td>
                <td className="py-1.5 text-white">{ar ? r.name_ar : r.name_en}</td>
                <td className="py-1.5 text-right font-mono">{lyd(r.total_debit)}</td>
                <td className="py-1.5 text-right font-mono">{lyd(r.total_credit)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="border-t-2 border-noch-border font-bold">
            <td colSpan={2} className="py-2 text-white">{ar ? 'الإجمالي' : 'Total'}</td>
            <td className="py-2 text-right font-mono text-noch-green">{lyd(totDr)}</td>
            <td className="py-2 text-right font-mono text-noch-green">{lyd(totCr)}</td>
          </tr></tfoot>
        </table>
      </div>
    </div>
  )
}

// ── Statements ──────────────────────────────────────────────────────────
function ReportsTab({ ar, branches }) {
  const [from, setFrom] = useState(MONTH_AGO)
  const [to, setTo] = useState(TODAY)
  const [branchId, setBranchId] = useState(null)
  const [bs, setBs] = useState([])
  const [is, setIs] = useState([])
  useEffect(() => { balanceSheet(to, branchId).then(setBs); incomeStatement(from, to, branchId).then(setIs) }, [from, to, branchId])

  const group = (rows, types) => rows.filter(r => types.includes(r.section))
  const sum = rows => rows.reduce((s, r) => s + Number(r.amount ?? r.balance ?? 0), 0)
  const Section = ({ title, rows, valueKey }) => (
    <div className="mb-3">
      <h3 className="text-noch-muted text-xs font-bold uppercase tracking-wider mb-1">{title}</h3>
      {rows.length === 0 ? <p className="text-noch-muted text-xs italic">—</p> : rows.map(r => (
        <div key={r.code} className="flex justify-between text-sm py-0.5">
          <span className="text-white">{r.code} · {ar ? r.name_ar : r.name_en}</span>
          <span className="font-mono text-noch-muted">{lyd(r[valueKey])}</span>
        </div>
      ))}
    </div>
  )
  const revenue = group(is, ['revenue']), cogs = group(is, ['cogs']), expenses = group(is, ['expense'])
  const netProfit = sum(revenue) - sum(cogs) - sum(expenses)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} className="input py-1 px-2 text-xs" />
        <span className="text-noch-muted text-xs">→</span>
        <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} className="input py-1 px-2 text-xs" />
        <select value={branchId || ''} onChange={e => setBranchId(e.target.value || null)} className="input py-1 px-2 text-xs">
          <option value="">{ar ? 'كل الفروع' : 'All branches'}</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <h2 className="text-white font-semibold mb-3">{ar ? 'قائمة الدخل' : 'Income statement'}</h2>
          <Section title={ar ? 'الإيرادات' : 'Revenue'} rows={revenue} valueKey="amount" />
          <Section title={ar ? 'تكلفة المبيعات' : 'COGS'} rows={cogs} valueKey="amount" />
          <Section title={ar ? 'المصروفات' : 'Expenses'} rows={expenses} valueKey="amount" />
          <div className="flex justify-between border-t border-noch-border pt-2 mt-1 font-bold">
            <span className="text-white">{ar ? 'صافي الربح' : 'Net profit'}</span>
            <span className={`font-mono ${netProfit >= 0 ? 'text-noch-green' : 'text-red-400'}`}>{lyd(netProfit)}</span>
          </div>
        </div>
        <div className="card">
          <h2 className="text-white font-semibold mb-3">{ar ? 'الميزانية العمومية' : 'Balance sheet'}</h2>
          <Section title={ar ? 'الأصول' : 'Assets'} rows={group(bs, ['asset'])} valueKey="balance" />
          <Section title={ar ? 'الالتزامات' : 'Liabilities'} rows={group(bs, ['liability'])} valueKey="balance" />
          <Section title={ar ? 'حقوق الملكية' : 'Equity'} rows={group(bs, ['equity'])} valueKey="balance" />
        </div>
      </div>
    </div>
  )
}

// ── Settings ────────────────────────────────────────────────────────────
function SettingsTab({ ar, canEdit }) {
  const [settings, setSettings] = useState(null)
  const [map, setMap] = useState([])
  const [accounts, setAccounts] = useState([])
  const [opening, setOpening] = useState('')
  const [openingDate, setOpeningDate] = useState(TODAY)
  useEffect(() => {
    getGlSettings().then(setSettings)
    listAccountMap().then(setMap)
    listAccounts({ activeOnly: true }).then(a => setAccounts(a.filter(x => x.is_postable)))
  }, [])

  if (!canEdit) return <div className="card text-noch-muted text-sm">{ar ? 'الإعدادات متاحة للمالك فقط.' : 'Settings are owner-only.'}</div>
  if (!settings) return <p className="text-noch-muted text-center py-8">…</p>

  const saveSettings = async (patch) => {
    try { const s = await updateGlSettings(patch); setSettings(s); toast.success(ar ? 'تم الحفظ' : 'Saved') }
    catch (e) { toast.error(e.message || 'Save failed') }
  }
  const postOpening = async () => {
    let entries
    try { entries = JSON.parse(opening) } catch { toast.error(ar ? 'JSON غير صالح' : 'Invalid JSON'); return }
    try { await postOpeningBalances(entries, openingDate); toast.success(ar ? 'تم ترحيل الأرصدة الافتتاحية' : 'Opening balances posted'); setOpening('') }
    catch (e) { toast.error(e.message || 'Failed') }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Master + fiscal year */}
      <div className={`card ${settings.auto_post_enabled ? '' : 'border-yellow-500/40'}`}>
        <div className="flex items-center gap-2 mb-3">
          <Cog size={16} className="text-noch-green" />
          <h2 className="text-white font-semibold">{ar ? 'الإعدادات العامة' : 'General'}</h2>
          {!settings.auto_post_enabled && <span className="ms-auto px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-500/15 text-yellow-300 border border-yellow-500/30">{ar ? 'الترحيل التلقائي معطّل' : 'AUTO-POST OFF'}</span>}
        </div>
        <label className="flex items-start gap-3 cursor-pointer mb-3 p-3 rounded-xl bg-noch-dark/40">
          <input type="checkbox" checked={settings.auto_post_enabled} onChange={e => saveSettings({ auto_post_enabled: e.target.checked })} className="mt-1" />
          <div>
            <p className="text-white font-medium">{ar ? 'تفعيل الترحيل التلقائي' : 'Enable auto-posting'}</p>
            <p className="text-noch-muted text-xs mt-1">{ar ? 'عند التفعيل يقوم النظام ليلياً بترحيل مبيعات اليوم والمصروفات المعتمدة إلى دفتر اليومية.' : 'When on, the nightly job posts each day’s sales + approved expenses into the journal. Off = manual posting only.'}</p>
          </div>
        </label>
        <div className="flex items-center gap-2 text-sm">
          <label className="text-noch-muted">{ar ? 'بداية السنة المالية (الشهر)' : 'Fiscal year start month'}</label>
          <input type="number" min="1" max="12" value={settings.fiscal_year_start_month} onChange={e => saveSettings({ fiscal_year_start_month: Number(e.target.value) })} className="input w-20 text-sm" />
        </div>
      </div>

      {/* Account map */}
      <div className="card">
        <h2 className="text-white font-semibold mb-3">{ar ? 'ربط الحسابات' : 'Account mapping'}</h2>
        <p className="text-noch-muted text-xs mb-3">{ar ? 'يحدّد إلى أي حساب يُرحّل كل نوع من العمليات.' : 'Controls which account each event type posts to.'}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {map.map(m => (
            <div key={m.key} className="flex items-center gap-2 text-sm bg-noch-dark/30 rounded-lg px-3 py-1.5">
              <span className="text-noch-muted text-xs w-40 truncate" title={m.key}>{m.label || m.key}</span>
              <select value={m.account_id || ''} onChange={e => setAccountMap(m.key, e.target.value).then(() => listAccountMap().then(setMap))} className="input flex-1 text-xs py-0.5">
                {accounts.map(a => <option key={a.id} value={a.id}>{a.code} · {ar ? a.name_ar : a.name_en}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>

      {/* Opening balances */}
      <div className="card">
        <h2 className="text-white font-semibold mb-1">{ar ? 'الأرصدة الافتتاحية (الترحيل من النظام القديم)' : 'Opening balances (migrate from old system)'}</h2>
        <p className="text-noch-muted text-xs mb-3">{ar ? 'الصق مصفوفة JSON من الأرصدة. يجب أن تتوازن (مدين = دائن).' : 'Paste a JSON array of balances. Must balance (debits = credits).'}</p>
        <div className="flex items-center gap-2 mb-2">
          <label className="text-xs text-noch-muted">{ar ? 'بتاريخ' : 'As of'}</label>
          <input type="date" value={openingDate} onChange={e => setOpeningDate(e.target.value)} className="input text-sm" />
        </div>
        <textarea value={opening} onChange={e => setOpening(e.target.value)} rows={5}
          placeholder='[{"code":"1010","debit":5000,"credit":0},{"code":"3000","debit":0,"credit":5000}]'
          className="input w-full font-mono text-xs" />
        <div className="flex justify-end mt-2">
          <button onClick={postOpening} disabled={!opening.trim()} className="btn-primary text-sm">{ar ? 'ترحيل الأرصدة' : 'Post opening balances'}</button>
        </div>
      </div>
    </div>
  )
}
