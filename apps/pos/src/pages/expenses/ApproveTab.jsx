// ApproveTab.jsx — Expenses: owner/manager approval queue
import { useState, useEffect } from 'react'
import { Check, X, Loader2, Eye, CheckCircle2, Wallet } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { fmt, loadExpenses, deleteExpense } from './lib/expensesData'
import StatusBadge from './StatusBadge'
import PaymentDeclarationBadge from './PaymentDeclarationBadge'

export default function ApproveTab({ actorId, isOwner, refreshKey, onAction, costCenters, categories, rates }) {
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('pending')
  const [ccFilter, setCcFilter] = useState('all')
  const [catFilter, setCatFilter] = useState('all')
  const [noteModal, setNoteModal] = useState(null)
  const [note, setNote] = useState('')
  const [acting, setActing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [editModal, setEditModal] = useState(null) // expense object
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [selectedPaid, setSelectedPaid] = useState([])
  const [paymentAccount, setPaymentAccount] = useState('cash')
  const [payingBatch, setPayingBatch] = useState(false)

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
      const expense = expenses.find(item => item.id === expenseId)
      if (decision === 'approved') {
        const { error } = await supabase.rpc('approve_expense_with_reported_payment', {
          p_expense_id: expenseId,
          p_notes: notes || null,
        })
        if (error) throw error
        const autoPaid = expense?.payment_status_reported === 'paid'
        toast.success(autoPaid
          ? `Expense approved and marked paid by ${expense.payment_method_reported || 'cash'}`
          : 'Expense approved')
      } else {
        const { error: updateError } = await supabase
          .from('expenses')
          .update({ status: decision, updated_at: new Date().toISOString() })
          .eq('id', expenseId)
        if (updateError) throw updateError
        const { error: approvalError } = await supabase.from('expense_approvals').insert({
          expense_id: expenseId,
          acted_by: actorId,
          decision,
          notes: notes || null,
        })
        if (approvalError) throw approvalError
        toast.success(`Expense ${decision}`)
      }
      onAction()
      await load()
    } catch (err) { toast.error(err.message) }
    setActing(null)
  }

  async function markPaid(expenseIds) {
    setPayingBatch(true)
    try {
      const { error } = await supabase.rpc('mark_expenses_paid_batch', {
        p_expense_ids: expenseIds,
        p_payment_account_key: paymentAccount,
        p_paid_at: new Date().toLocaleDateString('en-CA'),
        p_reference: null,
        p_notes: expenseIds.length > 1 ? 'Batch settlement from Expenses' : null,
      })
      if (error) throw error
      toast.success(`${expenseIds.length} expense${expenseIds.length === 1 ? '' : 's'} marked paid from ${paymentAccount}`)
      setSelectedPaid([])
      onAction()
      await load()
    } catch (err) {
      toast.error(err.message || 'Could not mark expenses paid')
    } finally {
      setPayingBatch(false)
    }
  }

  const togglePaidSelection = (id) => {
    setSelectedPaid(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id])
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
      paid_by: exp.paid_by || 'Business',
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
        paid_by: editForm.paid_by || 'Business',
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

  // Client-side filters on top of the loaded rows (ids from the costCenters/categories props)
  const filtered = expenses.filter(e =>
    (ccFilter === 'all' || String(e.cost_center_id) === ccFilter) &&
    (catFilter === 'all' || String(e.category_id) === catFilter)
  )

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap items-center">
        {['pending', 'all'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors
              ${tab === t ? 'bg-noch-green text-black' : 'bg-noch-card border border-noch-border text-noch-muted hover:text-white'}`}>
            {t === 'pending' ? 'Needs Action' : 'All Expenses'}
          </button>
        ))}
        <select value={ccFilter} onChange={e => setCcFilter(e.target.value)} className="input py-1.5 text-xs">
          <option value="all">All cost centres</option>
          {costCenters.map(cc => <option key={cc.id} value={String(cc.id)}>{cc.id} — {cc.name}</option>)}
        </select>
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)} className="input py-1.5 text-xs">
          <option value="all">All categories</option>
          {categories.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
        </select>
        {(ccFilter !== 'all' || catFilter !== 'all') && (
          <button onClick={() => { setCcFilter('all'); setCatFilter('all') }}
            className="text-noch-muted text-xs hover:text-white">
            Clear filters
          </button>
        )}
      </div>

      {isOwner && tab === 'all' && filtered.some(exp => exp.status === 'approved' && !exp.paid_at) && (
        <div className="card !p-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="text-sm text-white flex-1">{selectedPaid.length} approved expense{selectedPaid.length === 1 ? '' : 's'} selected</p>
          <select value={paymentAccount} onChange={e => setPaymentAccount(e.target.value)} className="input py-2 text-sm">
            <option value="cash">Cash account</option>
            <option value="bank">Bank account</option>
          </select>
          <button
            onClick={() => markPaid(selectedPaid)}
            disabled={!selectedPaid.length || payingBatch}
            className="btn-primary flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {payingBatch ? <Loader2 size={14} className="animate-spin" /> : <Wallet size={14} />}
            Mark selected paid
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-noch-muted">
          <Loader2 size={20} className="animate-spin mr-2" /> Loading…
        </div>
      ) : expenses.length === 0 ? (
        <div className="text-center py-12 text-noch-muted">
          <CheckCircle2 size={32} className="mx-auto mb-2 text-noch-green opacity-50" />
          {tab === 'pending' ? 'No pending expenses — inbox zero 🎉' : 'No expenses yet'}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-noch-muted">
          No expenses match the selected filters
          <button onClick={() => { setCcFilter('all'); setCatFilter('all') }}
            className="block mx-auto mt-2 text-noch-green text-xs hover:underline">
            Clear filters
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(exp => (
            <div key={exp.id} className="bg-noch-card border border-noch-border rounded-xl p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {isOwner && tab === 'all' && exp.status === 'approved' && !exp.paid_at && (
                      <input
                        type="checkbox"
                        checked={selectedPaid.includes(exp.id)}
                        onChange={() => togglePaidSelection(exp.id)}
                        aria-label={`Select ${exp.vendor || exp.description || 'expense'} for payment`}
                      />
                    )}
                    <span className="text-white font-semibold">{fmt(exp.amount, exp.currency)}</span>
                    {exp.currency !== 'LYD' && <span className="text-noch-muted text-xs">≈ {fmt(exp.amount_lyd)}</span>}
                    <StatusBadge status={exp.status} />
                    <PaymentDeclarationBadge expense={exp} />
                  </div>
                  <p className="text-xs text-noch-muted mt-0.5">
                    By <span className="text-white">{exp.profiles?.full_name || 'Staff'}</span> · {exp.expense_date}
                  </p>
                  <p className="text-xs text-noch-muted mt-0.5">
                    {exp.cost_centers?.id} — {exp.cost_centers?.name} · {exp.expense_categories?.name}
                  </p>
                  {exp.paid_by && exp.paid_by !== 'Business' && <p className="text-xs text-yellow-400">💳 Paid by {exp.paid_by}</p>}
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

              {exp.status === 'pending' && isOwner && (
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
              {exp.status === 'approved' && !exp.paid_at && isOwner && (
                <button onClick={() => markPaid([exp.id])} disabled={payingBatch}
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
              <label className="text-xs text-noch-muted mb-1 block">Source of Payment</label>
              <select value={editForm.paid_by} onChange={e => setE('paid_by', e.target.value)}
                className="w-full bg-noch-dark border border-noch-border rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-noch-green/50">
                <option value="Business">Business</option>
                <option value="Haithem">Haithem</option>
                <option value="Ahmed">Ahmed</option>
                <option value="Other">Other</option>
              </select>
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
