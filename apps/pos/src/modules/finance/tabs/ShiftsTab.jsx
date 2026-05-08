// ShiftsTab.jsx — list of clock-in records + edit times/rates +
// owner sets each staff's hourly rate.

import { useEffect, useState } from 'react'
import { Clock, Edit2, Save, X, DollarSign } from 'lucide-react'
import { listShiftLabor, updateAttendee, setHourlyRate, listBranches } from '../lib/finance-supabase'
import { supabase } from '../../../lib/supabase'
import { lyd } from '../lib/thresholds'
import toast from 'react-hot-toast'

function ymd(d) { return d.toISOString().slice(0, 10) }
const TODAY = ymd(new Date())
function nDaysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d) }

export default function ShiftsTab() {
  const [rows, setRows] = useState([])
  const [staff, setStaff] = useState([])
  const [branches, setBranches] = useState([])
  const [from, setFrom] = useState(nDaysAgo(7))
  const [to, setTo] = useState(TODAY)
  const [branchId, setBranchId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editingAtt, setEditingAtt] = useState(null)
  const [editingStaff, setEditingStaff] = useState(null)

  const reload = async () => {
    setLoading(true)
    try {
      const [list, st, bs] = await Promise.all([
        listShiftLabor({ branchId, from, to }),
        supabase.from('profiles').select('id, full_name, hourly_rate_lyd, photo_url, role').eq('is_active', true).order('full_name'),
        listBranches(),
      ])
      setRows(list)
      setStaff(st.data || [])
      setBranches(bs)
    } catch (err) { toast.error(err.message || 'Failed to load') }
    finally { setLoading(false) }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload() }, [from, to, branchId])

  const totalLabor = rows.reduce((s, r) => s + Number(r.labor_cost_lyd || 0), 0)
  const totalHours = rows.reduce((s, r) => s + Number(r.hours || 0), 0)

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <select value={branchId || ''} onChange={e => setBranchId(e.target.value || null)} className="input py-1 px-2 text-xs">
          <option value="">All branches</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <div className="flex items-center gap-2">
          <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} className="input py-1 px-2 text-xs" />
          <span className="text-noch-muted text-xs">→</span>
          <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} className="input py-1 px-2 text-xs" />
        </div>
        <span className="text-noch-muted text-xs ml-auto flex items-center gap-1">
          <Clock size={12} /> {totalHours.toFixed(1)} hrs · {lyd(totalLabor)}
        </span>
      </div>

      {/* Staff hourly rates */}
      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <DollarSign size={14} className="text-noch-green"/>
          <h3 className="text-white text-sm font-semibold">Hourly rates</h3>
          <span className="text-noch-muted text-[11px]">applied to all shifts unless overridden per-shift</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {staff.map(p => (
            <div key={p.id} className="flex items-center justify-between bg-noch-dark/50 rounded-lg px-3 py-2 text-sm">
              <span className="text-white truncate">{p.full_name}</span>
              {editingStaff === p.id ? (
                <RateEdit defaultVal={p.hourly_rate_lyd}
                  onCancel={() => setEditingStaff(null)}
                  onSave={async (v) => {
                    try { await setHourlyRate(p.id, v); toast.success('Saved'); setEditingStaff(null); reload() }
                    catch (err) { toast.error(err.message || 'Save failed') }
                  }} />
              ) : (
                <button onClick={() => setEditingStaff(p.id)} className="text-noch-green text-xs">
                  {p.hourly_rate_lyd != null ? `${Number(p.hourly_rate_lyd).toFixed(2)} LYD/hr` : '— set'}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Shift attendance list */}
      <div className="card overflow-x-auto">
        <h3 className="text-white text-sm font-semibold mb-3">Shifts</h3>
        {loading ? <p className="text-noch-muted">Loading…</p> : rows.length === 0 ? (
          <p className="text-noch-muted text-sm py-3 text-center">No shifts in this range.</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-noch-muted">
              <tr>
                <th className="text-left py-1 pr-2">Day</th>
                <th className="text-left py-1 pr-2">Staff</th>
                <th className="text-left py-1 pr-2">Branch</th>
                <th className="text-left py-1 pr-2">In</th>
                <th className="text-left py-1 pr-2">Out</th>
                <th className="text-right py-1 pr-2">Hours</th>
                <th className="text-right py-1 pr-2">Rate</th>
                <th className="text-right py-1 pr-2">Cost</th>
                <th className="py-1"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.attendee_id} className="border-t border-noch-border/40">
                  <td className="py-1.5 pr-2 text-white">{r.clocked_in_at?.slice(0, 10)}</td>
                  <td className="py-1.5 pr-2 text-white">{r.profiles?.full_name || 'Staff'}</td>
                  <td className="py-1.5 pr-2 text-noch-muted">{branches.find(b => b.id === r.branch_id)?.name || '—'}</td>
                  <td className="py-1.5 pr-2 text-noch-muted">{r.clocked_in_at?.slice(11, 16)}</td>
                  <td className="py-1.5 pr-2 text-noch-muted">{r.clocked_out_at?.slice(11, 16) || <span className="text-noch-green">open</span>}</td>
                  <td className="py-1.5 pr-2 text-right text-white">{Number(r.hours).toFixed(2)}</td>
                  <td className="py-1.5 pr-2 text-right text-white">{Number(r.hourly_rate_lyd).toFixed(2)}</td>
                  <td className="py-1.5 pr-2 text-right text-noch-green font-mono">{lyd(r.labor_cost_lyd)}</td>
                  <td className="py-1.5 text-right">
                    <button onClick={() => setEditingAtt(r)} className="text-noch-muted hover:text-white"><Edit2 size={11}/></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editingAtt && (
        <AttendeeEdit
          row={editingAtt}
          onClose={() => setEditingAtt(null)}
          onSave={async (updates) => {
            try {
              await updateAttendee(editingAtt.attendee_id, updates)
              toast.success('Saved')
              setEditingAtt(null); reload()
            } catch (err) { toast.error(err.message || 'Save failed') }
          }}
        />
      )}
    </div>
  )
}

function RateEdit({ defaultVal, onCancel, onSave }) {
  const [v, setV] = useState(defaultVal ?? '')
  return (
    <div className="flex items-center gap-1">
      <input type="number" step="0.01" value={v} onChange={e => setV(e.target.value)}
        className="input py-0.5 px-1 text-xs w-20" />
      <button onClick={() => onSave(v)} className="text-noch-green"><Save size={12}/></button>
      <button onClick={onCancel} className="text-noch-muted"><X size={12}/></button>
    </div>
  )
}

function AttendeeEdit({ row, onClose, onSave }) {
  const [clockedIn, setClockedIn] = useState(row.clocked_in_at?.slice(0, 16) || '')
  const [clockedOut, setClockedOut] = useState(row.clocked_out_at?.slice(0, 16) || '')
  const [override, setOverride] = useState('')

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-noch-card border border-noch-border rounded-2xl w-full max-w-sm p-5">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-white font-bold">Edit shift</h2>
          <button onClick={onClose}><X className="text-noch-muted" size={16}/></button>
        </div>
        <div className="flex flex-col gap-3 text-sm">
          <div>
            <label className="label block mb-1">Clock in</label>
            <input type="datetime-local" className="input w-full" value={clockedIn} onChange={e => setClockedIn(e.target.value)} />
          </div>
          <div>
            <label className="label block mb-1">Clock out</label>
            <input type="datetime-local" className="input w-full" value={clockedOut} onChange={e => setClockedOut(e.target.value)} />
          </div>
          <div>
            <label className="label block mb-1">Hourly rate override (optional)</label>
            <input type="number" step="0.01" className="input w-full" value={override} onChange={e => setOverride(e.target.value)} placeholder={`default ${Number(row.hourly_rate_lyd).toFixed(2)}`} />
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={() => onSave({
            clocked_in_at: clockedIn ? new Date(clockedIn).toISOString() : null,
            clocked_out_at: clockedOut ? new Date(clockedOut).toISOString() : null,
            hourly_rate_override_lyd: override === '' ? null : Number(override),
          })} className="btn-primary">Save</button>
        </div>
      </div>
    </div>
  )
}
