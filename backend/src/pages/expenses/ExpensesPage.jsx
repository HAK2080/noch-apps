// ExpensesPage.jsx — Cost Center Expense Tracking Module
// Tabs: Submit | My Expenses | Approve | Dashboard | Settings (owner)

import React, { useState, useEffect, useRef } from 'react'
import {
  Receipt, Plus, Check, X, Clock, DollarSign, Camera, Upload,
  ChevronDown, Settings, BarChart3, Loader2, Eye, CreditCard,
  Building2, Tag, AlertCircle, CheckCircle2, Ban, Wallet, Zap
} from 'lucide-react'
import Layout from '../../components/Layout'
import { useAuth } from '../../contexts/AuthContext'
import { usePermissions } from '../../contexts/PermissionsContext'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

// ── Helpers ─────────────────────────────────────────────────
const fmt = (n, currency = 'LYD') =>
  `${Number(n || 0).toLocaleString('en', { maximumFractionDigits: 2 })} ${currency}`

// Fall back to amount when amount_lyd wasn't populated (older records)
const amtLyd = (e) => e.amount_lyd ?? (e.amount * (e.exchange_rate_to_lyd || 1)) ?? 0

const STATUS_META = {
  pending:  { label: 'Pending',  color: 'text-yellow-400', bg: 'bg-yellow-400/10', icon: Clock },
  approved: { label: 'Approved', color: 'text-noch-green', bg: 'bg-noch-green/10',  icon: CheckCircle2 },
  rejected: { label: 'Rejected', color: 'text-red-400',    bg: 'bg-red-400/10',     icon: Ban },
  paid:     { label: 'Paid',     color: 'text-blue-400',   bg: 'bg-blue-400/10',    icon: Wallet },
}

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.pending
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${m.bg} ${m.color}`}>
      <m.icon size={11} />
      {m.label}
    </span>
  )
}

// ── DB helpers (inline, no supabase.js import needed) ───────
async function loadCostCenters() {
  const { data } = await supabase.from('cost_centers').select('*').order('id')
  return data || []
}
async function loadCategories() {
  const { data } = await supabase.from('expense_categories').select('*').order('name')
  return data || []
}
async function loadRates() {
  const { data } = await supabase.from('cc_exchange_rates').select('*').order('currency')
  return data || []
}
async function loadExpenses(filter = {}) {
  let q = supabase
    .from('expenses')
    .select(`*, cost_centers(id,name), expense_categories(id,name), profiles!expenses_submitted_by_fkey(full_name)`)
    .order('submitted_at', { ascending: false })
  if (filter.userId) q = q.eq('submitted_by', filter.userId)
  if (filter.status) q = q.eq('status', filter.status)
  if (filter.ccId)   q = q.eq('cost_center_id', filter.ccId)
  const { data } = await q
  return data || []
}
async function loadApprovals(expenseIds) {
  if (!expenseIds.length) return []
  const { data } = await supabase.from('expense_approvals')
    .select('*, profiles(full_name)')
    .in('expense_id', expenseIds)
    .order('acted_at', { ascending: false })
  return data || []
}
async function deleteExpense(id) {
  await supabase.from('expense_approvals').delete().eq('expense_id', id)
  const { error } = await supabase.from('expenses').delete().eq('id', id)
  if (error) throw error
}
async function uploadReceipt(userId, file) {
  const ext = file.name.split('.').pop()
  const path = `${userId}/${Date.now()}.${ext}`
  const { data, error } = await supabase.storage.from('expense-receipts').upload(path, file, { upsert: false })
  if (error) throw error
  const { data: { publicUrl } } = supabase.storage.from('expense-receipts').getPublicUrl(data.path)
  return publicUrl
}
async function getOwnerSetting(key, fallback = null) {
  const { data } = await supabase.from('owner_settings').select('value').eq('key', key).maybeSingle()
  return data ? data.value : fallback
}
async function setOwnerSetting(key, value) {
  await supabase.from('owner_settings').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
}

// ── SUBMIT TAB ───────────────────────────────────────────────
function SubmitTab({ user, profile, isOwner, costCenters, categories, rates, onSubmitted }) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    cost_center_id: '', category_id: '', amount: '', currency: 'LYD',
    vendor: '', description: '', expense_date: today,
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
      setForm({ cost_center_id: '', category_id: '', amount: '', currency: 'LYD', vendor: '', description: '', expense_date: today })
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

// ── MY EXPENSES TAB ──────────────────────────────────────────
function MyExpensesTab({ userId, refreshKey }) {
  const [expenses, setExpenses] = useState([])
  const [approvals, setApprovals] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [deleting, setDeleting] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  useEffect(() => { load() }, [userId, refreshKey])

  async function load() {
    setLoading(true)
    const data = await loadExpenses({ userId })
    setExpenses(data)
    if (data.length) {
      const appr = await loadApprovals(data.map(e => e.id))
      setApprovals(appr)
    }
    setLoading(false)
  }

  async function handleDelete(id) {
    setDeleting(id)
    try {
      await deleteExpense(id)
      toast.success('Expense removed')
      setConfirmDelete(null)
      load()
    } catch (err) { toast.error(err.message) }
    setDeleting(null)
  }

  const filtered = filter === 'all' ? expenses : expenses.filter(e => e.status === filter)
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
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-xs text-noch-muted">{exp.cost_centers?.id} — {exp.cost_centers?.name}</span>
                        <span className="text-noch-muted opacity-40">·</span>
                        <span className="text-xs text-noch-muted">{exp.expense_categories?.name}</span>
                      </div>
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

// ── APPROVE TAB ──────────────────────────────────────────────
function ApproveTab({ actorId, isOwner, refreshKey, onAction, costCenters, categories, rates }) {
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('pending')
  const [noteModal, setNoteModal] = useState(null)
  const [note, setNote] = useState('')
  const [acting, setActing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [editModal, setEditModal] = useState(null) // expense object
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [refreshKey])

  async function load() {
    setLoading(true)
    const filter = tab === 'pending' ? { status: 'pending' } : {}
    const data = await loadExpenses(filter)
    setExpenses(data)
    setLoading(false)
  }
  useEffect(() => { load() }, [tab])

  async function act(expenseId, decision, notes = '') {
    if (decision === 'rejected' && !notes.trim()) {
      setNoteModal({ expenseId, decision }); setNote(''); return
    }
    setActing(expenseId)
    try {
      await supabase.from('expenses').update({ status: decision, updated_at: new Date().toISOString() }).eq('id', expenseId)
      await supabase.from('expense_approvals').insert({ expense_id: expenseId, acted_by: actorId, decision, notes: notes || null })
      toast.success(decision === 'paid' ? 'Marked as paid' : `Expense ${decision}`)
      onAction()
      load()
    } catch (err) { toast.error(err.message) }
    setActing(null)
  }

  async function confirmNote() {
    if (!note.trim()) { toast.error('Add a note explaining the rejection'); return }
    setNoteModal(null)
    await act(noteModal.expenseId, noteModal.decision, note)
  }

  async function handleDelete(id) {
    setDeleting(id)
    try {
      await deleteExpense(id)
      toast.success('Expense removed')
      setConfirmDelete(null)
      onAction()
      load()
    } catch (err) { toast.error(err.message) }
    setDeleting(null)
  }

  function openEdit(exp) {
    setEditForm({
      cost_center_id: exp.cost_center_id || '',
      category_id: exp.category_id || '',
      amount: exp.amount || '',
      currency: exp.currency || 'LYD',
      vendor: exp.vendor || '',
      description: exp.description || '',
      expense_date: exp.expense_date || '',
    })
    setEditModal(exp)
  }

  async function saveEdit() {
    if (!editForm.cost_center_id) { toast.error('Select a cost center'); return }
    if (!editForm.category_id) { toast.error('Select a category'); return }
    if (!editForm.amount || isNaN(parseFloat(editForm.amount))) { toast.error('Enter a valid amount'); return }
    setSaving(true)
    try {
      const rate = rates.find(r => r.currency === editForm.currency)?.rate_to_lyd || 1
      const amount_lyd = parseFloat(editForm.amount) * rate
      await supabase.from('expenses').update({
        cost_center_id: editForm.cost_center_id,
        category_id: editForm.category_id,
        amount: parseFloat(editForm.amount),
        currency: editForm.currency,
        exchange_rate_to_lyd: rate,
        amount_lyd,
        vendor: editForm.vendor || null,
        description: editForm.description || null,
        expense_date: editForm.expense_date,
        updated_at: new Date().toISOString(),
      }).eq('id', editModal.id)
      toast.success('Expense updated')
      setEditModal(null)
      onAction()
      load()
    } catch (err) { toast.error(err.message) }
    setSaving(false)
  }

  const setE = (k, v) => setEditForm(f => ({ ...f, [k]: v }))

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {['pending', 'all'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors
              ${tab === t ? 'bg-noch-green text-black' : 'bg-noch-card border border-noch-border text-noch-muted hover:text-white'}`}>
            {t === 'pending' ? 'Needs Action' : 'All Expenses'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-noch-muted">
          <Loader2 size={20} className="animate-spin mr-2" /> Loading…
        </div>
      ) : expenses.length === 0 ? (
        <div className="text-center py-12 text-noch-muted">
          <CheckCircle2 size={32} className="mx-auto mb-2 text-noch-green opacity-50" />
          {tab === 'pending' ? 'No pending expenses — inbox zero 🎉' : 'No expenses yet'}
        </div>
      ) : (
        <div className="space-y-3">
          {expenses.map(exp => (
            <div key={exp.id} className="bg-noch-card border border-noch-border rounded-xl p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-semibold">{fmt(exp.amount, exp.currency)}</span>
                    {exp.currency !== 'LYD' && <span className="text-noch-muted text-xs">≈ {fmt(exp.amount_lyd)}</span>}
                    <StatusBadge status={exp.status} />
                  </div>
                  <p className="text-xs text-noch-muted mt-0.5">
                    By <span className="text-white">{exp.profiles?.full_name || 'Staff'}</span> · {exp.expense_date}
                  </p>
                  <p className="text-xs text-noch-muted mt-0.5">
                    {exp.cost_centers?.id} — {exp.cost_centers?.name} · {exp.expense_categories?.name}
                  </p>
                  {exp.vendor && <p className="text-xs text-noch-muted">📍 {exp.vendor}</p>}
                  {exp.description && <p className="text-xs text-noch-muted italic mt-1">"{exp.description}"</p>}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {exp.receipt_url && (
                    <a href={exp.receipt_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-noch-green hover:underline">
                      <Eye size={13} /> Receipt
                    </a>
                  )}
                  {isOwner && (
                    <button onClick={() => openEdit(exp)}
                      className="text-xs text-noch-muted hover:text-white flex items-center gap-1">
                      ✏️ Edit
                    </button>
                  )}
                </div>
              </div>

              {exp.status === 'pending' && (
                <div className="flex gap-2">
                  <button onClick={() => act(exp.id, 'approved')} disabled={acting === exp.id}
                    className="flex-1 bg-noch-green/10 text-noch-green border border-noch-green/20 rounded-lg py-2 text-xs font-medium hover:bg-noch-green/20 flex items-center justify-center gap-1 disabled:opacity-50">
                    {acting === exp.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={13} />} Approve
                  </button>
                  <button onClick={() => act(exp.id, 'rejected')} disabled={acting === exp.id}
                    className="flex-1 bg-red-400/10 text-red-400 border border-red-400/20 rounded-lg py-2 text-xs font-medium hover:bg-red-400/20 flex items-center justify-center gap-1 disabled:opacity-50">
                    <X size={13} /> Reject
                  </button>
                </div>
              )}
              {exp.status === 'approved' && (
                <button onClick={() => act(exp.id, 'paid')} disabled={acting === exp.id}
                  className="w-full bg-blue-400/10 text-blue-400 border border-blue-400/20 rounded-lg py-2 text-xs font-medium hover:bg-blue-400/20 flex items-center justify-center gap-1 disabled:opacity-50">
                  <Wallet size={13} /> Mark as Paid
                </button>
              )}
              {exp.status === 'rejected' && (
                <div className="mt-2 pt-2 border-t border-noch-border">
                  {confirmDelete === exp.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-red-400 flex-1">Remove permanently?</span>
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
          ))}
        </div>
      )}

      {/* Reject note modal */}
      {noteModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-noch-card border border-noch-border rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-white font-semibold mb-3">Rejection note</h3>
            <textarea rows={3} value={note} onChange={e => setNote(e.target.value)}
              placeholder="Explain why this expense is being rejected…"
              className="w-full bg-noch-dark border border-noch-border rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-noch-green/50 resize-none mb-3" />
            <div className="flex gap-2">
              <button onClick={() => setNoteModal(null)}
                className="flex-1 bg-noch-border text-noch-muted rounded-xl py-2 text-sm hover:text-white">Cancel</button>
              <button onClick={confirmNote}
                className="flex-1 bg-red-500 text-white rounded-xl py-2 text-sm font-medium hover:bg-red-600">Reject</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit expense modal (owner only) */}
      {editModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-noch-card border border-noch-border rounded-2xl p-6 w-full max-w-sm my-auto space-y-3">
            <h3 className="text-white font-semibold">Edit Expense</h3>
            <p className="text-xs text-noch-muted -mt-1">By {editModal.profiles?.full_name || 'Staff'}</p>

            <div>
              <label className="text-xs text-noch-muted mb-1 block">Date</label>
              <input type="date" value={editForm.expense_date} onChange={e => setE('expense_date', e.target.value)}
                className="w-full bg-noch-dark border border-noch-border rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-noch-green/50" />
            </div>
            <div>
              <label className="text-xs text-noch-muted mb-1 block">Cost Center</label>
              <select value={editForm.cost_center_id} onChange={e => setE('cost_center_id', e.target.value)}
                className="w-full bg-noch-dark border border-noch-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-noch-green/50">
                <option value="">Select…</option>
                {costCenters.map(cc => <option key={cc.id} value={cc.id}>{cc.id} — {cc.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-noch-muted mb-1 block">Category</label>
              <select value={editForm.category_id} onChange={e => setE('category_id', e.target.value)}
                className="w-full bg-noch-dark border border-noch-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-noch-green/50">
                <option value="">Select…</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-noch-muted mb-1 block">Amount</label>
                <input type="number" min="0" step="0.01" value={editForm.amount} onChange={e => setE('amount', e.target.value)}
                  className="w-full bg-noch-dark border border-noch-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-noch-green/50" />
              </div>
              <div>
                <label className="text-xs text-noch-muted mb-1 block">Currency</label>
                <select value={editForm.currency} onChange={e => setE('currency', e.target.value)}
                  className="w-full bg-noch-dark border border-noch-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-noch-green/50">
                  {rates.map(r => <option key={r.currency} value={r.currency}>{r.currency}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-noch-muted mb-1 block">Vendor</label>
              <input type="text" value={editForm.vendor} onChange={e => setE('vendor', e.target.value)}
                className="w-full bg-noch-dark border border-noch-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-noch-green/50" />
            </div>
            <div>
              <label className="text-xs text-noch-muted mb-1 block">Description</label>
              <textarea rows={2} value={editForm.description} onChange={e => setE('description', e.target.value)}
                className="w-full bg-noch-dark border border-noch-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-noch-green/50 resize-none" />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setEditModal(null)}
                className="flex-1 bg-noch-border text-noch-muted rounded-xl py-2 text-sm hover:text-white">Cancel</button>
              <button onClick={saveEdit} disabled={saving}
                className="flex-1 bg-noch-green text-black rounded-xl py-2 text-sm font-semibold hover:bg-noch-green/90 disabled:opacity-50 flex items-center justify-center gap-1">
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── DASHBOARD TAB ────────────────────────────────────────────
function DashboardTab({ refreshKey }) {
  const [expenses, setExpenses] = useState([])
  const [costCenters, setCostCenters] = useState([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('month')
  const [selectedCc, setSelectedCc] = useState('')

  useEffect(() => { load() }, [refreshKey, period])

  async function load() {
    setLoading(true)
    const now = new Date()
    const start = period === 'month'
      ? new Date(now.getFullYear(), now.getMonth(), 1)
      : period === 'quarter'
        ? new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
        : new Date(now.getFullYear(), 0, 1)
    const [exp, ccs] = await Promise.all([
      loadExpenses(),
      loadCostCenters(),
    ])
    const filtered = exp.filter(e => new Date(e.expense_date) >= start)
    setExpenses(filtered)
    setCostCenters(ccs)
    setLoading(false)
  }

  // Exclude rejected from all totals
  const active = expenses.filter(e => e.status !== 'rejected')
  const total = active.reduce((s, e) => s + amtLyd(e), 0)
  const pending = active.filter(e => e.status === 'pending').reduce((s, e) => s + amtLyd(e), 0)
  const approved = active.filter(e => e.status === 'approved').reduce((s, e) => s + amtLyd(e), 0)
  const paid = active.filter(e => e.status === 'paid').reduce((s, e) => s + amtLyd(e), 0)

  // Per cost center totals
  const byCc = costCenters.map(cc => {
    const ccExp = active.filter(e => e.cost_center_id === cc.id)
    return {
      ...cc,
      total: ccExp.reduce((s, e) => s + amtLyd(e), 0),
      count: ccExp.length,
      pending: ccExp.filter(e => e.status === 'pending').length,
    }
  }).filter(cc => cc.count > 0).sort((a, b) => b.total - a.total)

  // Category breakdown — filtered by selected CC when one is chosen
  const drillExp = selectedCc ? active.filter(e => e.cost_center_id === selectedCc) : active
  const catMap = {}
  drillExp.forEach(e => {
    const k = e.expense_categories?.name || 'Other'
    if (!catMap[k]) catMap[k] = { name: k, total: 0, count: 0 }
    catMap[k].total += amtLyd(e)
    catMap[k].count += 1
  })
  const byCategory = Object.values(catMap).sort((a, b) => b.total - a.total)
  const drillTotal = drillExp.reduce((s, e) => s + amtLyd(e), 0)

  const selectedCcName = costCenters.find(cc => cc.id === selectedCc)?.name

  return (
    <div className="space-y-5">
      {/* Period selector */}
      <div className="flex gap-2 flex-wrap">
        {[['month','This Month'],['quarter','This Quarter'],['year','This Year']].map(([v,l]) => (
          <button key={v} onClick={() => setPeriod(v)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors
              ${period === v ? 'bg-noch-green text-black' : 'bg-noch-card border border-noch-border text-noch-muted hover:text-white'}`}>
            {l}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-noch-muted">
          <Loader2 size={20} className="animate-spin mr-2" /> Loading…
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total Submitted', value: total, color: 'text-white' },
              { label: 'Pending Approval', value: pending, color: 'text-yellow-400' },
              { label: 'Approved', value: approved, color: 'text-noch-green' },
              { label: 'Paid Out', value: paid, color: 'text-blue-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-noch-card border border-noch-border rounded-xl p-4">
                <p className={`text-xl font-bold ${color}`}>{fmt(value)}</p>
                <p className="text-xs text-noch-muted mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* By cost center — click a row to drill in */}
          {byCc.length > 0 && (
            <div className="bg-noch-card border border-noch-border rounded-xl p-4">
              <h3 className="text-white font-semibold text-sm mb-3">By Cost Center</h3>
              <div className="space-y-1">
                {byCc.map(cc => {
                  const pct = total > 0 ? Math.round((cc.total / total) * 100) : 0
                  const isSelected = selectedCc === cc.id
                  return (
                    <button key={cc.id}
                      onClick={() => setSelectedCc(isSelected ? '' : cc.id)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors flex items-center justify-between gap-3
                        ${isSelected ? 'bg-noch-green/15 border border-noch-green/30' : 'hover:bg-noch-dark/60'}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-white font-medium">{cc.id} — {cc.name}</span>
                          {cc.pending > 0 && <span className="text-xs text-yellow-400">{cc.pending} pending</span>}
                        </div>
                        <div className="mt-1 h-1 bg-noch-border rounded-full overflow-hidden">
                          <div className="h-full bg-noch-green rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-sm font-semibold text-white tabular-nums">{fmt(cc.total)}</span>
                        <span className="ml-2 text-xs text-noch-muted">{pct}%</span>
                      </div>
                    </button>
                  )
                })}
              </div>
              {selectedCc && (
                <button onClick={() => setSelectedCc('')}
                  className="mt-2 text-xs text-noch-muted hover:text-white flex items-center gap-1">
                  <X size={11} /> Clear filter
                </button>
              )}
            </div>
          )}

          {/* By category — scoped to selected CC */}
          {byCategory.length > 0 && (
            <div className="bg-noch-card border border-noch-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-semibold text-sm">
                  By Category
                  {selectedCcName && (
                    <span className="ml-2 text-noch-green font-normal">— {selectedCcName}</span>
                  )}
                </h3>
                {selectedCc && (
                  <span className="text-xs text-noch-muted">{fmt(drillTotal)} total</span>
                )}
              </div>
              <div className="space-y-2">
                {byCategory.map(c => {
                  const pct = drillTotal > 0 ? Math.round((c.total / drillTotal) * 100) : 0
                  return (
                    <div key={c.name} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-noch-muted">{c.name}
                          <span className="ml-1 text-xs opacity-50">×{c.count}</span>
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-noch-muted">{pct}%</span>
                          <span className="text-sm font-semibold text-white tabular-nums">{fmt(c.total)}</span>
                        </div>
                      </div>
                      <div className="h-1 bg-noch-border rounded-full overflow-hidden">
                        <div className="h-full bg-noch-green/50 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {expenses.length === 0 && (
            <div className="text-center py-8 text-noch-muted">No expenses recorded this period</div>
          )}
        </>
      )}
    </div>
  )
}

// ── SETTINGS TAB (owner only) — Categories + Cost Centers + Rates ───
function SettingsTab({ onMetaChanged }) {
  const [costCenters, setCostCenters] = useState([])
  const [categories, setCategories] = useState([])
  const [rates, setRates] = useState([])
  const [loading, setLoading] = useState(true)
  const [editRate, setEditRate] = useState({})
  const [saving, setSaving] = useState(false)

  // Category inputs
  const [newCat, setNewCat] = useState('')
  const [editingCat, setEditingCat] = useState(null)
  const [editCatName, setEditCatName] = useState('')
  const [confirmDelCat, setConfirmDelCat] = useState(null)

  // Cost center inputs
  const [newCcId, setNewCcId] = useState('')
  const [newCcName, setNewCcName] = useState('')
  const [editingCc, setEditingCc] = useState(null)
  const [editCcName, setEditCcName] = useState('')
  const [confirmDelCc, setConfirmDelCc] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [ccs, cats, rs] = await Promise.all([
      supabase.from('cost_centers').select('*').order('id').then(r => r.data || []),
      supabase.from('expense_categories').select('*').order('name').then(r => r.data || []),
      supabase.from('cc_exchange_rates').select('*').order('currency').then(r => r.data || []),
    ])
    setCostCenters(ccs)
    setCategories(cats)
    setRates(rs)
    const rateMap = {}; rs.forEach(r => { rateMap[r.currency] = r.rate_to_lyd })
    setEditRate(rateMap)
    setLoading(false)
  }

  function refreshAll() {
    load()
    if (onMetaChanged) onMetaChanged()
  }

  async function saveRates() {
    setSaving(true)
    try {
      for (const [currency, rate] of Object.entries(editRate)) {
        await supabase.from('cc_exchange_rates')
          .upsert({ currency, rate_to_lyd: parseFloat(rate), updated_at: new Date().toISOString() }, { onConflict: 'currency' })
      }
      toast.success('Exchange rates saved')
      load()
    } catch (err) { toast.error(err.message) }
    setSaving(false)
  }

  // Categories
  async function addCategory() {
    if (!newCat.trim()) { toast.error('Enter category name'); return }
    const { error } = await supabase.from('expense_categories').insert({ name: newCat.trim() })
    if (error) { toast.error(error.message); return }
    setNewCat('')
    toast.success('Category added')
    refreshAll()
  }
  async function saveCategoryName(id) {
    if (!editCatName.trim()) { toast.error('Name required'); return }
    const { error } = await supabase.from('expense_categories').update({ name: editCatName.trim() }).eq('id', id)
    if (error) { toast.error(error.message); return }
    setEditingCat(null); setEditCatName('')
    toast.success('Category renamed')
    refreshAll()
  }
  async function deleteCategory(id) {
    const { error } = await supabase.from('expense_categories').delete().eq('id', id)
    if (error) { toast.error('Cannot delete — category may be in use by existing expenses'); return }
    setConfirmDelCat(null)
    toast.success('Category removed')
    refreshAll()
  }

  // Cost Centers
  async function addCostCenter() {
    const id = newCcId.trim().toUpperCase()
    const name = newCcName.trim()
    if (!id || !name) { toast.error('Both code and name required'); return }
    const { error } = await supabase.from('cost_centers').insert({ id, name })
    if (error) { toast.error(error.message); return }
    setNewCcId(''); setNewCcName('')
    toast.success('Cost center added')
    refreshAll()
  }
  async function saveCcName(id) {
    if (!editCcName.trim()) { toast.error('Name required'); return }
    const { error } = await supabase.from('cost_centers').update({ name: editCcName.trim() }).eq('id', id)
    if (error) { toast.error(error.message); return }
    setEditingCc(null); setEditCcName('')
    toast.success('Cost center renamed')
    refreshAll()
  }
  async function deleteCostCenter(id) {
    const { error } = await supabase.from('cost_centers').delete().eq('id', id)
    if (error) { toast.error('Cannot delete — cost center may be in use by existing expenses'); return }
    setConfirmDelCc(null)
    toast.success('Cost center removed')
    refreshAll()
  }

  if (loading) return <div className="flex items-center justify-center py-12 text-noch-muted"><Loader2 size={20} className="animate-spin mr-2" />Loading…</div>

  return (
    <div className="space-y-6 max-w-4xl">

      {/* Expense Categories — at top */}
      <div className="bg-noch-card border border-noch-border rounded-xl p-4">
        <h3 className="text-white font-semibold mb-3">Expense Categories</h3>
        <div className="space-y-1 mb-4">
          {categories.length === 0 && <p className="text-xs text-noch-muted">No categories yet — add one below.</p>}
          {categories.map(cat => (
            <div key={cat.id} className="flex items-center gap-3 p-2 rounded-lg bg-noch-dark/40">
              {editingCat === cat.id ? (
                <>
                  <input type="text" value={editCatName} onChange={e => setEditCatName(e.target.value)} autoFocus
                    className="flex-1 bg-noch-dark border border-noch-border rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-noch-green/50" />
                  <button onClick={() => saveCategoryName(cat.id)} className="text-xs text-noch-green px-2 py-1 hover:underline">Save</button>
                  <button onClick={() => { setEditingCat(null); setEditCatName('') }} className="text-xs text-noch-muted px-2 py-1 hover:text-white">Cancel</button>
                </>
              ) : confirmDelCat === cat.id ? (
                <>
                  <span className="text-sm text-red-400 flex-1">Delete "{cat.name}" permanently?</span>
                  <button onClick={() => deleteCategory(cat.id)} className="text-xs bg-red-500 text-white px-3 py-1 rounded-lg hover:bg-red-600">Delete</button>
                  <button onClick={() => setConfirmDelCat(null)} className="text-xs text-noch-muted px-2 py-1 hover:text-white">Cancel</button>
                </>
              ) : (
                <>
                  <span className="text-sm text-white flex-1">{cat.name}</span>
                  <button onClick={() => { setEditingCat(cat.id); setEditCatName(cat.name) }} className="text-xs text-noch-muted hover:text-white px-2 py-1">Rename</button>
                  <button onClick={() => setConfirmDelCat(cat.id)} className="text-xs text-red-400 hover:text-red-300 px-2 py-1">Remove</button>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2 items-center">
          <input type="text" placeholder="New category name…" value={newCat} onChange={e => setNewCat(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCategory()}
            className="flex-1 bg-noch-dark border border-noch-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-noch-green/50" />
          <button onClick={addCategory}
            className="bg-noch-green text-black px-3 py-2 rounded-lg text-sm font-semibold hover:bg-noch-green/90 flex items-center gap-1">
            <Plus size={15} /> Add
          </button>
        </div>
      </div>

      {/* Cost Centers */}
      <div className="bg-noch-card border border-noch-border rounded-xl p-4">
        <h3 className="text-white font-semibold mb-3">Cost Centers</h3>
        <div className="space-y-1 mb-4">
          {costCenters.length === 0 && <p className="text-xs text-noch-muted">No cost centers yet — add one below.</p>}
          {costCenters.map(cc => (
            <div key={cc.id} className="flex items-center gap-3 p-2 rounded-lg bg-noch-dark/40">
              <span className="text-xs font-mono text-noch-muted w-14">{cc.id}</span>
              {editingCc === cc.id ? (
                <>
                  <input type="text" value={editCcName} onChange={e => setEditCcName(e.target.value)} autoFocus
                    className="flex-1 bg-noch-dark border border-noch-border rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-noch-green/50" />
                  <button onClick={() => saveCcName(cc.id)} className="text-xs text-noch-green px-2 py-1 hover:underline">Save</button>
                  <button onClick={() => { setEditingCc(null); setEditCcName('') }} className="text-xs text-noch-muted px-2 py-1 hover:text-white">Cancel</button>
                </>
              ) : confirmDelCc === cc.id ? (
                <>
                  <span className="text-sm text-red-400 flex-1">Delete "{cc.name}" permanently?</span>
                  <button onClick={() => deleteCostCenter(cc.id)} className="text-xs bg-red-500 text-white px-3 py-1 rounded-lg hover:bg-red-600">Delete</button>
                  <button onClick={() => setConfirmDelCc(null)} className="text-xs text-noch-muted px-2 py-1 hover:text-white">Cancel</button>
                </>
              ) : (
                <>
                  <span className="text-sm text-white flex-1">{cc.name}</span>
                  <button onClick={() => { setEditingCc(cc.id); setEditCcName(cc.name) }} className="text-xs text-noch-muted hover:text-white px-2 py-1">Rename</button>
                  <button onClick={() => setConfirmDelCc(cc.id)} className="text-xs text-red-400 hover:text-red-300 px-2 py-1">Remove</button>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2 items-center">
          <input type="text" placeholder="Code (e.g. CC04)" value={newCcId} onChange={e => setNewCcId(e.target.value)}
            className="w-28 bg-noch-dark border border-noch-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-noch-green/50 font-mono" />
          <input type="text" placeholder="Name" value={newCcName} onChange={e => setNewCcName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCostCenter()}
            className="flex-1 bg-noch-dark border border-noch-border rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-noch-green/50" />
          <button onClick={addCostCenter}
            className="bg-noch-green text-black px-3 py-2 rounded-lg text-sm font-semibold hover:bg-noch-green/90 flex items-center gap-1">
            <Plus size={15} /> Add
          </button>
        </div>
      </div>

      {/* Exchange Rates */}
      <div className="bg-noch-card border border-noch-border rounded-xl p-4">
        <h3 className="text-white font-semibold mb-3">Exchange Rates to LYD</h3>
        <p className="text-xs text-noch-muted mb-3">These rates are local to this module — update them independently.</p>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {rates.map(r => (
            <div key={r.currency} className="flex items-center gap-2">
              <span className="text-xs text-noch-muted w-10">{r.currency}</span>
              <input
                type="number" min="0" step="0.001"
                value={editRate[r.currency] ?? r.rate_to_lyd}
                onChange={e => setEditRate(prev => ({ ...prev, [r.currency]: e.target.value }))}
                disabled={r.currency === 'LYD'}
                className="flex-1 bg-noch-dark border border-noch-border rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-noch-green/50 disabled:opacity-40"
              />
            </div>
          ))}
        </div>
        <button onClick={saveRates} disabled={saving}
          className="bg-noch-green text-black px-4 py-2 rounded-lg text-xs font-semibold hover:bg-noch-green/90 flex items-center gap-1 disabled:opacity-50">
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={13} />} Save Rates
        </button>
      </div>
    </div>
  )
}

// ── ERROR BOUNDARY ───────────────────────────────────────────
class ExpensesErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) {
    console.error('Expenses crashed:', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <Layout>
          <div className="max-w-2xl mx-auto bg-red-500/10 border border-red-500/40 rounded-xl p-6 mt-6">
            <h2 className="text-xl font-bold text-red-300 flex items-center gap-2 mb-3">
              <AlertCircle size={20}/> Expenses module crashed
            </h2>
            <p className="text-sm text-noch-muted mb-3">
              Something broke while loading. Tell HAK or the on-call dev — paste the message below.
            </p>
            <pre className="text-xs bg-black/40 border border-noch-border rounded-lg p-3 overflow-auto whitespace-pre-wrap text-red-200">
              {String(this.state.error?.message || this.state.error)}
              {this.state.error?.stack ? '\n\n' + this.state.error.stack.split('\n').slice(0,4).join('\n') : ''}
            </pre>
            <button onClick={()=>this.setState({error:null})}
              className="mt-4 px-4 py-2 bg-noch-green text-black rounded-lg text-sm font-semibold">
              Retry
            </button>
          </div>
        </Layout>
      );
    }
    return this.props.children;
  }
}

// ── MAIN PAGE ────────────────────────────────────────────────
function ExpensesPageInner() {
  const { user, profile, isOwner } = useAuth()
  const { hasAccess } = usePermissions()
  const [activeTab, setActiveTab] = useState('submit')
  const [costCenters, setCostCenters] = useState([])
  const [categories, setCategories] = useState([])
  const [rates, setRates] = useState([])
  const [refreshKey, setRefreshKey] = useState(0)
  const [pendingCount, setPendingCount] = useState(0)

  const canApprove = isOwner || hasAccess('expenses_approve')

  useEffect(() => { loadMeta() }, [])
  useEffect(() => { if (canApprove) loadPendingCount() }, [refreshKey, canApprove])

  async function loadMeta() {
    const [ccs, cats, rs] = await Promise.all([loadCostCenters(), loadCategories(), loadRates()])
    setCostCenters(ccs)
    setCategories(cats)
    setRates(rs)
  }

  async function loadPendingCount() {
    const { count } = await supabase.from('expenses').select('id', { count: 'exact', head: true }).eq('status', 'pending')
    setPendingCount(count || 0)
  }

  function refresh() { setRefreshKey(k => k + 1) }

  const tabs = [
    { id: 'submit',    label: 'Submit',      show: true },
    { id: 'mine',      label: 'My Expenses', show: true },
    { id: 'approve',   label: pendingCount > 0 ? `Approve (${pendingCount})` : 'Approve', show: canApprove },
    { id: 'dashboard', label: 'Dashboard',   show: canApprove },
    { id: 'settings',  label: 'Settings',    show: isOwner },
  ].filter(t => t.show)

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Receipt size={22} className="text-noch-green" /> Expenses
          </h1>
          <p className="text-noch-muted text-sm mt-1">Log, approve, and track costs by cost center</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-noch-card border border-noch-border rounded-xl p-1 flex-wrap">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex-1 min-w-fit px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap
                ${activeTab === tab.id ? 'bg-noch-green text-black' : 'text-noch-muted hover:text-white'}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'submit' && (
          <SubmitTab
            user={user} profile={profile} isOwner={isOwner}
            costCenters={costCenters} categories={categories} rates={rates}
            onSubmitted={refresh}
          />
        )}
        {activeTab === 'mine' && (
          <MyExpensesTab userId={user?.id} refreshKey={refreshKey} />
        )}
        {activeTab === 'approve' && canApprove && (
          <ApproveTab
            actorId={user?.id} isOwner={isOwner} refreshKey={refreshKey} onAction={refresh}
            costCenters={costCenters} categories={categories} rates={rates}
          />
        )}
        {activeTab === 'dashboard' && canApprove && (
          <DashboardTab refreshKey={refreshKey} />
        )}
        {activeTab === 'settings' && isOwner && (
          <SettingsTab onMetaChanged={loadMeta} />
        )}
      </div>
    </Layout>
  )
}

export default function ExpensesPage() {
  return (
    <ExpensesErrorBoundary>
      <ExpensesPageInner />
    </ExpensesErrorBoundary>
  );
}
