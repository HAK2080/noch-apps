// FinancialTab.jsx — P&L statement with live Supabase data

import { useState, useEffect } from 'react'
import { DollarSign, Download, Loader2, Plus, Trash2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

const PERIODS = [
  { id: 'month', label: 'Monthly', months: 1 },
  { id: 'quarter', label: 'Quarterly', months: 3 },
  { id: 'annual', label: 'Annual', months: 12 },
]

function PLRow({ label, value, bold, indent, color, borderTop }) {
  return (
    <div className={`flex items-center justify-between py-2 px-1 text-sm ${borderTop ? 'border-t border-noch-border mt-1 pt-3' : ''}`}>
      <span className={`${indent ? 'pl-5 text-noch-muted' : bold ? 'text-white font-semibold' : 'text-noch-muted'}`}>{label}</span>
      <span className={`font-${bold ? 'bold' : 'medium'} tabular-nums ${color || (bold ? 'text-white' : 'text-noch-muted')}`}>
        {typeof value === 'number' ? value.toLocaleString('en', { maximumFractionDigits: 0 }) + ' LYD' : value}
      </span>
    </div>
  )
}

const COST_TYPES = ['Rent', 'Utilities', 'Labor/Salaries', 'Vendor Bill', 'Supplies', 'Marketing', 'Maintenance', 'Other']

function AddExpenseModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ cost_type: 'Rent', amount: '', period_start: new Date().toISOString().slice(0, 10), period_end: new Date().toISOString().slice(0, 10), notes: '' })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function save() {
    if (!form.amount || isNaN(parseFloat(form.amount))) { toast.error('Enter a valid amount'); return }
    setSaving(true)
    const { error } = await supabase.from('operating_costs').insert({
      cost_type: form.cost_type,
      amount: parseFloat(form.amount),
      period_start: form.period_start,
      period_end: form.period_end || form.period_start,
      notes: form.notes || null,
      source: 'internal',
    })
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success('Expense added')
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-noch-card border border-noch-border rounded-2xl p-6 max-w-sm w-full space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-semibold">Add Expense</h3>
          <button onClick={onClose} className="text-noch-muted hover:text-white"><X size={16} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-noch-muted text-xs mb-1 block">Type</label>
            <select value={form.cost_type} onChange={e => set('cost_type', e.target.value)}
              className="w-full bg-noch-dark border border-noch-border rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-noch-green/50">
              {COST_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-noch-muted text-xs mb-1 block">Amount (LYD)</label>
            <input type="number" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0.000"
              className="w-full bg-noch-dark border border-noch-border rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-noch-green/50" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-noch-muted text-xs mb-1 block">From</label>
              <input type="date" value={form.period_start} onChange={e => set('period_start', e.target.value)}
                className="w-full bg-noch-dark border border-noch-border rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-noch-green/50" />
            </div>
            <div>
              <label className="text-noch-muted text-xs mb-1 block">To</label>
              <input type="date" value={form.period_end} onChange={e => set('period_end', e.target.value)}
                className="w-full bg-noch-dark border border-noch-border rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-noch-green/50" />
            </div>
          </div>
          <div>
            <label className="text-noch-muted text-xs mb-1 block">Notes (optional)</label>
            <input value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="e.g. April rent - Hay Andalous"
              className="w-full bg-noch-dark border border-noch-border rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-noch-green/50" />
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={save} disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 bg-noch-green/20 border border-noch-green/30 text-noch-green hover:bg-noch-green/30 rounded-xl py-2.5 text-sm font-medium transition-colors">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Save
          </button>
          <button onClick={onClose} className="flex-1 btn-secondary text-sm py-2.5">Cancel</button>
        </div>
      </div>
    </div>
  )
}

export default function FinancialTab() {
  const [period, setPeriod] = useState('month')
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [showAddExpense, setShowAddExpense] = useState(false)
  const [expenses, setExpenses] = useState([])
  const [expensesLoading, setExpensesLoading] = useState(false)

  useEffect(() => { loadData(); loadExpenses() }, [period])

  async function loadData() {
    setLoading(true)
    try {
      const months = PERIODS.find(p => p.id === period)?.months || 1
      const since = new Date(Date.now() - months * 30 * 86400000).toISOString()

      const [
        { data: orders },
        { data: orderItems },
        { data: costs },
        { data: staffSalaries },
      ] = await Promise.all([
        supabase.from('pos_orders').select('total').eq('status', 'completed').gte('created_at', since),
        supabase.from('pos_order_items').select('total_price, cost, pos_orders!inner(created_at, status)')
          .eq('pos_orders.status', 'completed').gte('pos_orders.created_at', since),
        supabase.from('operating_costs').select('cost_type, amount').gte('period_start', since.slice(0, 10)),
        supabase.from('profiles').select('monthly_salary').not('monthly_salary', 'is', null),
      ])

      // Revenue
      const revenue = (orders || []).reduce((s, o) => s + (parseFloat(o.total) || 0), 0)

      // COGS — sum of item costs if recorded, else estimate 35% of revenue
      const cogsFromItems = (orderItems || []).reduce((s, i) => s + (parseFloat(i.cost) || 0), 0)
      const cogs = cogsFromItems > 0 ? cogsFromItems : revenue * 0.35

      const grossProfit = revenue - cogs
      const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0

      // Operating costs grouped
      const opCostMap = {}
      for (const c of costs || []) {
        const key = c.cost_type || 'Other'
        opCostMap[key] = (opCostMap[key] || 0) + (parseFloat(c.amount) || 0)
      }

      // Labor: sum of monthly_salary prorated for period
      const monthlyLaborTotal = (staffSalaries || []).reduce((s, p) => s + (parseFloat(p.monthly_salary) || 0), 0)
      const laborCost = monthlyLaborTotal * months
      if (laborCost > 0) {
        opCostMap['Labor'] = (opCostMap['Labor'] || 0) + laborCost
      }

      const totalOpex = Object.values(opCostMap).reduce((s, v) => s + v, 0)
      const ebitda = grossProfit - totalOpex

      setData({ revenue, cogs, cogsFromItems, grossProfit, grossMargin, opCostMap, totalOpex, ebitda, months })
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function loadExpenses() {
    setExpensesLoading(true)
    const months = PERIODS.find(p => p.id === period)?.months || 1
    const since = new Date(Date.now() - months * 30 * 86400000).toISOString().slice(0, 10)
    const { data } = await supabase.from('operating_costs')
      .select('id,cost_type,amount,period_start,notes,source')
      .gte('period_start', since)
      .eq('source', 'internal')
      .order('period_start', { ascending: false })
    setExpenses(data || [])
    setExpensesLoading(false)
  }

  async function deleteExpense(id) {
    const { error } = await supabase.from('operating_costs').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    setExpenses(prev => prev.filter(e => e.id !== id))
    toast.success('Expense removed')
    loadData()
  }

  function exportCSV() {
    if (!data) return
    const rows = [
      ['Metric', 'Value (LYD)'],
      ['Revenue', data.revenue.toFixed(2)],
      ['COGS', data.cogs.toFixed(2)],
      ['Gross Profit', data.grossProfit.toFixed(2)],
      ['Gross Margin %', data.grossMargin.toFixed(1) + '%'],
      ...Object.entries(data.opCostMap).map(([k, v]) => [k, v.toFixed(2)]),
      ['Total OPEX', data.totalOpex.toFixed(2)],
      ['EBITDA', data.ebitda.toFixed(2)],
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `noch-pl-${period}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 bg-noch-dark border border-noch-border rounded-lg p-1">
          {PERIODS.map(p => (
            <button key={p.id} onClick={() => setPeriod(p.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${period === p.id ? 'bg-noch-green text-noch-dark' : 'text-noch-muted hover:text-white'}`}>
              {p.label}
            </button>
          ))}
        </div>
        <button onClick={exportCSV} disabled={!data} className="btn-secondary flex items-center gap-2 text-sm">
          <Download size={14} /> Export CSV
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 gap-3 text-noch-muted">
          <Loader2 className="animate-spin" size={20} /> Loading...
        </div>
      ) : !data ? (
        <div className="bg-noch-card border border-noch-border rounded-xl p-16 text-center">
          <DollarSign size={40} className="mx-auto text-noch-muted mb-3 opacity-50" />
          <p className="text-noch-muted text-sm">No financial data found for this period.</p>
        </div>
      ) : (
        <div className="bg-noch-card border border-noch-border rounded-xl p-6 space-y-1 max-w-xl">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign size={16} className="text-noch-green" />
            <h3 className="text-white font-semibold text-sm">
              Profit &amp; Loss — {PERIODS.find(p => p.id === period)?.label}
            </h3>
            {data.cogsFromItems === 0 && (
              <span className="ml-auto text-[10px] text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-full">
                COGS estimated at 35%
              </span>
            )}
          </div>

          {/* Revenue */}
          <PLRow label="Revenue" value={data.revenue} bold color="text-noch-green" />

          {/* COGS */}
          <PLRow label="Cost of Goods Sold (COGS)" value={-data.cogs} indent color="text-red-400" />

          {/* Gross Profit */}
          <PLRow label="Gross Profit" value={data.grossProfit} bold borderTop
            color={data.grossProfit >= 0 ? 'text-emerald-400' : 'text-red-400'} />
          <PLRow label={`Gross Margin`} value={data.grossMargin.toFixed(1) + '%'} indent
            color={data.grossMargin >= 50 ? 'text-emerald-400' : data.grossMargin >= 30 ? 'text-yellow-400' : 'text-red-400'} />

          {/* OPEX */}
          {Object.keys(data.opCostMap).length > 0 && (
            <>
              <div className="pt-3 pb-1 border-t border-noch-border">
                <span className="text-noch-muted text-xs font-medium uppercase tracking-wider">Operating Expenses</span>
              </div>
              {Object.entries(data.opCostMap).map(([key, val]) => (
                <PLRow key={key} label={key} value={-val} indent color="text-red-400" />
              ))}
              <PLRow label="Total OPEX" value={-data.totalOpex} bold borderTop color="text-red-400" />
            </>
          )}

          {/* EBITDA */}
          <PLRow
            label="EBITDA"
            value={data.ebitda}
            bold
            borderTop
            color={data.ebitda >= 0 ? 'text-noch-green' : 'text-red-400'}
          />

          {data.totalOpex === 0 && (
            <p className="text-noch-muted text-xs mt-3 pt-3 border-t border-noch-border">
              No operating costs yet. Add expenses below to see full P&L.
            </p>
          )}
        </div>
      )}

      {/* Expense Ledger */}
      <div className="bg-noch-card border border-noch-border rounded-xl overflow-hidden max-w-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-noch-border">
          <h3 className="text-white font-semibold text-sm flex items-center gap-2">
            <DollarSign size={14} className="text-noch-muted" /> Operating Expenses
          </h3>
          <button
            onClick={() => setShowAddExpense(true)}
            className="flex items-center gap-1.5 text-xs bg-noch-green/10 border border-noch-green/30 text-noch-green hover:bg-noch-green/20 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus size={12} /> Add Expense
          </button>
        </div>

        {expensesLoading ? (
          <div className="flex items-center justify-center py-8 gap-2 text-noch-muted text-xs">
            <Loader2 size={14} className="animate-spin" /> Loading...
          </div>
        ) : expenses.length === 0 ? (
          <div className="px-5 py-8 text-center text-noch-muted text-xs">
            No expenses recorded for this period.
          </div>
        ) : (
          <div className="divide-y divide-noch-border/40">
            {expenses.map(e => (
              <div key={e.id} className="flex items-center justify-between px-5 py-3 hover:bg-noch-dark/40 transition-colors">
                <div>
                  <p className="text-white text-xs font-medium">{e.cost_type}</p>
                  <p className="text-noch-muted text-[11px]">{e.period_start}{e.notes ? ` · ${e.notes}` : ''}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-red-400 text-sm font-semibold tabular-nums">{parseFloat(e.amount).toFixed(3)} LYD</span>
                  <button onClick={() => deleteExpense(e.id)} className="text-noch-muted/40 hover:text-red-400 transition-colors p-1">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAddExpense && (
        <AddExpenseModal onClose={() => setShowAddExpense(false)} onSaved={() => { loadData(); loadExpenses() }} />
      )}
    </div>
  )
}
