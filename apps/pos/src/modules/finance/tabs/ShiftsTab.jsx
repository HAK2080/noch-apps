// ShiftsTab.jsx — list of clock-in records + edit times/rates +
// owner sets each staff's hourly rate + overtime/extra-day pay settings.

import { useEffect, useState } from 'react'
import { Clock, Edit2, Save, X, DollarSign, Timer } from 'lucide-react'
import { listShiftLabor, updateAttendee, setHourlyRate, listBranches, getFinanceSettings, updateFinanceSettings } from '../lib/finance-supabase'
import { supabase } from '../../../lib/supabase'
import { lyd } from '../lib/thresholds'
import { downloadCsv, ExportButtons } from '../../../lib/exportCsv'
import toast from 'react-hot-toast'

// Local date, not UTC — toISOString() shifted dates a day back (Libya UTC+2)
function ymd(d) { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` }
const TODAY = ymd(new Date())
function nDaysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d) }

// ISO day-of-week (matches extract(isodow) in the shift_labor_cost view)
const DOW = [
  { v: 1, en: 'Mon' }, { v: 2, en: 'Tue' }, { v: 3, en: 'Wed' }, { v: 4, en: 'Thu' },
  { v: 5, en: 'Fri' }, { v: 6, en: 'Sat' }, { v: 7, en: 'Sun' },
]

export default function ShiftsTab({ readOnly = false }) {
  const [rows, setRows] = useState([])
  const [staff, setStaff] = useState([])
  const [branches, setBranches] = useState([])
  const [settings, setSettings] = useState(null)
  const [from, setFrom] = useState(nDaysAgo(7))
  const [to, setTo] = useState(TODAY)
  const [branchId, setBranchId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editingAtt, setEditingAtt] = useState(null)
  const [editingStaff, setEditingStaff] = useState(null)

  const reload = async () => {
    setLoading(true)
    try {
      const [list, st, bs, fs] = await Promise.all([
        listShiftLabor({ branchId, from, to }),
        supabase.from('profiles').select('id, full_name, hourly_rate_lyd, photo_url, role').eq('is_active', true).order('full_name'),
        listBranches(),
        getFinanceSettings(),
      ])
      setRows(list)
      setStaff(st.data || [])
      setBranches(bs)
      setSettings(fs)
    } catch (err) { toast.error(err.message || 'Failed to load') }
    finally { setLoading(false) }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload() }, [from, to, branchId])

  const totalLabor = rows.reduce((s, r) => s + Number(r.labor_cost_lyd || 0), 0)
  const totalHours = rows.reduce((s, r) => s + Number(r.hours || 0), 0)
  const totalOT = rows.reduce((s, r) => s + Number(r.overtime_hours || 0), 0)

  const exportCsv = () => {
    downloadCsv(`shift-labor_${from}_${to}`,
      ['Day', 'Staff', 'Branch', 'Clock in', 'Clock out', 'Hours', 'Regular', 'Overtime', 'Extra day', 'Rate (LYD)', 'Cost (LYD)'],
      rows.map(r => [
        r.clocked_in_at?.slice(0, 10),
        r.profiles?.full_name || 'Staff',
        branches.find(b => b.id === r.branch_id)?.name || '',
        r.clocked_in_at?.slice(11, 16),
        r.clocked_out_at?.slice(11, 16) || 'open',
        Number(r.hours).toFixed(2),
        r.regular_hours != null ? Number(r.regular_hours).toFixed(2) : '',
        r.overtime_hours != null ? Number(r.overtime_hours).toFixed(2) : '',
        r.is_extra_day ? 'yes' : '',
        Number(r.hourly_rate_lyd).toFixed(2),
        Number(r.labor_cost_lyd).toFixed(2),
      ]))
  }

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
          <Clock size={12} /> {totalHours.toFixed(1)} hrs
          {totalOT > 0 && <span className="text-yellow-400"> ({totalOT.toFixed(1)} OT)</span>} · {lyd(totalLabor)}
        </span>
        <ExportButtons onCsv={exportCsv} />
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
              ) : readOnly ? (
                <span className="text-noch-muted text-xs">
                  {p.hourly_rate_lyd != null ? `${Number(p.hourly_rate_lyd).toFixed(2)} LYD/hr` : '—'}
                </span>
              ) : (
                <button onClick={() => setEditingStaff(p.id)} className="text-noch-green text-xs">
                  {p.hourly_rate_lyd != null ? `${Number(p.hourly_rate_lyd).toFixed(2)} LYD/hr` : '— set'}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Overtime & extra-day pay settings (owner / finance-edit only) */}
      {!readOnly && settings && (
        <PayrollSettingsCard settings={settings} onSaved={(next) => { setSettings(next); reload() }} />
      )}

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
              {rows.map(r => {
                const ot = Number(r.overtime_hours || 0)
                return (
                <tr key={r.attendee_id} className="border-t border-noch-border/40">
                  <td className="py-1.5 pr-2 text-white whitespace-nowrap">
                    {r.clocked_in_at?.slice(0, 10)}
                    {r.is_extra_day && (
                      <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-purple-400/15 text-purple-300 border border-purple-400/30">
                        extra day ×{Number(r.extra_day_multiplier_applied || 1)}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pr-2 text-white">{r.profiles?.full_name || 'Staff'}</td>
                  <td className="py-1.5 pr-2 text-noch-muted">{branches.find(b => b.id === r.branch_id)?.name || '—'}</td>
                  <td className="py-1.5 pr-2 text-noch-muted">{r.clocked_in_at?.slice(11, 16)}</td>
                  <td className="py-1.5 pr-2 text-noch-muted">{r.clocked_out_at?.slice(11, 16) || <span className="text-noch-green">open</span>}</td>
                  <td className="py-1.5 pr-2 text-right text-white whitespace-nowrap">
                    {ot > 0 ? (
                      <>
                        {Number(r.regular_hours).toFixed(2)}
                        <span className="text-yellow-400"> + {ot.toFixed(2)} OT</span>
                      </>
                    ) : Number(r.hours).toFixed(2)}
                  </td>
                  <td className="py-1.5 pr-2 text-right text-white">{Number(r.hourly_rate_lyd).toFixed(2)}</td>
                  <td className="py-1.5 pr-2 text-right text-noch-green font-mono">{lyd(r.labor_cost_lyd)}</td>
                  <td className="py-1.5 text-right">
                    {!readOnly && (
                      <button onClick={() => setEditingAtt(r)} className="text-noch-muted hover:text-white"><Edit2 size={11}/></button>
                    )}
                  </td>
                </tr>
              )})}
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

// Overtime & extra-day pay settings card. All flags default OFF — the
// shift_labor_cost view applies multipliers only when enabled here.
function PayrollSettingsCard({ settings, onSaved }) {
  const [otOn, setOtOn] = useState(!!settings.overtime_enabled)
  const [otThreshold, setOtThreshold] = useState(settings.overtime_daily_threshold_hours ?? 8)
  const [otMult, setOtMult] = useState(settings.overtime_multiplier ?? 1.5)
  const [xdOn, setXdOn] = useState(!!settings.extra_day_enabled)
  const [xdMult, setXdMult] = useState(settings.extra_day_multiplier ?? 2.0)
  const [weekend, setWeekend] = useState(settings.weekend_days ?? [5, 6])
  const [saving, setSaving] = useState(false)

  const toggleDow = (v) =>
    setWeekend(w => w.includes(v) ? w.filter(x => x !== v) : [...w, v].sort())

  const save = async () => {
    setSaving(true)
    try {
      const next = await updateFinanceSettings({
        overtime_enabled: otOn,
        overtime_daily_threshold_hours: Number(otThreshold) || 8,
        overtime_multiplier: Number(otMult) || 1.5,
        extra_day_enabled: xdOn,
        extra_day_multiplier: Number(xdMult) || 2.0,
        weekend_days: weekend,
      })
      toast.success('Payroll settings saved')
      onSaved(next)
    } catch (err) { toast.error(err.message || 'Save failed') }
    finally { setSaving(false) }
  }

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <Timer size={14} className="text-noch-green" />
        <h3 className="text-white text-sm font-semibold">Overtime &amp; extra-day pay</h3>
        <span className="text-noch-muted text-[11px]">off by default — affects labor cost &amp; P&amp;L when enabled</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Overtime */}
        <div className="bg-noch-dark/50 rounded-xl p-3 flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm text-white cursor-pointer">
            <input type="checkbox" checked={otOn} onChange={e => setOtOn(e.target.checked)} />
            Overtime after a daily threshold
          </label>
          <div className={`flex items-center gap-3 text-xs ${otOn ? '' : 'opacity-40 pointer-events-none'}`}>
            <label className="flex items-center gap-1.5 text-noch-muted">
              after
              <input type="number" step="0.5" min="1" max="24" value={otThreshold}
                onChange={e => setOtThreshold(e.target.value)} className="input py-0.5 px-1.5 w-16 text-xs" />
              hrs/shift
            </label>
            <label className="flex items-center gap-1.5 text-noch-muted">
              pay ×
              <input type="number" step="0.25" min="1" max="5" value={otMult}
                onChange={e => setOtMult(e.target.value)} className="input py-0.5 px-1.5 w-16 text-xs" />
            </label>
          </div>
          <p className="text-noch-muted text-[10px]">Per-staff exemption: “Overtime exempt” on the Team page.</p>
        </div>

        {/* Extra day */}
        <div className="bg-noch-dark/50 rounded-xl p-3 flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm text-white cursor-pointer">
            <input type="checkbox" checked={xdOn} onChange={e => setXdOn(e.target.checked)} />
            Extra-day pay (weekend / scheduled day off)
          </label>
          <div className={`flex flex-col gap-2 text-xs ${xdOn ? '' : 'opacity-40 pointer-events-none'}`}>
            <label className="flex items-center gap-1.5 text-noch-muted">
              whole shift ×
              <input type="number" step="0.25" min="1" max="5" value={xdMult}
                onChange={e => setXdMult(e.target.value)} className="input py-0.5 px-1.5 w-16 text-xs" />
            </label>
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-noch-muted me-1">Weekend:</span>
              {DOW.map(d => (
                <button key={d.v} onClick={() => toggleDow(d.v)}
                  className={`px-2 py-0.5 rounded-lg border text-[10px] transition-colors ${
                    weekend.includes(d.v)
                      ? 'bg-noch-green/20 border-noch-green/50 text-noch-green'
                      : 'border-noch-border text-noch-muted hover:border-noch-green/30'
                  }`}>
                  {d.en}
                </button>
              ))}
            </div>
            <p className="text-noch-muted text-[10px]">Also applies on each staff member’s scheduled days off (set on the Team page).</p>
          </div>
        </div>
      </div>

      <div className="flex justify-end mt-3">
        <button onClick={save} disabled={saving} className="btn-primary text-xs px-4 py-1.5 flex items-center gap-1.5">
          <Save size={12} /> {saving ? 'Saving…' : 'Save payroll settings'}
        </button>
      </div>
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
