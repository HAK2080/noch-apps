import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Lock,
  Package,
  RefreshCw,
} from 'lucide-react'

import BusinessRangePicker from '../../../components/shared/BusinessRangePicker'
import Layout from '../../../components/Layout'
import { useAuth } from '../../../contexts/AuthContext'
import { useLanguage } from '../../../contexts/LanguageContext'
import { usePermissions } from '../../../contexts/PermissionsContext'
import {
  businessToday,
  getPOSBranch,
  getShiftControls,
  localYmd,
} from '../lib/pos-supabase'
import {
  combineShiftControls,
  normalizeShiftControl,
} from '../lib/sales-control'
import { getServedBy } from '../lib/pos-session'
import toast from 'react-hot-toast'

const COPY = {
  en: {
    title: 'Shift cash control',
    accessTitle: 'Access restricted',
    accessBody: 'Shift totals and drawer counts are visible to owners and managers only.',
    back: 'Back to POS',
    today: 'Today',
    sevenDays: '7 days',
    thirtyDays: '30 days',
    refresh: 'Refresh',
    loading: 'Loading shifts…',
    loadFailed: 'Failed to load shift controls',
    empty: 'No shifts in this business-day range.',
    shifts: 'shifts',
    netSales: 'Net sales in shifts',
    orders: 'Orders',
    netCash: 'Net cash tender',
    netCard: 'Net card tender',
    netPresto: 'Net Presto tender',
    refunds: 'Refunds returned',
    paymentReconciliation: 'Payment reconciliation',
    reconciled: 'Reconciled',
    gap: 'Gap',
    historicalNotice: 'Historical refund tender was reconstructed from the original order and is visibly flagged.',
    missingCount: 'closed shift(s) have no physical cash count',
    untracked: 'order(s) have no tender event',
    open: 'Open',
    closed: 'Closed',
    closeShift: 'Close shift',
    duration: 'Duration',
    expectedCash: 'Expected drawer',
    countedCash: 'Counted drawer',
    notCounted: 'Not counted',
    cashVariance: 'Cash variance',
    over: 'over',
    short: 'short',
    noVariance: 'balanced',
    sourceWarning: 'Reconstructed history',
    counterWarning: 'Stored counter differs',
    currency: 'LYD',
    hour: 'h',
    minute: 'm',
  },
  ar: {
    title: 'رقابة النقدية والورديات',
    accessTitle: 'الدخول مقيّد',
    accessBody: 'إجماليات الورديات وعدّ الصندوق متاحة للمالك والمديرين فقط.',
    back: 'العودة إلى نقطة البيع',
    today: 'اليوم',
    sevenDays: '7 أيام',
    thirtyDays: '30 يوماً',
    refresh: 'تحديث',
    loading: 'جارٍ تحميل الورديات…',
    loadFailed: 'تعذر تحميل رقابة الورديات',
    empty: 'لا توجد ورديات في نطاق أيام العمل المحدد.',
    shifts: 'ورديات',
    netSales: 'صافي المبيعات في الورديات',
    orders: 'الطلبات',
    netCash: 'صافي النقدية',
    netCard: 'صافي البطاقة',
    netPresto: 'صافي بريستو',
    refunds: 'المبالغ المرتجعة',
    paymentReconciliation: 'مطابقة المدفوعات',
    reconciled: 'متطابق',
    gap: 'فرق',
    historicalNotice: 'تم استنتاج وسيلة رد المبالغ التاريخية من الطلب الأصلي ويظهر ذلك بوضوح.',
    missingCount: 'وردية مغلقة بلا عدّ نقدي فعلي',
    untracked: 'طلب بلا حركة دفع',
    open: 'مفتوحة',
    closed: 'مغلقة',
    closeShift: 'إقفال الوردية',
    duration: 'المدة',
    expectedCash: 'النقدية المتوقعة',
    countedCash: 'النقدية المعدودة',
    notCounted: 'لم يتم العد',
    cashVariance: 'فرق النقدية',
    over: 'زيادة',
    short: 'عجز',
    noVariance: 'متوازن',
    sourceWarning: 'سجل تاريخي مستنتج',
    counterWarning: 'عداد مخزن مختلف',
    currency: 'د.ل',
    hour: 'س',
    minute: 'د',
  },
}

function formatDuration(openedAt, closedAt, copy) {
  if (!openedAt) return '—'
  const end = closedAt ? new Date(closedAt) : new Date()
  const mins = Math.max(0, Math.round((end - new Date(openedAt)) / 60000))
  const hours = Math.floor(mins / 60)
  const minutes = mins % 60
  return hours
    ? `${hours}${copy.hour} ${minutes}${copy.minute}`
    : `${minutes}${copy.minute}`
}

function formatWhen(value, lang) {
  if (!value) return '—'
  return new Date(value).toLocaleString(lang === 'ar' ? 'ar-LY' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const money = value => Number(value || 0).toLocaleString('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function CashVariance({ shift, copy }) {
  if (shift.status !== 'closed') return null
  if (!shift.cash_counted) {
    return <span className="text-red-300">{copy.notCounted}</span>
  }

  const variance = Number(shift.cash_variance || 0)
  const label = variance > 0 ? copy.over : variance < 0 ? copy.short : copy.noVariance
  const tone = variance === 0 ? 'text-noch-green' : variance < 0 ? 'text-red-300' : 'text-yellow-300'
  return (
    <span className={tone}>
      {copy.cashVariance}: {variance > 0 ? '+' : ''}{money(variance)} ({label})
    </span>
  )
}

export default function POSSessions() {
  const { branchId } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { lang } = useLanguage()
  const { isOwner, hasAccess } = usePermissions()
  const copy = COPY[lang] || COPY.en
  const allowed = isOwner || hasAccess('sales')
    || ['owner', 'supervisor'].includes(getServedBy()?.role)
    || profile?.role === 'supervisor'

  const [branch, setBranch] = useState(null)
  const [shifts, setShifts] = useState([])
  const [loading, setLoading] = useState(true)
  const presets = [
    { key: 'today', label: copy.today, days: 0 },
    { key: '7d', label: copy.sevenDays, days: 6 },
    { key: '30d', label: copy.thirtyDays, days: 29 },
  ]
  const [range, setRange] = useState(() => {
    const to = businessToday()
    const from = businessToday()
    from.setDate(from.getDate() - 29)
    return { preset: '30d', fromDate: localYmd(from), toDate: localYmd(to) }
  })

  const load = async () => {
    if (!allowed) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [branchRow, controlRows] = await Promise.all([
        getPOSBranch(branchId),
        getShiftControls(branchId, range.fromDate, range.toDate),
      ])
      setBranch(branchRow)
      setShifts((controlRows || []).map(normalizeShiftControl))
    } catch (error) {
      toast.error(error.message || copy.loadFailed)
    } finally {
      setLoading(false)
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [branchId, allowed, range.fromDate, range.toDate])

  if (!allowed) {
    return (
      <Layout>
        <div className="max-w-md mx-auto py-16 text-center">
          <Lock size={36} className="text-noch-muted mx-auto mb-3" />
          <h1 className="text-white font-bold text-lg mb-2">{copy.accessTitle}</h1>
          <p className="text-noch-muted text-sm mb-5">{copy.accessBody}</p>
          <button onClick={() => navigate(`/pos/${branchId}`)} className="btn-secondary text-sm">
            {copy.back}
          </button>
        </div>
      </Layout>
    )
  }

  const totals = combineShiftControls(shifts)
  const paymentReconciled = Math.abs(totals.paymentVariance) < 0.005

  return (
    <Layout>
      <div className="max-w-5xl mx-auto" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => navigate(`/pos/${branchId}`)} className="p-2 text-noch-muted hover:text-white">
            <ArrowLeft size={18} className="rtl:rotate-180" />
          </button>
          <div className="flex-1">
            <h1 className="text-white font-bold text-xl">{copy.title}</h1>
            <p className="text-noch-muted text-sm">
              {loading
                ? copy.loading
                : `${lang === 'ar' ? (branch?.name_ar || branch?.name) : branch?.name} · ${range.fromDate} → ${range.toDate} · ${totals.shiftCount} ${copy.shifts}`}
            </p>
          </div>
          <button onClick={load} className="btn-secondary text-sm px-3 py-1 flex items-center gap-1">
            <RefreshCw size={13} /> {copy.refresh}
          </button>
        </div>

        <div className="mb-4">
          <BusinessRangePicker
            presets={presets}
            value={{ preset: range.preset, from: range.fromDate, to: range.toDate }}
            onChange={next => setRange({
              preset: next.preset,
              fromDate: next.from,
              toDate: next.to,
            })}
          />
        </div>

        {!loading && shifts.length > 0 && (
          <>
            <div className="card p-4 mb-4">
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                {[
                  [copy.netSales, totals.netSales, 'text-noch-green'],
                  [copy.orders, totals.orderCount, 'text-white'],
                  [copy.netCash, totals.cash, 'text-yellow-300'],
                  [copy.netCard, totals.card, 'text-blue-300'],
                  [copy.netPresto, totals.presto, 'text-purple-300'],
                  [copy.refunds, totals.refunds, 'text-red-300'],
                ].map(([label, value, tone]) => (
                  <div key={label}>
                    <p className="text-noch-muted text-[10px] uppercase tracking-wider">{label}</p>
                    <p className={`${tone} font-bold text-lg leading-tight`}>{money(value)}</p>
                    <p className="text-noch-muted text-[10px]">{label === copy.orders ? '' : copy.currency}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-3 border-t border-noch-border/40 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-noch-muted">{copy.paymentReconciliation}</span>
                {paymentReconciled ? (
                  <span className="text-noch-green flex items-center gap-1">
                    <CheckCircle2 size={13} /> {copy.reconciled}
                  </span>
                ) : (
                  <span className="text-yellow-300 flex items-center gap-1">
                    <AlertTriangle size={13} /> {copy.gap} {money(totals.paymentVariance)} {copy.currency}
                  </span>
                )}
              </div>
            </div>

            {(totals.reconstructedEvents > 0 || totals.untrackedOrders > 0 || totals.missingCounts > 0) && (
              <div className="rounded-xl border border-yellow-400/30 bg-yellow-400/10 p-3 mb-4 text-xs text-yellow-100">
                {totals.reconstructedEvents > 0 && <p>{copy.historicalNotice}</p>}
                {totals.untrackedOrders > 0 && <p>{totals.untrackedOrders} {copy.untracked}</p>}
                {totals.missingCounts > 0 && <p>{totals.missingCounts} {copy.missingCount}</p>}
              </div>
            )}
          </>
        )}

        {loading ? (
          <p className="text-noch-muted text-center py-12">{copy.loading}</p>
        ) : shifts.length === 0 ? (
          <p className="text-noch-muted text-center py-12 text-sm">{copy.empty}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {shifts.map(shift => {
              const isOpen = shift.status === 'open'
              return (
                <div
                  key={shift.shift_id}
                  className={`card p-4 ${isOpen ? 'border-noch-green/40' : ''}`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-white font-semibold">{formatWhen(shift.opened_at, lang)}</span>
                        <span className="text-noch-muted">→</span>
                        <span className={isOpen ? 'text-noch-green' : 'text-white'}>
                          {isOpen ? copy.open : formatWhen(shift.closed_at, lang)}
                        </span>
                      </div>
                      <div className="text-noch-muted text-xs mt-1 flex flex-wrap gap-x-3 gap-y-1">
                        <span><Clock size={10} className="inline me-1" />{copy.duration}: {formatDuration(shift.opened_at, shift.closed_at, copy)}</span>
                        <span><Package size={10} className="inline me-1" />{shift.order_count} {copy.orders}</span>
                        {shift.refunds > 0 && <span className="text-red-300">{copy.refunds}: {money(shift.refunds)}</span>}
                        <CashVariance shift={shift} copy={copy} />
                        {shift.dataStatus === 'warning' && <span className="text-yellow-300">{copy.sourceWarning}</span>}
                        {shift.counterStatus === 'warning' && <span className="text-yellow-300">{copy.counterWarning}</span>}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                      {[
                        [copy.netCash, shift.net_cash_tender],
                        [copy.netCard, shift.net_card_tender],
                        [copy.netPresto, shift.net_presto_tender],
                        [copy.expectedCash, shift.expected_drawer_cash],
                        [copy.countedCash, shift.counted_drawer_cash],
                      ].map(([label, value]) => (
                        <div key={label} className="text-end">
                          <p className="text-noch-muted text-[10px] uppercase">{label}</p>
                          <p className="text-white font-semibold">
                            {value == null ? copy.notCounted : money(value)}
                          </p>
                        </div>
                      ))}
                    </div>

                    {isOpen && (
                      <button
                        onClick={() => navigate(`/pos/${branchId}/end-of-day`)}
                        className="btn-primary text-xs px-3 py-2 whitespace-nowrap"
                      >
                        {copy.closeShift}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Layout>
  )
}
