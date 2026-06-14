import { useEffect, useMemo, useState } from 'react'
import { Wrench, Plus, X, Download, Upload } from 'lucide-react'
import { listCapex, createCapex, updateCapex, listBranches } from '../lib/finance-supabase'
import { lyd } from '../lib/thresholds'
import { downloadCsv } from '../../../lib/exportCsv'
import toast from 'react-hot-toast'

function monthsBetween(fromDate, toDate = new Date()) {
  if (!fromDate) return 0
  const from = new Date(fromDate)
  return Math.max(0, (toDate.getFullYear() - from.getFullYear()) * 12 + (toDate.getMonth() - from.getMonth()))
}

function depreciationFor(asset) {
  const cost = Number(asset.cost_lyd || 0)
  const salvage = Number(asset.salvage_value_lyd || 0)
  const life = Number(asset.expected_life_months || 0)
  const legacy = Number(asset.legacy_accumulated_depreciation_lyd || 0)
  const base = Math.max(0, cost - salvage)
  const monthly = life > 0 ? base / life : 0
  const elapsed = Math.min(life || 0, monthsBetween(asset.depreciation_start || asset.acquired_at))
  const accumulated = Math.min(base, legacy + monthly * elapsed)
  return {
    monthly,
    accumulated,
    bookValue: Math.max(salvage, cost - accumulated),
    remainingMonths: Math.max(0, (life || 0) - elapsed),
  }
}

function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]
    if (ch === '"' && quoted && next === '"') { cell += '"'; i++; continue }
    if (ch === '"') { quoted = !quoted; continue }
    if (ch === ',' && !quoted) { row.push(cell); cell = ''; continue }
    if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && next === '\n') i++
      row.push(cell)
      if (row.some(v => v.trim())) rows.push(row)
      row = []
      cell = ''
      continue
    }
    cell += ch
  }
  row.push(cell)
  if (row.some(v => v.trim())) rows.push(row)
  return rows
}

export default function CapexTab() {
  const [list, setList] = useState([])
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState(null)
  const [importing, setImporting] = useState(false)

  const reload = async () => {
    setLoading(true)
    try {
      const [c, b] = await Promise.all([listCapex(), listBranches()])
      setList(c)
      setBranches(b)
    } catch (err) {
      toast.error(err.message || 'Failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { reload() }, [])

  const totals = useMemo(() => ({
    cost: list.reduce((s, x) => s + Number(x.cost_lyd || 0), 0),
    book: list.reduce((s, x) => s + depreciationFor(x).bookValue, 0),
    depreciation: list.reduce((s, x) => s + depreciationFor(x).accumulated, 0),
  }), [list])

  const exportAssets = () => {
    downloadCsv('fixed_assets_register',
      [
        'asset_code', 'old_system_ref', 'name', 'category', 'serial_number', 'condition',
        'branch', 'vendor', 'acquired_at', 'cost_lyd', 'salvage_value_lyd',
        'expected_life_months', 'depreciation_start', 'monthly_depreciation_lyd',
        'accumulated_depreciation_lyd', 'book_value_lyd', 'remaining_months', 'notes',
      ],
      list.map(asset => {
        const dep = depreciationFor(asset)
        return [
          asset.asset_code || '',
          asset.old_system_ref || '',
          asset.name || '',
          asset.category || '',
          asset.serial_number || '',
          asset.condition || '',
          branches.find(b => b.id === asset.branch_id)?.name || '',
          asset.vendor || '',
          asset.acquired_at || '',
          Number(asset.cost_lyd || 0).toFixed(2),
          Number(asset.salvage_value_lyd || 0).toFixed(2),
          asset.expected_life_months || '',
          asset.depreciation_start || asset.acquired_at || '',
          dep.monthly.toFixed(2),
          dep.accumulated.toFixed(2),
          dep.bookValue.toFixed(2),
          dep.remainingMonths,
          asset.notes || '',
        ]
      }),
    )
  }

  const importAssets = async (file) => {
    if (!file) return
    setImporting(true)
    try {
      const rows = parseCsv(await file.text())
      const headers = rows.shift()?.map(h => h.trim()) || []
      const index = Object.fromEntries(headers.map((h, i) => [h, i]))
      let count = 0
      for (const row of rows) {
        const get = (key) => row[index[key]]?.trim()
        const name = get('name')
        const cost = Number(get('cost_lyd'))
        if (!name || Number.isNaN(cost)) continue
        const branchName = get('branch')
        const branch = branches.find(b => b.name?.toLowerCase() === branchName?.toLowerCase())
        await createCapex({
          asset_code: get('asset_code') || null,
          old_system_ref: get('old_system_ref') || null,
          name,
          category: get('category') || null,
          serial_number: get('serial_number') || null,
          condition: get('condition') || 'in_use',
          vendor: get('vendor') || null,
          acquired_at: get('acquired_at') || new Date().toISOString().slice(0, 10),
          cost_lyd: cost,
          salvage_value_lyd: Number(get('salvage_value_lyd')) || 0,
          expected_life_months: Number(get('expected_life_months')) || 60,
          depreciation_start: get('depreciation_start') || get('acquired_at') || null,
          legacy_accumulated_depreciation_lyd: Number(get('accumulated_depreciation_lyd')) || 0,
          branch_id: branch?.id || null,
          notes: get('notes') || null,
        })
        count++
      }
      toast.success(`Imported ${count} assets`)
      reload()
    } catch (err) {
      toast.error(err.message || 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Wrench size={14} className="text-noch-green" />
          <h3 className="text-white text-sm font-semibold">Assets & depreciation</h3>
          <span className="text-noch-muted text-xs">
            {list.length} assets - {lyd(totals.cost)} cost - {lyd(totals.book)} book value - {lyd(totals.depreciation)} depreciated
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportAssets} className="btn-secondary text-xs px-3 py-1 flex items-center gap-1">
            <Download size={11} /> Export
          </button>
          <label className="btn-secondary text-xs px-3 py-1 flex items-center gap-1 cursor-pointer">
            <Upload size={11} /> {importing ? 'Importing...' : 'Import old CSV'}
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={e => importAssets(e.target.files?.[0])} />
          </label>
          <button onClick={() => setShowAdd(true)} className="btn-primary text-xs px-3 py-1 flex items-center gap-1">
            <Plus size={11} /> Add asset
          </button>
        </div>
      </div>

      {loading ? <p className="text-noch-muted text-center py-12">Loading...</p> : list.length === 0 ? (
        <div className="card text-center py-10 text-noch-muted text-sm">No assets yet. Export first if you need the CSV template.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-noch-muted">
              <tr>
                <th className="text-left py-1 pr-2">Asset</th>
                <th className="text-left py-1 pr-2">Code</th>
                <th className="text-left py-1 pr-2">Category</th>
                <th className="text-left py-1 pr-2">Acquired</th>
                <th className="text-right py-1 pr-2">Cost</th>
                <th className="text-right py-1 pr-2">Life</th>
                <th className="text-right py-1 pr-2">Monthly dep.</th>
                <th className="text-right py-1 pr-2">Accum. dep.</th>
                <th className="text-right py-1 pr-2">Book value</th>
                <th className="text-right py-1 pr-2">Branch</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map(asset => {
                const dep = depreciationFor(asset)
                const branchName = branches.find(b => b.id === asset.branch_id)?.name || '-'
                return (
                  <tr key={asset.id} className="border-t border-noch-border/40">
                    <td className="py-1.5 pr-2 text-white">
                      <div>{asset.name}</div>
                      {asset.serial_number && <div className="text-noch-muted text-[10px]">{asset.serial_number}</div>}
                    </td>
                    <td className="py-1.5 pr-2 text-noch-muted">{asset.asset_code || asset.old_system_ref || '-'}</td>
                    <td className="py-1.5 pr-2 text-noch-muted">{asset.category || '-'}</td>
                    <td className="py-1.5 pr-2 text-noch-muted">{asset.acquired_at}</td>
                    <td className="py-1.5 pr-2 text-right text-white font-mono">{lyd(asset.cost_lyd)}</td>
                    <td className="py-1.5 pr-2 text-right text-noch-muted">{asset.expected_life_months || '-'}</td>
                    <td className="py-1.5 pr-2 text-right text-noch-muted font-mono">{lyd(dep.monthly)}</td>
                    <td className="py-1.5 pr-2 text-right text-yellow-400 font-mono">{lyd(dep.accumulated)}</td>
                    <td className="py-1.5 pr-2 text-right text-noch-green font-mono">{lyd(dep.bookValue)}</td>
                    <td className="py-1.5 pr-2 text-right text-noch-muted">{branchName}</td>
                    <td className="py-1.5 text-right">
                      <button onClick={() => setEditing(asset)} className="text-noch-muted hover:text-white">edit</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {(showAdd || editing) && (
        <AssetFormModal
          branches={branches}
          initial={editing}
          onClose={() => { setShowAdd(false); setEditing(null) }}
          onSave={async (form) => {
            try {
              if (editing) await updateCapex(editing.id, form)
              else await createCapex(form)
              toast.success('Saved')
              setShowAdd(false)
              setEditing(null)
              reload()
            } catch (err) {
              toast.error(err.message || 'Save failed')
            }
          }}
        />
      )}
    </div>
  )
}

function AssetFormModal({ branches, initial, onClose, onSave }) {
  const [f, setF] = useState({
    asset_code: initial?.asset_code || '',
    old_system_ref: initial?.old_system_ref || '',
    name: initial?.name || '',
    category: initial?.category || '',
    serial_number: initial?.serial_number || '',
    condition: initial?.condition || 'in_use',
    vendor: initial?.vendor || '',
    acquired_at: initial?.acquired_at || new Date().toISOString().slice(0, 10),
    cost_lyd: initial?.cost_lyd ?? '',
    salvage_value_lyd: initial?.salvage_value_lyd ?? 0,
    expected_life_months: initial?.expected_life_months ?? 60,
    depreciation_start: initial?.depreciation_start || initial?.acquired_at || new Date().toISOString().slice(0, 10),
    legacy_accumulated_depreciation_lyd: initial?.legacy_accumulated_depreciation_lyd ?? 0,
    expected_monthly_contribution_lyd: initial?.expected_monthly_contribution_lyd ?? '',
    branch_id: initial?.branch_id || '',
    notes: initial?.notes || '',
  })
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))

  const preview = depreciationFor(f)

  const submit = () => {
    if (!f.name || !f.cost_lyd) return toast.error('Name and cost required')
    onSave({
      asset_code: f.asset_code || null,
      old_system_ref: f.old_system_ref || null,
      name: f.name,
      category: f.category || null,
      serial_number: f.serial_number || null,
      condition: f.condition,
      vendor: f.vendor || null,
      acquired_at: f.acquired_at,
      cost_lyd: Number(f.cost_lyd),
      salvage_value_lyd: Number(f.salvage_value_lyd) || 0,
      expected_life_months: Number(f.expected_life_months) || null,
      depreciation_start: f.depreciation_start || f.acquired_at,
      legacy_accumulated_depreciation_lyd: Number(f.legacy_accumulated_depreciation_lyd) || 0,
      expected_monthly_contribution_lyd: Number(f.expected_monthly_contribution_lyd) || 0,
      branch_id: f.branch_id || null,
      notes: f.notes || null,
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-noch-card border border-noch-border rounded-2xl w-full max-w-2xl p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-white font-bold">{initial ? 'Edit asset' : 'Add asset'}</h2>
          <button onClick={onClose}><X className="text-noch-muted" size={16} /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Asset name" span>
            <input className="input w-full" value={f.name} onChange={e => set('name', e.target.value)} placeholder="e.g. La Marzocco" />
          </Field>
          <Field label="Asset code">
            <input className="input w-full" value={f.asset_code} onChange={e => set('asset_code', e.target.value)} />
          </Field>
          <Field label="Old system ref">
            <input className="input w-full" value={f.old_system_ref} onChange={e => set('old_system_ref', e.target.value)} />
          </Field>
          <Field label="Category">
            <input className="input w-full" value={f.category} onChange={e => set('category', e.target.value)} placeholder="Coffee machine, furniture..." />
          </Field>
          <Field label="Serial number">
            <input className="input w-full" value={f.serial_number} onChange={e => set('serial_number', e.target.value)} />
          </Field>
          <Field label="Condition">
            <select className="input w-full" value={f.condition} onChange={e => set('condition', e.target.value)}>
              {['in_use', 'needs_repair', 'stored', 'retired', 'sold'].map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Vendor">
            <input className="input w-full" value={f.vendor} onChange={e => set('vendor', e.target.value)} />
          </Field>
          <Field label="Acquired">
            <input type="date" className="input w-full" value={f.acquired_at} onChange={e => set('acquired_at', e.target.value)} />
          </Field>
          <Field label="Cost (LYD)">
            <input type="number" step="0.01" className="input w-full" value={f.cost_lyd} onChange={e => set('cost_lyd', e.target.value)} />
          </Field>
          <Field label="Salvage value (LYD)">
            <input type="number" step="0.01" className="input w-full" value={f.salvage_value_lyd} onChange={e => set('salvage_value_lyd', e.target.value)} />
          </Field>
          <Field label="Life (months)">
            <input type="number" className="input w-full" value={f.expected_life_months} onChange={e => set('expected_life_months', e.target.value)} />
          </Field>
          <Field label="Depreciation start">
            <input type="date" className="input w-full" value={f.depreciation_start} onChange={e => set('depreciation_start', e.target.value)} />
          </Field>
          <Field label="Legacy accumulated dep.">
            <input type="number" step="0.01" className="input w-full" value={f.legacy_accumulated_depreciation_lyd} onChange={e => set('legacy_accumulated_depreciation_lyd', e.target.value)} />
          </Field>
          <Field label="Branch">
            <select className="input w-full" value={f.branch_id} onChange={e => set('branch_id', e.target.value)}>
              <option value="">corporate</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
          <Field label="Expected monthly contribution" span>
            <input type="number" step="0.01" className="input w-full" value={f.expected_monthly_contribution_lyd} onChange={e => set('expected_monthly_contribution_lyd', e.target.value)} />
          </Field>
          <Field label="Notes" span>
            <textarea rows={2} className="input w-full resize-none" value={f.notes} onChange={e => set('notes', e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-4 text-xs">
          <div className="card p-3"><p className="text-noch-muted">Monthly depreciation</p><p className="text-white font-mono">{lyd(preview.monthly)}</p></div>
          <div className="card p-3"><p className="text-noch-muted">Accumulated</p><p className="text-yellow-400 font-mono">{lyd(preview.accumulated)}</p></div>
          <div className="card p-3"><p className="text-noch-muted">Book value</p><p className="text-noch-green font-mono">{lyd(preview.bookValue)}</p></div>
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={submit} className="btn-primary">{initial ? 'Save' : 'Add'}</button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, span = false, children }) {
  return (
    <div className={span ? 'col-span-2' : ''}>
      <label className="label block mb-1">{label}</label>
      {children}
    </div>
  )
}
