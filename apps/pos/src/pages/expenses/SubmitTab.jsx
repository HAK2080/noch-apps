// SubmitTab.jsx — Expenses: submit a new expense
import { useState, useEffect, useRef } from 'react'
import { Plus, X, Camera, ChevronDown, Loader2, Building2, Tag } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'
import { fmt, getOwnerSetting, setOwnerSetting, uploadReceipt } from './lib/expensesData'

export default function SubmitTab({ user, profile, isOwner, costCenters, categories, rates, onSubmitted }) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    cost_center_id: '', category_id: '', amount: '', currency: 'LYD',
    vendor: '', description: '', expense_date: today, paid_by: 'Business',
  })
  const [receiptFile, setReceiptFile] = useState(null)
  const [receiptPreview, setReceiptPreview] = useState(null)
  const [saving, setSaving] = useState(false)
  const [autoApprove, setAutoApprove] = useState(false)
  const fileRef = useRef()

  useEffect(() => {
    if (isOwner) getOwnerSetting('auto_approve_own', false).then(setAutoApprove)
  }, [isOwner])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const selectedRate = rates.find(r => r.currency === form.currency)?.rate_to_lyd || 1
  const amountLyd = parseFloat(form.amount || 0) * selectedRate

  function onFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setReceiptFile(file)
    setReceiptPreview(URL.createObjectURL(file))
  }

  async function submit() {
    if (!form.cost_center_id) { toast.error('Select a cost center'); return }
    if (!form.category_id)    { toast.error('Select a category'); return }
    if (!form.amount || isNaN(parseFloat(form.amount))) { toast.error('Enter a valid amount'); return }
    setSaving(true)
    try {
      let receipt_url = null
      if (receiptFile) {
        try { receipt_url = await uploadReceipt(user.id, receiptFile) }
        catch { toast('Receipt upload failed — saving without photo', { icon: '⚠️' }) }
      }
      const isAutoApproved = isOwner && autoApprove
      const { data: expense, error } = await supabase.from('expenses').insert({
        submitted_by: user.id,
        cost_center_id: form.cost_center_id,
        category_id: form.category_id,
        amount: parseFloat(form.amount),
        currency: form.currency,
        exchange_rate_to_lyd: selectedRate,
        amount_lyd: amountLyd,
        vendor: form.vendor || null,
        description: form.description || null,
        paid_by: form.paid_by || 'Business',
        receipt_url,
        expense_date: form.expense_date,
        status: isAutoApproved ? 'approved' : 'pending',
      }).select().single()
      if (error) throw error
      if (isAutoApproved) {
        await supabase.from('expense_approvals').insert({
          expense_id: expense.id,
          acted_by: user.id,
          decision: 'auto_approved',
          notes: 'Auto-approved by owner',
        })
      }
      toast.success(isAutoApproved ? 'Expense submitted & auto-approved' : 'Expense submitted for approval')
      setForm({ cost_center_id: '', category_id: '', amount: '', currency: 'LYD', vendor: '', description: '', expense_date: today, paid_by: 'Business' })
      setReceiptFile(null)
      setReceiptPreview(null)
      onSubmitted()
    } catch (err) {
      toast.error(err.message || 'Failed to submit expense')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {isOwner && (
        <div className="bg-noch-card border border-noch-border rounded-xl px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm text-white font-medium">Auto-approve my expenses</p>
            <p className="text-xs text-noch-muted">Your submissions skip the queue</p>
          </div>
          <button
            onClick={async () => { const v = !autoApprove; setAutoApprove(v); await setOwnerSetting('auto_approve_own', v) }}
            className={`relative w-11 h-6 rounded-full transition-colors ${autoApprove ? 'bg-noch-green' : 'bg-noch-border'}`}
          >
            <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${autoApprove ? 'left-6' : 'left-1'}`} />
          </button>
        </div>
      )}

      {/* Date */}
      <div>
        <label className="text-xs text-noch-muted mb-1 block">Date</label>
        <input type="date" value={form.expense_date} onChange={e => set('expense_date', e.target.value)}
          className="w-full bg-noch-dark border border-noch-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-noch-green/50" />
      </div>

      {/* Cost Center */}
      <div>
        <label className="text-xs text-noch-muted mb-1 block">Cost Center *</label>
        <div className="relative">
          <Building2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-noch-muted" />
          <select value={form.cost_center_id} onChange={e => set('cost_center_id', e.target.value)}
            className="w-full bg-noch-dark border border-noch-border rounded-xl pl-9 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-noch-green/50 appearance-none">
            <option value="">Select cost center…</option>
            {costCenters.map(cc => (
              <option key={cc.id} value={cc.id}>{cc.id} — {cc.name}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-noch-muted pointer-events-none" />
        </div>
      </div>

      {/* Category */}
      <div>
        <label className="text-xs text-noch-muted mb-1 block">Category *</label>
        <div className="relative">
          <Tag size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-noch-muted" />
          <select value={form.category_id} onChange={e => set('category_id', e.target.value)}
            className="w-full bg-noch-dark border border-noch-border rounded-xl pl-9 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-noch-green/50 appearance-none">
            <option value="">Select category…</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-noch-muted pointer-events-none" />
        </div>
      </div>

      {/* Amount + Currency */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-noch-muted mb-1 block">Amount *</label>
          <input type="number" min="0" step="0.01" placeholder="0.00"
            value={form.amount} onChange={e => set('amount', e.target.value)}
            className="w-full bg-noch-dark border border-noch-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-noch-green/50" />
        </div>
        <div>
          <label className="text-xs text-noch-muted mb-1 block">Currency</label>
          <div className="relative">
            <select value={form.currency} onChange={e => set('currency', e.target.value)}
              className="w-full bg-noch-dark border border-noch-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-noch-green/50 appearance-none">
              {rates.map(r => <option key={r.currency} value={r.currency}>{r.currency}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-noch-muted pointer-events-none" />
          </div>
        </div>
      </div>
      {form.currency !== 'LYD' && form.amount && (
        <p className="text-xs text-noch-muted -mt-2">
          ≈ {fmt(amountLyd)} at {selectedRate} LYD/{form.currency}
        </p>
      )}

      {/* Source of payment */}
      <div>
        <label className="text-xs text-noch-muted mb-1 block">Source of Payment</label>
        <select value={form.paid_by} onChange={e => set('paid_by', e.target.value)}
          className="w-full bg-noch-dark border border-noch-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-noch-green/50">
          <option value="Business">Business</option>
          <option value="Haithem">Haithem</option>
          <option value="Ahmed">Ahmed</option>
          <option value="Other">Other</option>
        </select>
      </div>

      {/* Vendor (optional) */}
      <div>
        <label className="text-xs text-noch-muted mb-1 block">Vendor / Supplier <span className="opacity-50">(optional)</span></label>
        <input type="text" placeholder="e.g. Al-Amal Hardware"
          value={form.vendor} onChange={e => set('vendor', e.target.value)}
          className="w-full bg-noch-dark border border-noch-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-noch-green/50" />
      </div>

      {/* Description */}
      <div>
        <label className="text-xs text-noch-muted mb-1 block">Description <span className="opacity-50">(optional)</span></label>
        <textarea rows={2} placeholder="Brief note about this expense…"
          value={form.description} onChange={e => set('description', e.target.value)}
          className="w-full bg-noch-dark border border-noch-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-noch-green/50 resize-none" />
      </div>

      {/* Receipt upload */}
      <div>
        <label className="text-xs text-noch-muted mb-1 block">Receipt Photo <span className="opacity-50">(optional)</span></label>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onFileChange} className="hidden" />
        {receiptPreview ? (
          <div className="relative">
            <img src={receiptPreview} alt="Receipt" className="w-full max-h-48 object-contain rounded-xl border border-noch-border bg-noch-dark" />
            <button onClick={() => { setReceiptFile(null); setReceiptPreview(null) }}
              className="absolute top-2 right-2 w-7 h-7 bg-red-500/80 rounded-full flex items-center justify-center hover:bg-red-500">
              <X size={13} className="text-white" />
            </button>
          </div>
        ) : (
          <button onClick={() => fileRef.current?.click()}
            className="w-full border-2 border-dashed border-noch-border rounded-xl py-6 flex flex-col items-center gap-2 text-noch-muted hover:border-noch-green/40 hover:text-noch-green transition-colors">
            <Camera size={24} />
            <span className="text-sm">Tap to take photo or upload</span>
          </button>
        )}
      </div>

      <button onClick={submit} disabled={saving}
        className="w-full bg-noch-green text-black py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-noch-green/90 disabled:opacity-50 disabled:cursor-not-allowed">
        {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
        {saving ? 'Submitting…' : 'Submit Expense'}
      </button>
    </div>
  )
}
