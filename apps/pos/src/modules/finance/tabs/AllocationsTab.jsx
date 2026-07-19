import { useEffect, useMemo, useState } from 'react'
import { Building2, Check, Loader2, Network, PieChart } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  calculateAllocationPreview,
  getSharedCostAllocationSetup,
  saveSharedCostAllocationPolicy,
} from '../lib/allocations'
import { lyd } from '../lib/thresholds'

const METHODS = [
  { value: 'revenue', label: 'Monthly revenue share', note: 'Recommended — busier branches carry more of the shared cost.' },
  { value: 'equal', label: 'Equal split', note: 'Every selected branch receives the same percentage.' },
  { value: 'fixed', label: 'Fixed percentages', note: 'Set the exact percentage each branch should carry.' },
]

function currentMonth() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function methodLabel(method) {
  return METHODS.find(option => option.value === method)?.label || method
}

export default function AllocationsTab() {
  const [month, setMonth] = useState(currentMonth)
  const [method, setMethod] = useState('revenue')
  const [branches, setBranches] = useState([])
  const [history, setHistory] = useState([])
  const [costCenter, setCostCenter] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const effectiveFrom = `${month}-01`

  const load = async () => {
    setLoading(true)
    try {
      const setup = await getSharedCostAllocationSetup({ asOfDate: effectiveFrom })
      setCostCenter(setup.costCenter)
      setMethod(setup.policy?.method || 'revenue')
      setBranches(setup.branches)
      setHistory(setup.history)
    } catch (err) {
      toast.error(err.message || 'Failed to load allocation setup')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [month]) // eslint-disable-line react-hooks/exhaustive-deps

  const preview = useMemo(() => calculateAllocationPreview(branches, method), [branches, method])
  const selectedCount = branches.filter(branch => branch.selected).length
  const fixedTotal = branches
    .filter(branch => branch.selected)
    .reduce((sum, branch) => sum + Number(branch.weightPct || 0), 0)
  const canSave = selectedCount > 0 && (method !== 'fixed' || Math.abs(fixedTotal - 100) <= 0.01)

  const setBranch = (id, updates) => {
    setBranches(current => current.map(branch => branch.id === id ? { ...branch, ...updates } : branch))
  }

  const changeMethod = (nextMethod) => {
    setMethod(nextMethod)
    if (nextMethod === 'fixed') {
      const count = Math.max(1, branches.filter(branch => branch.selected).length)
      setBranches(current => current.map(branch => ({
        ...branch,
        weightPct: branch.selected ? Number((100 / count).toFixed(2)) : 0,
      })))
    }
  }

  const save = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      await saveSharedCostAllocationPolicy({ method, effectiveFrom, branches })
      toast.success('Shared Services allocation saved')
      await load()
    } catch (err) {
      toast.error(err.message || 'Failed to save allocation')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="py-16 text-center text-noch-muted"><Loader2 className="animate-spin inline mr-2" size={18} />Loading allocations…</div>
  }

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="bg-noch-card border border-noch-border rounded-xl p-5">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-white font-semibold">
              <Network size={18} className="text-noch-green" /> {costCenter?.name || 'Shared Services'}
            </div>
            <p className="text-xs text-noch-muted mt-1 max-w-2xl">
              Owner, management, software, finance, HR, and other cross-branch costs are assigned here and distributed to branch P&Ls by the rule below.
            </p>
          </div>
          <label className="text-xs text-noch-muted">
            Effective month
            <input type="month" value={month} onChange={event => setMonth(event.target.value)} className="input mt-1 py-2" />
          </label>
        </div>
      </div>

      <div className="bg-noch-card border border-noch-border rounded-xl p-5">
        <h3 className="text-white font-semibold mb-3">Allocation method</h3>
        <div className="grid md:grid-cols-3 gap-3">
          {METHODS.map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => changeMethod(option.value)}
              className={`text-left rounded-xl border p-3 transition-colors ${method === option.value ? 'border-noch-green/60 bg-noch-green/10' : 'border-noch-border bg-noch-dark/40 hover:border-noch-green/30'}`}
            >
              <p className={method === option.value ? 'text-noch-green text-sm font-semibold' : 'text-white text-sm font-semibold'}>{option.label}</p>
              <p className="text-noch-muted text-xs mt-1">{option.note}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-noch-card border border-noch-border rounded-xl p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="text-white font-semibold">Target branches</h3>
            <p className="text-xs text-noch-muted mt-0.5">Revenue shown is for {month}. A zero-revenue branch receives 0% under revenue share.</p>
          </div>
          {method === 'fixed' && (
            <span className={Math.abs(fixedTotal - 100) <= 0.01 ? 'text-noch-green text-xs' : 'text-red-400 text-xs'}>Total {fixedTotal.toFixed(2)}%</span>
          )}
        </div>

        <div className="divide-y divide-noch-border">
          {preview.map(branch => (
            <div key={branch.id} className="grid grid-cols-[auto_1fr_auto] md:grid-cols-[auto_1fr_160px_120px] items-center gap-3 py-3">
              <input type="checkbox" checked={branch.selected} onChange={event => setBranch(branch.id, { selected: event.target.checked })} className="w-4 h-4 accent-noch-green" />
              <div className="min-w-0">
                <p className="text-white text-sm font-medium truncate flex items-center gap-1.5"><Building2 size={13} className="text-noch-muted" /> {branch.name}</p>
                <p className="text-noch-muted text-xs mt-0.5 md:hidden">Revenue {lyd(branch.revenueLyd)}</p>
              </div>
              <p className="hidden md:block text-noch-muted text-xs text-right">{lyd(branch.revenueLyd)} revenue</p>
              {method === 'fixed' ? (
                <div className="flex items-center gap-1">
                  <input
                    type="number" min="0" max="100" step="0.01" disabled={!branch.selected}
                    value={branch.weightPct}
                    onChange={event => setBranch(branch.id, { weightPct: event.target.value })}
                    className="input py-1.5 text-right text-xs disabled:opacity-40"
                  />
                  <span className="text-noch-muted text-xs">%</span>
                </div>
              ) : (
                <p className="text-noch-green text-sm font-semibold text-right">{branch.sharePct.toFixed(2)}%</p>
              )}
            </div>
          ))}
        </div>

        <div className="flex justify-end mt-4">
          <button type="button" onClick={save} disabled={!canSave || saving} className="btn-primary flex items-center gap-2 disabled:opacity-40">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save allocation rule
          </button>
        </div>
      </div>

      <div className="bg-noch-card border border-noch-border rounded-xl p-5">
        <h3 className="text-white font-semibold flex items-center gap-2 mb-3"><PieChart size={16} className="text-noch-muted" /> Rule history</h3>
        <div className="space-y-2">
          {history.map(policy => (
            <div key={policy.id} className="flex items-center justify-between gap-3 rounded-lg bg-noch-dark/40 px-3 py-2 text-xs">
              <span className="text-white">{methodLabel(policy.method)}</span>
              <span className="text-noch-muted">From {policy.effective_from}{policy.effective_to ? ` to ${policy.effective_to}` : ' onward'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
