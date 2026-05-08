// ExpensesTab.jsx — list + create + edit + delete expense entries.

import { useEffect, useState } from 'react'
import { Plus, Trash2, X, Camera, Loader2, CheckCircle2 } from 'lucide-react'
import {
  listExpenses, createExpense, updateExpense, deleteExpense, listBranches,
  ocrInvoice,
} from '../lib/finance-supabase'
import { lyd } from '../lib/thresholds'
import toast from 'react-hot-toast'

const CATEGORIES = [
  'rent','utilities','marketing','supplies','maintenance',
  'wages_one_off','professional_fees','licenses','bank_fees',
  'other_opex','capex',
]

export default function ExpensesTab() {
  const [list, setList] = useState([])
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterCat, setFilterCat] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [scanDraft, setScanDraft] = useState(null)

  const reload = async () => {
    setLoading(true)
    try {
      const [rows, bs] = await Promise.all([listExpenses({}), listBranches()])
      setList(rows); setBranches(bs)
    } catch (err) { toast.error(err.message || 'Failed to load') }
    finally { setLoading(false) }
  }
  useEffect(() => { reload() }, [])

  const pendingCount = list.filter(r => r.status === 'pending_review').length
  const filtered = list
    .filter(r => filterCat ? r.category === filterCat : true)
    .filter(r => filterCat === '__pending' ? r.status === 'pending_review' : true)
  const totalLyd = filtered.reduce((s, r) => s + Number(r.amount_lyd || 0), 0)

  const onSave = async (form, id) => {
    try {
      if (id) await updateExpense(id, form)
      else    await createExpense(form)
      toast.success(id ? 'Updated' : 'Saved')
      setShowAdd(false); setEditing(null)
      reload()
    } catch (err) { toast.error(err.message || 'Save failed') }
  }
  const onDelete = async (id) => {
    if (!window.confirm('Delete this expense?')) return
    try { await deleteExpense(id); toast.success('Deleted'); reload() }
    catch (err) { toast.error(err.message || 'Delete failed') }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="input py-1 px-2 text-xs">
            <option value="">All categories</option>
            {pendingCount > 0 && <option value="__pending">⚠ Pending review ({pendingCount})</option>}
            {CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
          </select>
          <span className="text-noch-muted text-xs">{filtered.length} entries · {lyd(totalLyd)}</span>
        </div>
        <div className="flex gap-2">
          <label className={`btn-secondary text-xs px-3 py-1 flex items-center gap-1 cursor-pointer ${scanning ? 'opacity-50 pointer-events-none' : ''}`}>
            {scanning ? <Loader2 size={12} className="animate-spin"/> : <Camera size={12}/>}
            {scanning ? 'Scanning…' : 'Scan invoice'}
            <input type="file" accept="image/*" capture="environment" hidden disabled={scanning}
              onChange={async e => {
                const file = e.target.files?.[0]
                if (!file) return
                setScanning(true)
                try {
                  const data = await ocrInvoice(file)
                  setScanDraft(data)
                  toast.success('Scanned — review the draft')
                } catch (err) { toast.error(err.message || 'OCR failed') }
                finally { setScanning(false); e.target.value = '' }
              }} />
          </label>
          <button onClick={() => setShowAdd(true)} className="btn-primary text-xs px-3 py-1 flex items-center gap-1">
            <Plus size={12}/> Add expense
          </button>
        </div>
      </div>

      {loading ? <p className="text-noch-muted text-center py-12">Loading…</p> : (
        filtered.length === 0 ? (
          <div className="card text-center py-10 text-noch-muted text-sm">No expenses{filterCat ? ` in "${filterCat}"` : ''} yet.</div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-noch-muted">
                <tr>
                  <th className="text-left py-1 pr-2">Date</th>
                  <th className="text-left py-1 pr-2">Category</th>
                  <th className="text-left py-1 pr-2">Vendor</th>
                  <th className="text-left py-1 pr-2">Branch</th>
                  <th className="text-right py-1 pr-2">Amount</th>
                  <th className="py-1"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const isPending = r.status === 'pending_review'
                  return (
                    <tr key={r.id} className={`border-t border-noch-border/40 ${isPending ? 'bg-yellow-500/5' : ''}`}>
                      <td className="py-1.5 pr-2 text-white">{r.paid_at}</td>
                      <td className="py-1.5 pr-2 text-white">
                        {r.category.replace(/_/g, ' ')}
                        {isPending && <span className="ml-2 text-[9px] uppercase font-bold bg-yellow-500/20 text-yellow-300 px-1.5 py-0.5 rounded">review</span>}
                      </td>
                      <td className="py-1.5 pr-2 text-white">{r.vendor || '—'}</td>
                      <td className="py-1.5 pr-2 text-noch-muted">{branches.find(b => b.id === r.branch_id)?.name || (r.branch_id ? '—' : 'corporate')}</td>
                      <td className="py-1.5 pr-2 text-right text-noch-green font-mono">{lyd(r.amount_lyd)}</td>
                      <td className="py-1.5 text-right">
                        {isPending && (
                          <button onClick={() => onSave({ status: 'approved' }, r.id)} className="text-noch-green text-[10px] uppercase font-bold px-1">approve</button>
                        )}
                        <button onClick={() => setEditing(r)} className="text-noch-muted hover:text-white px-1">edit</button>
                        <button onClick={() => onDelete(r.id)} className="text-red-400 hover:text-red-300 px-1"><Trash2 size={10}/></button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {(showAdd || editing) && (
        <ExpenseFormModal
          branches={branches}
          initial={editing}
          onClose={() => { setShowAdd(false); setEditing(null) }}
          onSave={(form) => onSave(form, editing?.id)}
        />
      )}

      {scanDraft && (
        <ExpenseFormModal
          branches={branches}
          initial={{
            paid_at: scanDraft.date || new Date().toISOString().slice(0, 10),
            category: scanDraft.category_guess || 'supplies',
            amount_lyd: scanDraft.total ?? '',
            vendor: scanDraft.vendor || '',
            notes: [
              scanDraft.invoice_number ? `Invoice ${scanDraft.invoice_number}` : null,
              scanDraft.currency && scanDraft.currency !== 'LYD' ? `Currency: ${scanDraft.currency}` : null,
              scanDraft.notes,
            ].filter(Boolean).join(' · '),
          }}
          ocrPreview={scanDraft}
          onClose={() => setScanDraft(null)}
          onSave={(form) => onSave({
            ...form,
            status: 'pending_review',
            ocr_confidence: scanDraft?.confidence || null,
            ocr_raw_response: scanDraft || null,
            invoice_number: scanDraft?.invoice_number || null,
            currency: scanDraft?.currency || 'LYD',
          }).then(() => setScanDraft(null))}
        />
      )}
    </div>
  )
}

function ExpenseFormModal({ branches, initial, onClose, onSave, ocrPreview }) {
  const [form, setForm] = useState(() => ({
    paid_at: initial?.paid_at || new Date().toISOString().slice(0, 10),
    category: initial?.category || 'other_opex',
    amount_lyd: initial?.amount_lyd ?? '',
    vendor: initial?.vendor || '',
    branch_id: initial?.branch_id || '',
    notes: initial?.notes || '',
  }))
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = () => {
    if (!form.amount_lyd || Number(form.amount_lyd) < 0) return toast.error('Enter a positive amount')
    onSave({
      paid_at: form.paid_at,
      category: form.category,
      amount_lyd: Number(form.amount_lyd),
      vendor: form.vendor || null,
      branch_id: form.branch_id || null,
      notes: form.notes || null,
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-noch-card border border-noch-border rounded-2xl w-full max-w-md p-5">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-white font-bold flex items-center gap-2">
            {ocrPreview ? <><CheckCircle2 className="text-noch-green" size={16}/> OCR draft — review</> : (initial ? 'Edit expense' : 'Add expense')}
          </h2>
          <button onClick={onClose}><X className="text-noch-muted" size={16}/></button>
        </div>
        {ocrPreview && ocrPreview.line_items?.length > 0 && (
          <div className="bg-noch-dark/40 rounded-lg p-2 mb-3 text-xs">
            <p className="text-noch-muted mb-1">{ocrPreview.line_items.length} line items extracted</p>
            <ul className="text-white space-y-0.5">
              {ocrPreview.line_items.slice(0, 5).map((li, i) => (
                <li key={i} className="flex justify-between">
                  <span className="truncate">{li.name}</span>
                  <span className="font-mono shrink-0 ml-2">{li.qty || 1} × {li.unit_cost ?? '?'}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label block mb-1">Date</label>
            <input type="date" className="input w-full" value={form.paid_at} onChange={e => set('paid_at', e.target.value)} />
          </div>
          <div>
            <label className="label block mb-1">Category</label>
            <select className="input w-full" value={form.category} onChange={e => set('category', e.target.value)}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="label block mb-1">Amount (LYD)</label>
            <input type="number" step="0.01" className="input w-full" value={form.amount_lyd} onChange={e => set('amount_lyd', e.target.value)} />
          </div>
          <div>
            <label className="label block mb-1">Branch</label>
            <select className="input w-full" value={form.branch_id} onChange={e => set('branch_id', e.target.value)}>
              <option value="">corporate / cross-branch</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="label block mb-1">Vendor</label>
            <input className="input w-full" value={form.vendor} onChange={e => set('vendor', e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="label block mb-1">Notes</label>
            <textarea rows={2} className="input w-full resize-none" value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={submit} className="btn-primary">{initial ? 'Save' : 'Add'}</button>
        </div>
      </div>
    </div>
  )
}
