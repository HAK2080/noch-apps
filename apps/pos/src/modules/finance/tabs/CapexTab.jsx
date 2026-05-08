// CapexTab — capital purchases register with payback projection.

import { useEffect, useMemo, useState } from 'react'
import { Wrench, Plus, X } from 'lucide-react'
import { listCapex, createCapex, updateCapex, listBranches } from '../lib/finance-supabase'
import { lyd } from '../lib/thresholds'
import toast from 'react-hot-toast'

export default function CapexTab() {
  const [list, setList] = useState([])
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState(null)

  const reload = async () => {
    setLoading(true)
    try {
      const [c, b] = await Promise.all([listCapex(), listBranches()])
      setList(c); setBranches(b)
    } catch (err) { toast.error(err.message || 'Failed') }
    finally { setLoading(false) }
  }
  useEffect(() => { reload() }, [])

  const totals = useMemo(() => ({
    cost: list.reduce((s, x) => s + Number(x.cost_lyd || 0), 0),
    monthly: list.reduce((s, x) => s + Number(x.expected_monthly_contribution_lyd || 0), 0),
  }), [list])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Wrench size={14} className="text-noch-green"/>
          <h3 className="text-white text-sm font-semibold">CapEx register</h3>
          <span className="text-noch-muted text-xs">{list.length} assets · {lyd(totals.cost)} total · {lyd(totals.monthly)}/month expected contribution</span>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary text-xs px-3 py-1 flex items-center gap-1"><Plus size={11}/> Add asset</button>
      </div>

      {loading ? <p className="text-noch-muted text-center py-12">Loading…</p> : list.length === 0 ? (
        <div className="card text-center py-10 text-noch-muted text-sm">No CapEx assets yet.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-noch-muted">
              <tr>
                <th className="text-left py-1 pr-2">Asset</th>
                <th className="text-left py-1 pr-2">Acquired</th>
                <th className="text-right py-1 pr-2">Cost</th>
                <th className="text-right py-1 pr-2">Life (mo)</th>
                <th className="text-right py-1 pr-2">Monthly contrib</th>
                <th className="text-right py-1 pr-2">Payback</th>
                <th className="text-right py-1 pr-2">Branch</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map(c => {
                const cost = Number(c.cost_lyd || 0)
                const m = Number(c.expected_monthly_contribution_lyd || 0)
                const payback = m > 0 ? cost / m : null
                const branchName = branches.find(b => b.id === c.branch_id)?.name || '—'
                return (
                  <tr key={c.id} className="border-t border-noch-border/40">
                    <td className="py-1.5 pr-2 text-white">{c.name}</td>
                    <td className="py-1.5 pr-2 text-noch-muted">{c.acquired_at}</td>
                    <td className="py-1.5 pr-2 text-right text-white font-mono">{lyd(cost)}</td>
                    <td className="py-1.5 pr-2 text-right text-noch-muted">{c.expected_life_months || '—'}</td>
                    <td className="py-1.5 pr-2 text-right text-noch-green font-mono">{lyd(m)}</td>
                    <td className="py-1.5 pr-2 text-right text-white">
                      {payback ? `${payback.toFixed(1)} mo` : <span className="text-noch-muted">no contrib</span>}
                    </td>
                    <td className="py-1.5 pr-2 text-right text-noch-muted">{branchName}</td>
                    <td className="py-1.5 text-right">
                      <button onClick={() => setEditing(c)} className="text-noch-muted hover:text-white">edit</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {(showAdd || editing) && (
        <CapexFormModal
          branches={branches} initial={editing}
          onClose={() => { setShowAdd(false); setEditing(null) }}
          onSave={async (form) => {
            try {
              if (editing) await updateCapex(editing.id, form)
              else         await createCapex(form)
              toast.success('Saved'); setShowAdd(false); setEditing(null); reload()
            } catch (err) { toast.error(err.message || 'Save failed') }
          }}
        />
      )}
    </div>
  )
}

function CapexFormModal({ branches, initial, onClose, onSave }) {
  const [f, setF] = useState({
    name: initial?.name || '',
    vendor: initial?.vendor || '',
    acquired_at: initial?.acquired_at || new Date().toISOString().slice(0, 10),
    cost_lyd: initial?.cost_lyd ?? '',
    expected_life_months: initial?.expected_life_months ?? 60,
    expected_monthly_contribution_lyd: initial?.expected_monthly_contribution_lyd ?? '',
    branch_id: initial?.branch_id || '',
    notes: initial?.notes || '',
  })
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))
  const submit = () => {
    if (!f.name || !f.cost_lyd) return toast.error('Name and cost required')
    onSave({
      name: f.name, vendor: f.vendor || null,
      acquired_at: f.acquired_at,
      cost_lyd: Number(f.cost_lyd),
      expected_life_months: Number(f.expected_life_months) || null,
      expected_monthly_contribution_lyd: Number(f.expected_monthly_contribution_lyd) || 0,
      branch_id: f.branch_id || null,
      notes: f.notes || null,
    })
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-noch-card border border-noch-border rounded-2xl w-full max-w-md p-5">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-white font-bold">{initial ? 'Edit asset' : 'Add CapEx asset'}</h2>
          <button onClick={onClose}><X className="text-noch-muted" size={16}/></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="label block mb-1">Name</label>
            <input className="input w-full" value={f.name} onChange={e => set('name', e.target.value)} placeholder="e.g. La Marzocco" />
          </div>
          <div><label className="label block mb-1">Vendor</label>
            <input className="input w-full" value={f.vendor} onChange={e => set('vendor', e.target.value)} /></div>
          <div><label className="label block mb-1">Acquired</label>
            <input type="date" className="input w-full" value={f.acquired_at} onChange={e => set('acquired_at', e.target.value)} /></div>
          <div><label className="label block mb-1">Cost (LYD)</label>
            <input type="number" step="0.01" className="input w-full" value={f.cost_lyd} onChange={e => set('cost_lyd', e.target.value)} /></div>
          <div><label className="label block mb-1">Expected life (months)</label>
            <input type="number" className="input w-full" value={f.expected_life_months} onChange={e => set('expected_life_months', e.target.value)} /></div>
          <div className="col-span-2">
            <label className="label block mb-1">Expected monthly contribution (LYD)</label>
            <input type="number" step="0.01" className="input w-full" value={f.expected_monthly_contribution_lyd} onChange={e => set('expected_monthly_contribution_lyd', e.target.value)}
              placeholder="Estimated extra net contribution this asset enables" />
          </div>
          <div className="col-span-2">
            <label className="label block mb-1">Branch</label>
            <select className="input w-full" value={f.branch_id} onChange={e => set('branch_id', e.target.value)}>
              <option value="">corporate</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="label block mb-1">Notes</label>
            <textarea rows={2} className="input w-full resize-none" value={f.notes} onChange={e => set('notes', e.target.value)} />
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
