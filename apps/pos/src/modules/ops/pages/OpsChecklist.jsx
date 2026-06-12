// OpsChecklist — today's tasks grouped by window, current window first.
// Tap to complete. Numeric input when the template requires a value.
// Tablet-first (large touch targets).

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Circle, Clock, AlertTriangle } from 'lucide-react'
import Layout from '../../../components/Layout'
import { useAuth } from '../../../contexts/AuthContext'
import { useLanguage } from '../../../contexts/LanguageContext'
import { useOpsSettings } from '../lib/useOps'
import {
  listShiftWindows, listInstancesForDate, ensureInstancesForToday,
  completeInstance, skipInstance,
  todayInTz, currentShiftWindow,
} from '../lib/ops-supabase'
import toast from 'react-hot-toast'

export default function OpsChecklist() {
  const { profile } = useAuth()
  const { lang } = useLanguage()
  const { settings, moduleEnabled, loading: settingsLoading } = useOpsSettings()
  const ar = lang === 'ar'
  const tz = settings?.timezone || 'Africa/Tripoli'
  const businessDate = useMemo(() => todayInTz(tz), [tz])

  const [windows, setWindows] = useState([])
  const [instances, setInstances] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)
  const [valueDraft, setValueDraft] = useState({})  // { instanceId: '' }

  const reload = async () => {
    if (!moduleEnabled) { setLoading(false); return }
    setLoading(true)
    try {
      await ensureInstancesForToday(businessDate)
      const [ws, ins] = await Promise.all([
        listShiftWindows({ activeOnly: true }),
        listInstancesForDate(businessDate),
      ])
      setWindows(ws); setInstances(ins)
    } catch (err) {
      toast.error(err.message || 'Failed to load')
    } finally { setLoading(false) }
  }

  useEffect(() => { reload() }, [moduleEnabled, businessDate]) // eslint-disable-line

  if (settingsLoading) return <Layout><p className="text-noch-muted text-center py-16">…</p></Layout>

  if (!moduleEnabled) {
    return (
      <Layout>
        <div className="max-w-md mx-auto text-center py-16">
          <Clock size={32} className="mx-auto text-noch-muted mb-3 opacity-40" />
          <p className="text-noch-muted text-sm">
            {ar ? 'وحدة المهام معطّلة حالياً.' : 'The Ops Checklist module is currently disabled.'}
          </p>
        </div>
      </Layout>
    )
  }

  const cur = currentShiftWindow(windows, tz)
  const sortedWindows = [...windows].sort((a, b) => {
    if (cur && a.id === cur.id) return -1
    if (cur && b.id === cur.id) return 1
    return (a.sort_order ?? 0) - (b.sort_order ?? 0)
  })

  const onComplete = async (inst) => {
    const tmpl = inst.template
    if (tmpl?.requires_value) {
      const raw = valueDraft[inst.id]
      if (raw == null || raw === '') {
        toast.error(ar ? 'أدخل قيمة' : 'Enter a value')
        return
      }
    }
    setSavingId(inst.id)
    try {
      const value = tmpl?.requires_value ? Number(valueDraft[inst.id]) : null
      await completeInstance(inst.id, { value_recorded: value, profileId: profile?.id })
      toast.success(ar ? 'تم' : 'Done')
      reload()
    } catch (err) {
      toast.error(err.message || 'Save failed')
    } finally { setSavingId(null) }
  }

  const onSkip = async (inst) => {
    setSavingId(inst.id)
    try {
      await skipInstance(inst.id, profile?.id)
      reload()
    } catch (err) {
      toast.error(err.message || 'Skip failed')
    } finally { setSavingId(null) }
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto py-2">
        <h1 className="text-white font-bold text-2xl mb-1">
          {ar ? 'قائمة مهام اليوم' : "Today's checklist"}
        </h1>
        <p className="text-noch-muted text-sm mb-5">{businessDate}</p>

        {loading ? <p className="text-noch-muted text-center py-8">…</p> : sortedWindows.length === 0 ? (
          <p className="text-noch-muted text-center py-8">
            {ar ? 'لا توجد ورديّات مفعّلة بعد.' : 'No active shift windows yet.'}
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            {sortedWindows.map(w => {
              const tasks = instances.filter(i => i.template?.shift_window_id === w.id)
              const done = tasks.filter(t => t.status === 'done').length
              const isCurrent = cur && cur.id === w.id
              return (
                <section key={w.id} className={`card ${isCurrent ? 'border-noch-green/40' : ''}`}>
                  <header className="flex items-baseline justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <h2 className="text-white font-bold text-lg">{ar ? w.name_ar : w.name_en}</h2>
                      {isCurrent && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-noch-green/20 text-noch-green border border-noch-green/30">
                          {ar ? 'الآن' : 'NOW'}
                        </span>
                      )}
                    </div>
                    <span className="text-noch-muted text-xs flex items-center gap-1">
                      <Clock size={11} />
                      {w.start_time?.slice(0, 5)} – {w.end_time?.slice(0, 5)}
                      <span className="ms-2">{done}/{tasks.length}</span>
                    </span>
                  </header>

                  {tasks.length === 0 ? (
                    <p className="text-noch-muted text-sm">{ar ? 'لا توجد مهام مفعّلة لهذه الوردية.' : 'No active tasks in this window.'}</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {tasks
                        .sort((a, b) => (a.template?.sort_order ?? 0) - (b.template?.sort_order ?? 0))
                        .map(inst => {
                          const t = inst.template
                          const isDone = inst.status === 'done'
                          const isSkipped = inst.status === 'skipped'
                          const title = ar ? t?.title_ar : t?.title_en
                          const desc  = ar ? t?.description_ar : t?.description_en
                          const item  = t?.item
                          const itemName = item ? (ar ? item.name_ar : item.name_en) : null
                          return (
                            <li key={inst.id} className={`rounded-xl border p-3 flex flex-col gap-2 ${
                              isDone ? 'border-noch-green/30 bg-noch-green/5'
                                     : isSkipped ? 'border-noch-border/50 bg-noch-dark/30 opacity-70'
                                     : 'border-noch-border bg-noch-dark/30'
                            }`}>
                              <div className="flex items-start gap-3">
                                {isDone ? (
                                  <CheckCircle2 size={22} className="text-noch-green flex-shrink-0 mt-0.5" />
                                ) : (
                                  <Circle size={22} className="text-noch-muted flex-shrink-0 mt-0.5" />
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className={`font-semibold ${isDone ? 'text-noch-muted line-through' : 'text-white'}`}>{title}</p>
                                  {desc && <p className="text-noch-muted text-xs mt-0.5">{desc}</p>}
                                  {isDone && inst.completed_by_profile && (
                                    <p className="text-noch-muted text-[11px] mt-1">
                                      {ar ? 'أنجزها' : 'by'}{' '}
                                      <span className="text-white">{inst.completed_by_profile.full_name}</span>
                                      {inst.value_recorded != null && (
                                        <> · <span className="font-mono text-noch-green">{Number(inst.value_recorded)}{item?.unit ? ` ${item.unit}` : ''}</span></>
                                      )}
                                    </p>
                                  )}
                                </div>
                              </div>

                              {!isDone && !isSkipped && (
                                <div className="flex flex-col sm:flex-row gap-2">
                                  {t?.requires_value && (
                                    <div className="flex items-center gap-2 flex-1">
                                      <input
                                        type="number" inputMode="decimal" step="0.01"
                                        value={valueDraft[inst.id] ?? ''}
                                        onChange={e => setValueDraft(d => ({ ...d, [inst.id]: e.target.value }))}
                                        placeholder={itemName || (ar ? 'الكميّة' : 'Quantity')}
                                        className="input flex-1 text-lg py-3 px-3"
                                      />
                                      {item?.unit && <span className="text-noch-muted text-sm">{item.unit}</span>}
                                    </div>
                                  )}
                                  <div className="flex gap-2">
                                    <button onClick={() => onSkip(inst)} disabled={savingId === inst.id}
                                            className="btn-secondary px-4 py-3 text-sm">
                                      {ar ? 'تخطّي' : 'Skip'}
                                    </button>
                                    <button onClick={() => onComplete(inst)} disabled={savingId === inst.id}
                                            className="btn-primary flex-1 sm:flex-initial px-6 py-3 text-sm font-bold">
                                      {ar ? 'إنهاء' : 'Mark done'}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </li>
                          )
                        })}
                    </ul>
                  )}
                </section>
              )
            })}
            {sortedWindows.every(w => instances.filter(i => i.template?.shift_window_id === w.id).length === 0) && (
              <div className="card flex items-center gap-2 text-yellow-300">
                <AlertTriangle size={14} />
                <span className="text-xs">
                  {ar ? 'لا توجد مهام لليوم بعد. الإدارة تعدّ القائمة من الإعدادات.'
                      : "No tasks for today yet. Management can add them from Settings."}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  )
}
