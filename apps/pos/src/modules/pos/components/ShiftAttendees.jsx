// ShiftAttendees.jsx — per-barista clock in/out panel for the open shift.
// Gated by pos_settings.per_barista_shift; the terminal hides it
// otherwise.

import { useEffect, useState } from 'react'
import { UserPlus, UserMinus, Clock, X } from 'lucide-react'
import {
  getShiftAttendees, clockInAttendee, clockOutAttendee,
} from '../lib/pos-supabase'
import { supabase } from '../../../lib/supabase'
import toast from 'react-hot-toast'

function formatHm(start, end) {
  if (!start) return '—'
  const s = new Date(start).getTime()
  const e = end ? new Date(end).getTime() : Date.now()
  const mins = Math.max(0, Math.round((e - s) / 60000))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h}h ${m.toString().padStart(2, '0')}m`
}

export default function ShiftAttendees({ shiftId, branchId, onClose }) {
  const [attendees, setAttendees] = useState([])
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [att, { data: stf }] = await Promise.all([
        getShiftAttendees(shiftId),
        supabase.from('profiles').select('id, full_name, role, photo_url').eq('is_active', true).order('full_name'),
      ])
      setAttendees(att)
      setStaff(stf || [])
    } catch (err) {
      toast.error(err.message || 'Failed to load attendees')
    } finally {
      setLoading(false)
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (shiftId) load() }, [shiftId])

  const handleClockIn = async (user) => {
    setBusy(true)
    try {
      await clockInAttendee(shiftId, user.id, branchId)
      toast.success(`${user.full_name || 'Staff'} clocked in`)
      await load()
    } catch (err) {
      toast.error(err.message || 'Clock-in failed')
    } finally { setBusy(false) }
  }
  const handleClockOut = async (att) => {
    setBusy(true)
    try {
      await clockOutAttendee(shiftId, att.user_id)
      toast.success('Clocked out')
      await load()
    } catch (err) {
      toast.error(err.message || 'Clock-out failed')
    } finally { setBusy(false) }
  }

  const onShift = new Set(attendees.filter(a => !a.clocked_out_at).map(a => a.user_id))
  const offShift = staff.filter(s => !onShift.has(s.id))

  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-end sm:items-center justify-center">
      <div className="bg-noch-card border border-noch-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-noch-border sticky top-0 bg-noch-card">
          <h2 className="text-white font-bold flex items-center gap-2">
            <Clock size={16} className="text-noch-green" />
            Shift attendees
          </h2>
          <button onClick={onClose} className="text-noch-muted hover:text-white"><X size={18} /></button>
        </div>
        <div className="p-4">
          {loading ? <p className="text-noch-muted text-sm">Loading…</p> : (
            <>
              <h3 className="text-white text-sm font-semibold mb-2">On shift</h3>
              {attendees.filter(a => !a.clocked_out_at).length === 0 ? (
                <p className="text-noch-muted text-xs mb-4">Nobody clocked in yet.</p>
              ) : (
                <div className="flex flex-col gap-2 mb-4">
                  {attendees.filter(a => !a.clocked_out_at).map(a => (
                    <div key={a.id} className="flex items-center justify-between bg-noch-dark rounded-lg px-3 py-2">
                      <div>
                        <p className="text-white text-sm">{a.profiles?.full_name || 'Staff'}</p>
                        <p className="text-noch-muted text-[10px]">
                          {formatHm(a.clocked_in_at, null)} · {a.total_orders} orders · {Number(a.total_sales).toFixed(2)} LYD
                        </p>
                      </div>
                      <button
                        disabled={busy}
                        onClick={() => handleClockOut(a)}
                        className="btn-secondary text-xs px-2 py-1 flex items-center gap-1"
                      >
                        <UserMinus size={12} /> Clock out
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <h3 className="text-white text-sm font-semibold mb-2">Available staff</h3>
              {offShift.length === 0 ? (
                <p className="text-noch-muted text-xs">Everyone is on shift.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {offShift.map(u => (
                    <button
                      key={u.id}
                      disabled={busy}
                      onClick={() => handleClockIn(u)}
                      className="flex items-center justify-between bg-noch-dark hover:bg-noch-border/30 rounded-lg px-3 py-2 text-left"
                    >
                      <div>
                        <p className="text-white text-sm">{u.full_name || 'Staff'}</p>
                        <p className="text-noch-muted text-[10px]">{u.role || ''}</p>
                      </div>
                      <UserPlus size={14} className="text-noch-green" />
                    </button>
                  ))}
                </div>
              )}

              {attendees.filter(a => a.clocked_out_at).length > 0 && (
                <>
                  <h3 className="text-white text-sm font-semibold mt-5 mb-2">Earlier today</h3>
                  <div className="flex flex-col gap-1.5">
                    {attendees.filter(a => a.clocked_out_at).map(a => (
                      <div key={a.id} className="flex items-center justify-between text-xs">
                        <span className="text-white">{a.profiles?.full_name || 'Staff'}</span>
                        <span className="text-noch-muted">
                          {formatHm(a.clocked_in_at, a.clocked_out_at)} · {Number(a.total_sales).toFixed(2)} LYD
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
