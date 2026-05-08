// VarianceTab — actual vs budgeted by category, monthly.

import { useEffect, useMemo, useState } from 'react'
import { Target, Plus, Save, X } from 'lucide-react'
import { getVariance, listBudgets, upsertBudget, listBranches } from '../lib/finance-supabase'
import { lyd } from '../lib/thresholds'
import toast from 'react-hot-toast'

const CATS = ['rent','utilities','marketing','supplies','maintenance','wages_one_off','professional_fees','licenses','bank_fees','other_opex','capex']

function firstOfMonth(d = new Date()) { return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10) }

export default function VarianceTab() {
  const [branches, setBranches] = useState([])
  const [branchId, setBranchId] = useState(null)
  const [periodMonth, setPeriodMonth] = useState(firstOfMonth())
  const [rows, setRows] = useState([])
  const [budgets, setBudgets] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)

  useEffect(() => { listBranches().then(setBranches).catch(() => {}) }, [])

  const reload = async () => {
    setLoading(true)
    try {
      const [v, b] = await Promise.all([
        getVariance({ branchId, periodMonth }),
        listBudgets({ periodMonth, branchId }),
      ])
      setRows(v); setBudgets(b)
    } catch (err) { toast.error(err.message || 'Failed') }
    finally { setLoading(false) }
  }
  useEffect(() => { reload() /* eslint-disable-next-line */ }, [branchId, periodMonth])

  const totalBudget = useMemo(() => rows.reduce((s, r) => s + Number(r.budgeted || 0), 0), [rows])
  const totalActual = useMemo(() => rows.reduce((s, r) => s + Number(r.actual || 0), 0), [rows])
  const totalVar    = totalActual - totalBudget

  const upsert = async (category, amount) => {
    try {
      await upsertBudget({
        branch_id: branchId,
        period_month: periodMonth,
        category,
        budgeted_amount_lyd: Number(amount),
      })
      toast.success('Saved'); setEditing(null); reload()
    } catch (err) { toast.error(err.message || 'Save failed') }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3 items-center">
        <Target size={14} className="text-noch-green"/>
        <select value={branchId || ''} onChange={e => setBranchId(e.target.value || null)} className="input py-1 px-2 text-xs">
          <option value="">All branches</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <input type="month" value={periodMonth.slice(0, 7)} onChange={e => setPeriodMonth(`${e.target.value}-01`)} className="input py-1 px-2 text-xs" />
        <span className="text-noch-muted text-xs ml-auto">
          Budget {lyd(totalBudget)} · Actual {lyd(totalActual)} ·
          <span className={totalVar > 0 ? 'text-red-400' : 'text-noch-green'}> {totalVar > 0 ? '+' : ''}{lyd(totalVar)}</span>
        </span>
      </div>

      {loading ? <p className="text-noch-muted text-center py-12">Loading…</p> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-noch-muted">
              <tr>
                <th className="text-left py-1 pr-2">Category</th>
                <th className="text-right py-1 pr-2">Budget</th>
                <th className="text-right py-1 pr-2">Actual</th>
                <th className="text-right py-1 pr-2">Variance</th>
                <th className="text-right py-1 pr-2">Var %</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {[...new Set([...rows.map(r => r.category), ...CATS])].map(cat => {
                const r = rows.find(x => x.category === cat)
                const b = budgets.find(x => x.category === cat)
                const isEditing = editing === cat
                const variance = (r?.actual || 0) - (b?.budgeted_amount_lyd || r?.budgeted || 0)
                return (
                  <tr key={cat} className="border-t border-noch-border/40">
                    <td className="py-1.5 pr-2 text-white capitalize">{cat.replace(/_/g, ' ')}</td>
                    <td className="py-1.5 pr-2 text-right">
                      {isEditing ? (
                        <BudgetEdit defaultVal={b?.budgeted_amount_lyd || 0} onSave={v => upsert(cat, v)} onCancel={() => setEditing(null)} />
                      ) : (
                        <button onClick={() => setEditing(cat)} className="text-noch-green underline">{lyd(b?.budgeted_amount_lyd || 0)}</button>
                      )}
                    </td>
                    <td className="py-1.5 pr-2 text-right text-white font-mono">{lyd(r?.actual || 0)}</td>
                    <td className={`py-1.5 pr-2 text-right font-mono ${variance > 0 ? 'text-red-400' : variance < 0 ? 'text-noch-green' : 'text-noch-muted'}`}>
                      {variance > 0 ? '+' : ''}{Number(variance).toFixed(2)}
                    </td>
                    <td className={`py-1.5 pr-2 text-right ${variance > 0 ? 'text-red-400' : 'text-noch-muted'}`}>
                      {(b?.budgeted_amount_lyd || 0) > 0 ? `${(variance / Number(b.budgeted_amount_lyd) * 100).toFixed(0)}%` : '—'}
                    </td>
                    <td></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function BudgetEdit({ defaultVal, onSave, onCancel }) {
  const [v, setV] = useState(defaultVal)
  return (
    <span className="inline-flex items-center gap-1">
      <input type="number" step="0.01" value={v} onChange={e => setV(e.target.value)} className="input py-0.5 px-1 text-xs w-24 text-right"/>
      <button onClick={() => onSave(v)} className="text-noch-green"><Save size={11}/></button>
      <button onClick={onCancel} className="text-noch-muted"><X size={11}/></button>
    </span>
  )
}
