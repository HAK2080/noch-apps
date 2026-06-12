// OpsReminderPopup — fires during an active shift window when there are
// pending task instances, then repeats according to reminder_repeat_count
// and reminder_repeat_delay_minutes. After the last dismissal, optionally
// shows a persistent header badge until tasks complete.
//
// Mounted at the Layout level. POSTerminal renders chromeless without
// Layout, so the popup naturally never appears mid-transaction.
//
// Dismissal state is kept in localStorage keyed by business_date + window:
//   ops_dismiss_v1:<YYYY-MM-DD>:<window_id> = { count: N, last: ISO }
// This is per-device, which is what the spec asks for — the SAME tablet
// counts dismissals against itself.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Bell, X, Clock } from 'lucide-react'
import { useLanguage } from '../../../contexts/LanguageContext'
import { useOpsSettings } from '../lib/useOps'
import {
  listShiftWindows, listInstancesForDate, ensureInstancesForToday,
  todayInTz, currentShiftWindow,
} from '../lib/ops-supabase'

const DISMISS_KEY_PREFIX = 'ops_dismiss_v1'

function readDismiss(date, windowId) {
  try {
    const raw = localStorage.getItem(`${DISMISS_KEY_PREFIX}:${date}:${windowId}`)
    return raw ? JSON.parse(raw) : { count: 0, last: null }
  } catch { return { count: 0, last: null } }
}

function writeDismiss(date, windowId, val) {
  try { localStorage.setItem(`${DISMISS_KEY_PREFIX}:${date}:${windowId}`, JSON.stringify(val)) } catch {}
}

export default function OpsReminderPopup() {
  const { settings, moduleEnabled } = useOpsSettings()
  const { lang } = useLanguage()
  const navigate = useNavigate()
  const location = useLocation()
  const ar = lang === 'ar'

  const [windows, setWindows] = useState([])
  const [instances, setInstances] = useState([])
  const [show, setShow] = useState(false)

  const tz = settings?.timezone || 'Africa/Tripoli'
  const businessDate = useMemo(() => todayInTz(tz), [tz])
  const activeWindow = useMemo(() => currentShiftWindow(windows, tz), [windows, tz])

  // Load windows + instances when module turns on or window changes.
  useEffect(() => {
    if (!moduleEnabled) return
    let cancel = false
    Promise.all([
      listShiftWindows({ activeOnly: true }),
      ensureInstancesForToday(businessDate).then(() => listInstancesForDate(businessDate)),
    ]).then(([ws, ins]) => {
      if (cancel) return
      setWindows(ws); setInstances(ins)
    }).catch(() => {})
    return () => { cancel = true }
  }, [moduleEnabled, businessDate])

  // Pending count for the active window
  const pendingInWindow = useMemo(() => {
    if (!activeWindow) return 0
    return instances.filter(i =>
      i.status === 'pending' && i.template?.shift_window_id === activeWindow.id
    ).length
  }, [activeWindow, instances])

  // Decide whether to show: respects repeat_count + delay.
  useEffect(() => {
    if (!moduleEnabled || !settings?.reminders_enabled || !activeWindow || pendingInWindow === 0) {
      setShow(false)
      return
    }
    // Don't pop on the checklist screen itself or in chromeless POS — chromeless
    // POS already doesn't mount Layout, but defending here is cheap.
    if (location.pathname.startsWith('/ops')) { setShow(false); return }

    const state = readDismiss(businessDate, activeWindow.id)
    const max = Math.max(1, Number(settings.reminder_repeat_count) || 2)
    if (state.count >= max) { setShow(false); return }

    const delayMs = (Number(settings.reminder_repeat_delay_minutes) || 30) * 60_000
    const now = Date.now()
    const lastTs = state.last ? new Date(state.last).getTime() : null
    const eligibleNow = !lastTs || (now - lastTs) >= delayMs
    if (eligibleNow) { setShow(true); return }

    // Schedule a wake-up at the next eligible time
    const ms = Math.max(1000, delayMs - (now - lastTs))
    const t = setTimeout(() => setShow(true), ms)
    return () => clearTimeout(t)
  }, [moduleEnabled, settings?.reminders_enabled, settings?.reminder_repeat_count,
      settings?.reminder_repeat_delay_minutes, activeWindow, pendingInWindow,
      businessDate, location.pathname])

  if (!moduleEnabled || !show || !activeWindow) {
    // Persistent badge after final dismissal: see Layout for badge render —
    // popup itself only handles the modal.
    return null
  }

  const onDismiss = () => {
    const prev = readDismiss(businessDate, activeWindow.id)
    writeDismiss(businessDate, activeWindow.id, {
      count: (prev.count || 0) + 1,
      last: new Date().toISOString(),
    })
    setShow(false)
  }

  const windowName = ar ? activeWindow.name_ar : activeWindow.name_en
  const title = ar ? 'مهام بانتظارك' : 'Tasks waiting'
  const body  = ar
    ? `عندك ${pendingInWindow} ${pendingInWindow === 1 ? 'مهمة' : 'مهمات'} في وردية «${windowName}»`
    : `You have ${pendingInWindow} pending task${pendingInWindow === 1 ? '' : 's'} in the ${windowName} window`
  const openLabel = ar ? 'افتح القائمة' : 'Open checklist'
  const laterLabel = ar ? 'لاحقاً' : 'Later'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 print:hidden"
         role="dialog" aria-modal="true">
      <div className="bg-noch-card border border-noch-border rounded-2xl w-full max-w-sm p-6 shadow-2xl"
           style={{ animation: 'ops-pulse 1.4s ease-in-out infinite' }}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-noch-green/15 flex items-center justify-center">
            <Bell size={20} className="text-noch-green" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-white font-bold text-lg">{title}</h2>
            <p className="text-noch-muted text-sm mt-1">{body}</p>
            <p className="text-noch-muted text-[11px] mt-2 flex items-center gap-1">
              <Clock size={11} />
              {activeWindow.start_time?.slice(0, 5)} – {activeWindow.end_time?.slice(0, 5)}
            </p>
          </div>
          <button onClick={onDismiss} className="text-noch-muted hover:text-white" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onDismiss}
                  className="btn-secondary flex-1 py-3 text-sm">
            {laterLabel}
          </button>
          <button onClick={() => { onDismiss(); navigate('/ops') }}
                  className="btn-primary flex-1 py-3 text-sm font-bold">
            {openLabel}
          </button>
        </div>
      </div>
      <style>{`
        @keyframes ops-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(74,222,128,0.35); }
          50%      { box-shadow: 0 0 0 8px rgba(74,222,128,0.0); }
        }
      `}</style>
    </div>
  )
}

// ── Persistent header badge ────────────────────────────────────────────────
// Renders only after the per-window dismiss count has reached the configured
// max AND persistent_badge_enabled is true. Mounted by Layout, shown in
// header strip.
export function OpsPersistentBadge() {
  const { settings, moduleEnabled } = useOpsSettings()
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const navigate = useNavigate()
  const [pending, setPending] = useState(0)

  useEffect(() => {
    if (!moduleEnabled || !settings?.persistent_badge_enabled) return
    const tz = settings.timezone || 'Africa/Tripoli'
    const date = todayInTz(tz)
    let cancel = false
    Promise.all([
      listShiftWindows({ activeOnly: true }),
      listInstancesForDate(date),
    ]).then(([ws, ins]) => {
      if (cancel) return
      const win = currentShiftWindow(ws, tz)
      if (!win) { setPending(0); return }
      const state = readDismiss(date, win.id)
      const max = Math.max(1, Number(settings.reminder_repeat_count) || 2)
      if (state.count < max) { setPending(0); return }
      const n = ins.filter(i => i.status === 'pending' && i.template?.shift_window_id === win.id).length
      setPending(n)
    }).catch(() => {})
    return () => { cancel = true }
  }, [moduleEnabled, settings?.persistent_badge_enabled, settings?.reminder_repeat_count,
      settings?.timezone])

  if (!moduleEnabled || !settings?.persistent_badge_enabled || pending === 0) return null

  return (
    <button onClick={() => navigate('/ops')}
            className="ms-2 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-yellow-500/15 text-yellow-300 border border-yellow-500/30 hover:bg-yellow-500/25 flex items-center gap-1.5">
      <Bell size={11} />
      {ar ? `مهام غير مكتملة (${pending})` : `Incomplete tasks (${pending})`}
    </button>
  )
}
