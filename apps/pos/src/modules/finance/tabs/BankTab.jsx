// BankTab.jsx — minimal CSV importer + transaction list.
// CSV format expected (per Libyan-bank exports vary; configurable parser):
//   header: date,description,debit,credit,balance
// Or owner can paste rows manually as a fallback.
//
// Auto-categoriser uses keyword rules. User confirms before commit.

import { useEffect, useMemo, useState } from 'react'
import { Upload, FileText, Save, Tag } from 'lucide-react'
import { listBankTransactions, bulkInsertBankTransactions, updateBankTransactionCategory } from '../lib/finance-supabase'
import { lyd } from '../lib/thresholds'
import toast from 'react-hot-toast'

const RULES = [
  { match: /rent|إيجار/i,                               cat: 'rent' },
  { match: /gecol|kahraba|electric|كهرباء/i,            cat: 'utilities' },
  { match: /maa|water|مياه/i,                            cat: 'utilities' },
  { match: /internet|wifi|libya\s*tel|hatif/i,          cat: 'utilities' },
  { match: /verifone|card\s*settle|pos\s*settle/i,      cat: 'card_settlement' },
  { match: /salary|payroll|راتب/i,                       cat: 'wages_one_off' },
  { match: /supplier|invoice|فاتورة|ingredient|coffee\s*beans/i, cat: 'supplies' },
  { match: /facebook|instagram|tiktok|google\s*ads/i,   cat: 'marketing' },
  { match: /bank\s*fee|rib(b)?a|charge/i,                cat: 'bank_fees' },
]

function autoCat(desc) {
  if (!desc) return null
  for (const r of RULES) if (r.match.test(desc)) return r.cat
  return null
}

// Tiny CSV parser. Handles quoted fields; doesn't support multiline.
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length === 0) return []
  const header = lines[0].split(',').map(h => h.trim().toLowerCase())
  const rows = []
  for (const line of lines.slice(1)) {
    // naive: split on commas not inside quotes
    const parts = []
    let cur = '', inQ = false
    for (const ch of line) {
      if (ch === '"') inQ = !inQ
      else if (ch === ',' && !inQ) { parts.push(cur); cur = '' }
      else cur += ch
    }
    parts.push(cur)
    const obj = {}
    header.forEach((k, i) => { obj[k] = (parts[i] || '').trim() })
    rows.push(obj)
  }
  return rows
}

// Match many header variants (English + Arabic + common Libyan-bank
// idioms). Arabic header detection works on first chars + keyword
// substrings since CSV exports rarely have consistent diacritics.
const FIELD_ALIASES = {
  date: [
    'date', 'posted at', 'posted_at', 'transaction date', 'value date',
    'تاريخ', 'تاريخ العملية', 'تاريخ القيد', 'تاريخ المعاملة',
  ],
  description: [
    'description', 'narrative', 'details', 'narration', 'memo', 'remarks',
    'البيان', 'الوصف', 'التفاصيل', 'ملاحظات', 'ملاحظة',
  ],
  debit: [
    'debit', 'dr', 'withdrawal', 'paid out', 'out',
    'مدين', 'سحب', 'مسحوب',
  ],
  credit: [
    'credit', 'cr', 'deposit', 'paid in', 'in',
    'دائن', 'إيداع', 'مودع',
  ],
  amount: [
    'amount', 'value', 'transaction amount',
    'المبلغ', 'القيمة', 'مبلغ',
  ],
  balance: [
    'balance', 'balance after', 'running balance',
    'الرصيد', 'الرصيد المتبقي', 'رصيد',
  ],
}
function pick(row, kind) {
  const aliases = FIELD_ALIASES[kind]
  for (const key of Object.keys(row)) {
    const k = key.trim().toLowerCase()
    for (const a of aliases) if (k === a.toLowerCase() || k.includes(a.toLowerCase())) return row[key]
  }
  return ''
}
function parseDate(s) {
  s = (s || '').toString().trim()
  if (!s) return new Date().toISOString().slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const m = s.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/)
  if (m) {
    const [, d, mo, y] = m
    const yyyy = y.length === 2 ? '20' + y : y
    return `${yyyy}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  // Arabic-Indic digit fallback (٠١٢٣٤٥٦٧٨٩ → 0123456789)
  const ar = s.replace(/[٠-٩]/g, ch => String('٠١٢٣٤٥٦٧٨٩'.indexOf(ch)))
  if (ar !== s) return parseDate(ar)
  const d = new Date(s)
  if (Number.isFinite(d.getTime())) return d.toISOString().slice(0, 10)
  return new Date().toISOString().slice(0, 10)
}
function num(s) {
  if (s == null) return 0
  // Strip commas, currency symbols, Arabic-Indic digits.
  let t = String(s).replace(/[٠-٩]/g, ch => String('٠١٢٣٤٥٦٧٨٩'.indexOf(ch)))
  t = t.replace(/,/g, '').replace(/[^\d.-]/g, '')
  const n = parseFloat(t)
  return Number.isFinite(n) ? n : 0
}
function rowsToBankTx(parsed, accountLabel) {
  return parsed.map(r => {
    const desc = pick(r, 'description') || ''
    const dr = num(pick(r, 'debit'))
    const cr = num(pick(r, 'credit'))
    let amt = cr - dr
    if (amt === 0) amt = num(pick(r, 'amount'))
    const bal = num(pick(r, 'balance'))
    return {
      account_label: accountLabel,
      posted_at: parseDate(pick(r, 'date')),
      description: desc || null,
      amount_lyd: amt,
      balance_after_lyd: bal || null,
      raw_row: r,
      category: autoCat(desc),
      category_source: 'auto',
    }
  })
}

export default function BankTab() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [showImport, setShowImport] = useState(false)

  const reload = async () => {
    setLoading(true)
    try { setList(await listBankTransactions({})) }
    catch (err) { toast.error(err.message || 'Failed to load') }
    finally { setLoading(false) }
  }
  useEffect(() => { reload() }, [])

  const totals = useMemo(() => {
    let inflow = 0, outflow = 0, uncat = 0
    for (const r of list) {
      if (Number(r.amount_lyd) > 0) inflow += Number(r.amount_lyd)
      else outflow += -Number(r.amount_lyd)
      if (!r.category) uncat += 1
    }
    return { inflow, outflow, uncat }
  }, [list])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="grid grid-cols-3 gap-2">
          <div className="card text-center py-2">
            <p className="text-noch-muted text-[10px] uppercase">Inflow</p>
            <p className="text-noch-green font-bold">{lyd(totals.inflow)}</p>
          </div>
          <div className="card text-center py-2">
            <p className="text-noch-muted text-[10px] uppercase">Outflow</p>
            <p className="text-red-400 font-bold">{lyd(totals.outflow)}</p>
          </div>
          <div className="card text-center py-2">
            <p className="text-noch-muted text-[10px] uppercase">Uncategorised</p>
            <p className="text-yellow-400 font-bold">{totals.uncat}</p>
          </div>
        </div>
        <button onClick={() => setShowImport(true)} className="btn-primary text-sm flex items-center gap-2">
          <Upload size={14}/> Import CSV
        </button>
      </div>

      {loading ? <p className="text-noch-muted text-center py-12">Loading…</p> : list.length === 0 ? (
        <div className="card text-center py-10 text-noch-muted text-sm">
          <FileText className="mx-auto mb-2" size={28}/>
          No bank transactions yet. Import a CSV from your bank's online portal.
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-noch-muted">
              <tr>
                <th className="text-left py-1 pr-2">Date</th>
                <th className="text-left py-1 pr-2">Account</th>
                <th className="text-left py-1 pr-2">Description</th>
                <th className="text-right py-1 pr-2">Amount</th>
                <th className="text-left py-1 pr-2">Category</th>
              </tr>
            </thead>
            <tbody>
              {list.map(r => (
                <tr key={r.id} className="border-t border-noch-border/40">
                  <td className="py-1.5 pr-2 text-white">{r.posted_at}</td>
                  <td className="py-1.5 pr-2 text-noch-muted">{r.account_label}</td>
                  <td className="py-1.5 pr-2 text-white truncate max-w-xs">{r.description}</td>
                  <td className={`py-1.5 pr-2 text-right font-mono ${Number(r.amount_lyd) >= 0 ? 'text-noch-green' : 'text-red-400'}`}>
                    {lyd(r.amount_lyd)}
                  </td>
                  <td className="py-1.5 pr-2">
                    <CategoryEditor value={r.category} onSave={async (cat) => {
                      try { await updateBankTransactionCategory(r.id, cat); reload() }
                      catch (err) { toast.error(err.message || 'Save failed') }
                    }}/>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showImport && (
        <ImportModal onClose={() => setShowImport(false)} onImported={() => { setShowImport(false); reload() }} />
      )}
    </div>
  )
}

const CATEGORY_OPTIONS = [
  '','rent','utilities','marketing','supplies','maintenance',
  'wages_one_off','professional_fees','licenses','bank_fees',
  'card_settlement','other_opex','capex',
]

function CategoryEditor({ value, onSave }) {
  return (
    <select className="input py-0 px-1 text-xs" value={value || ''} onChange={e => onSave(e.target.value || null)}>
      {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c || '—'}</option>)}
    </select>
  )
}

function ImportModal({ onClose, onImported }) {
  const [accountLabel, setAccountLabel] = useState('Main')
  const [csv, setCsv] = useState('')
  const [parsed, setParsed] = useState([])
  const [importing, setImporting] = useState(false)

  const onParse = () => {
    try {
      const p = parseCSV(csv)
      const rows = rowsToBankTx(p, accountLabel)
      setParsed(rows)
    } catch (err) {
      toast.error(err.message || 'Parse failed')
    }
  }

  const onCommit = async () => {
    if (!parsed.length) return toast.error('Nothing to import')
    setImporting(true)
    try {
      const out = await bulkInsertBankTransactions(parsed)
      toast.success(`Imported ${out.length} new rows (duplicates skipped)`)
      onImported()
    } catch (err) { toast.error(err.message || 'Import failed') }
    finally { setImporting(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-noch-card border border-noch-border rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-5">
        <h2 className="text-white font-bold mb-3 flex items-center gap-2"><Upload size={16}/> Import bank CSV</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="label block mb-1">Account label</label>
            <input className="input w-full" value={accountLabel} onChange={e => setAccountLabel(e.target.value)} placeholder="e.g. Main" />
          </div>
          <div className="col-span-2">
            <label className="label block mb-1">Upload .csv or paste below</label>
            <input type="file" accept=".csv,text/csv" className="input w-full" onChange={async e => {
              const f = e.target.files?.[0]; if (!f) return
              setCsv(await f.text())
            }} />
          </div>
          <textarea rows={6} className="input w-full font-mono text-xs col-span-3" placeholder="date,description,debit,credit,balance"
            value={csv} onChange={e => setCsv(e.target.value)} />
        </div>
        <div className="flex justify-between items-center mb-3">
          <span className="text-noch-muted text-xs">{parsed.length ? `${parsed.length} rows previewed` : ''}</span>
          <button onClick={onParse} className="btn-secondary text-sm">Parse</button>
        </div>
        {parsed.length > 0 && (
          <div className="card overflow-x-auto mb-3">
            <table className="w-full text-xs">
              <thead className="text-noch-muted">
                <tr>
                  <th className="text-left py-1 pr-2">Date</th>
                  <th className="text-left py-1 pr-2">Description</th>
                  <th className="text-right py-1 pr-2">Amount</th>
                  <th className="text-left py-1 pr-2">Auto-cat</th>
                </tr>
              </thead>
              <tbody>
                {parsed.slice(0, 50).map((r, i) => (
                  <tr key={i} className="border-t border-noch-border/40">
                    <td className="py-1 pr-2">{r.posted_at}</td>
                    <td className="py-1 pr-2 truncate max-w-xs">{r.description}</td>
                    <td className={`py-1 pr-2 text-right font-mono ${r.amount_lyd >= 0 ? 'text-noch-green' : 'text-red-400'}`}>{lyd(r.amount_lyd)}</td>
                    <td className="py-1 pr-2"><Tag size={10} className="inline mr-1 text-noch-muted"/>{r.category || '—'}</td>
                  </tr>
                ))}
                {parsed.length > 50 && <tr><td colSpan="4" className="text-noch-muted text-center py-1">+ {parsed.length - 50} more</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={onCommit} disabled={!parsed.length || importing} className="btn-primary flex items-center gap-1">
            <Save size={14}/> {importing ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  )
}
