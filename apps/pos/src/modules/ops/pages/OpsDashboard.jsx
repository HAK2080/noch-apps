// OpsDashboard — manager view: today's instances grid + open restock alerts
// + 7-day completion rate per window.

import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, AlertTriangle, BarChart3, CheckCircle2, Circle, MinusCircle } from 'lucide-react'
import Layout from '../../../components/Layout'
import { useAuth } from '../../../contexts/AuthContext'
import { useLanguage } from '../../../contexts/LanguageContext'
import { usePermissions } from '../../../contexts/PermissionsContext'
import { useOpsSettings } from '../lib/useOps'
import {
  listShiftWindows, listInstancesForDate, ensureInstancesForToday,
  listOpenRestockAlerts, ackRestockAlert,
  completionRateLast7Days,
  todayInTz,
} from '../lib/ops-supabase'
import { AccessDenied } from '../../../components/shared/ProtectedFeature'
import toast from 'react-hot-toast'

const STATUS_ICON = {
  done:    <CheckCircle2 size={14} className="text-noch-green" />,
  skipped: <MinusCircle size={14} className="text-noch-muted" />,
  pending: <Circle size={14} className="text-noch-muted/50" />,
}

export default function OpsDashboard() {
  const { profile } = useAuth()
  const { isOwner, canEdit, loading: permLoading } = usePermissions()
  const canManage = isOwner || canEdit('ops')
  const { lang } = useLanguage()
  const ar = lang === 'ar'
  const { settings, moduleEnabled, loading: sLoading } = useOpsSettings()
  const tz = settings?.timezone || 'Africa/Tripoli'
  const businessDate = useMemo(() => todayInTz(tz), [tz])

  const [windows, setWindows] = useState([])
  const [instances, setInstances] = useState([])
  const [alerts, setAlerts] = useState([])
  const [rates, setRates] = useState([])
  const [loading, setLoading] = useState(true)

  const reload = async () => {
    if (!moduleEnabled) { setLoading(false); return }
    setLoading(true)
    try {
      await ensureInstancesForToday(businessDate)
      const [w, ins, a, r] = await Promise.all([
        listShiftWindows({ activeOnly: true }),
        listInstancesForDate(businessDate),
        listOpenRestockAlerts(),
        completionRateLast7Days(),
      ])
      setWindows(w); setInstances(ins); setAlerts(a); setRates(r)
    } catch (err) { toast.error(err.message || 'Failed to load') }
    finally { setLoading(false) }
  }
  useEffect(() => { reload() }, [moduleEnabled, businessDate]) // eslint-disable-line

  if (sLoading || permLoading) return <Layout><p className="text-noch-muted text-center py-16">…</p></Layout>
  if (!canManage) return <Layout><AccessDenied message="Manager only." /></Layout>

  if (!moduleEnabled) {
    return (
      <Layout>
        <div className="max-w-md mx-auto text-center py-16">
          <ClipboardList size={32} className="mx-auto text-noch-muted mb-3 opacity-40" />
          <p className="text-noch-muted text-sm">
            {ar ? 'الوحدة معطّلة. فعّلها من الإعدادات.' : 'Module disabled. Enable it from Settings.'}
          </p>
          <a href="/ops/settings" className="btn-primary inline-block mt-4 text-sm">{ar ? 'الإعدادات' : 'Settings'}</a>
        </div>
      </Layout>
    )
  }

  const onAck = async (alertId) => {
    try { await ackRestockAlert(alertId, profile?.id); reload() }
    catch (err) { toast.error(err.message || 'Failed') }
  }

  const totals = instances.reduce((a, i) => {
    a.total++
    if (i.status === 'done') a.done++
    return a
  }, { total: 0, done: 0 })

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex items-baseline justify-between">
          <div>
            <h1 className="text-white font-bold text-2xl">{ar ? 'لوحة المهام' : 'Ops dashboard'}</h1>
            <p className="text-noch-muted text-sm">{businessDate} · {totals.done}/{totals.total} {ar ? 'مكتملة' : 'done'}</p>
          </div>
          <a href="/ops/settings" className="btn-secondary text-xs">{ar ? 'الإعدادات' : 'Settings'}</a>
        </div>

        {/* Open restock alerts */}
        {alerts.length > 0 && (
          <div className="card border-yellow-500/40">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={16} className="text-yellow-400" />
              <h2 className="text-white font-semibold">{ar ? 'تنبيهات إعادة التموين' : 'Open restock alerts'}</h2>
              <span className="text-xs text-noch-muted ms-auto">{alerts.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {alerts.map(a => (
                <div key={a.id} className="flex items-center gap-3 bg-noch-dark/40 rounded-lg px-3 py-2">
                  <div className="flex-1 text-sm">
                    <p className="text-white font-medium">{ar ? a.item?.name_ar : a.item?.name_en}</p>
                    <p className="text-noch-muted text-xs">
                      {ar ? 'الكميّة المسجّلة' : 'recorded'}: <span className="text-yellow-300">{a.recorded_qty}</span> {a.item?.unit}
                      {' '}· {ar ? 'الحدّ' : 'par'}: <span className="text-noch-green">{a.par_level}</span>
                    </p>
                  </div>
                  <button onClick={() => onAck(a.id)} className="btn-secondary text-xs">
                    {ar ? 'إقرار' : 'Acknowledge'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Today's grid */}
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <ClipboardList size={16} className="text-noch-green" />
            <h2 className="text-white font-semibold">{ar ? 'مهام اليوم' : "Today's tasks"}</h2>
          </div>
          {loading ? <p className="text-noch-muted text-center py-6">…</p>
            : instances.length === 0 ? <p className="text-noch-muted text-sm">{ar ? 'لا توجد مهام لليوم.' : 'No tasks for today.'}</p>
            : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-noch-muted text-xs">
                    <tr>
                      <th className="text-left py-1">{ar ? 'الوردية' : 'Window'}</th>
                      <th className="text-left py-1">{ar ? 'المهمة' : 'Task'}</th>
                      <th className="text-left py-1">{ar ? 'الحالة' : 'Status'}</th>
                      <th className="text-left py-1">{ar ? 'بواسطة' : 'By'}</th>
                      <th className="text-left py-1">{ar ? 'الوقت' : 'When'}</th>
                      <th className="text-right py-1">{ar ? 'القيمة' : 'Value'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {instances
                      .slice()
                      .sort((a, b) => {
                        const ao = a.template?.window?.sort_order ?? 0
                        const bo = b.template?.window?.sort_order ?? 0
                        if (ao !== bo) return ao - bo
                        return (a.template?.sort_order ?? 0) - (b.template?.sort_order ?? 0)
                      })
                      .map(i => (
                      <tr key={i.id} className="border-t border-noch-border/40">
                        <td className="py-1.5 text-noch-muted">{ar ? i.template?.window?.name_ar : i.template?.window?.name_en}</td>
                        <td className="py-1.5 text-white">{ar ? i.template?.title_ar : i.template?.title_en}</td>
                        <td className="py-1.5 flex items-center gap-1.5">
                          {STATUS_ICON[i.status]}
                          <span className="capitalize text-noch-muted text-xs">{i.status}</span>
                        </td>
                        <td className="py-1.5 text-noch-muted text-xs">{i.completed_by_profile?.full_name || '—'}</td>
                        <td className="py-1.5 text-noch-muted text-xs">{i.completed_at ? new Date(i.completed_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                        <td className="py-1.5 text-right font-mono">{i.value_recorded != null ? i.value_recorded : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </div>

        {/* 7-day completion */}
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 size={16} className="text-noch-green" />
            <h2 className="text-white font-semibold">{ar ? 'نسبة الإنجاز (٧ أيام)' : '7-day completion rate'}</h2>
          </div>
          {rates.length === 0 ? <p className="text-noch-muted text-sm">{ar ? 'لا توجد بيانات بعد.' : 'No data yet.'}</p> : (
            <div className="flex flex-col gap-2">
              {rates.map((w, i) => {
                const pct = w.rate == null ? null : Math.round(w.rate * 100)
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-white text-sm w-28 truncate">{ar ? w.name_ar : w.name_en}</span>
                    <div className="flex-1 h-2 bg-noch-border rounded-full overflow-hidden">
                      <div className="h-full bg-noch-green/60" style={{ width: `${pct ?? 0}%` }} />
                    </div>
                    <span className="font-mono text-noch-muted text-xs w-12 text-right">{pct == null ? '—' : `${pct}%`}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
