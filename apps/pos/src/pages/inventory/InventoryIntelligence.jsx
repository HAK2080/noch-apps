import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  Package,
  RefreshCw,
  Settings,
} from 'lucide-react'
import Layout from '../../components/Layout'
import BackButton from '../../components/shared/BackButton'
import { useLanguage } from '../../contexts/LanguageContext'
import { downloadCsv } from '../../lib/exportCsv'
import { supabase } from '../../lib/supabase'
import {
  buildInventoryControlReport,
  inventoryControlExportRows,
} from './lib/inventoryIntelligence'

const STATUS_META = {
  out: {
    en: 'Out of stock',
    ar: 'نفد المخزون',
    className: 'border-red-500/30 bg-red-500/10 text-red-300',
  },
  below_minimum: {
    en: 'Below minimum',
    ar: 'أقل من الحد الأدنى',
    className: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  },
  near_minimum: {
    en: 'Near minimum',
    ar: 'قريب من الحد الأدنى',
    className: 'border-yellow-300/30 bg-yellow-300/10 text-yellow-200',
  },
  unconfigured: {
    en: 'Threshold missing',
    ar: 'الحد الأدنى غير محدد',
    className: 'border-slate-400/30 bg-slate-400/10 text-slate-300',
  },
  healthy: {
    en: 'Healthy',
    ar: 'سليم',
    className: 'border-noch-green/30 bg-noch-green/10 text-noch-green',
  },
}

function formatQuantity(value) {
  return Number(value || 0).toLocaleString('en-GB', {
    maximumFractionDigits: 3,
  })
}

function MetricCard({ label, value, detail, tone = 'text-white', icon }) {
  const MetricIcon = icon
  return (
    <div className="rounded-xl border border-noch-border bg-noch-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-noch-muted text-[11px] uppercase tracking-wider">{label}</p>
          <p className={`text-2xl font-bold mt-1 ${tone}`}>{value}</p>
          <p className="text-noch-muted text-xs mt-1">{detail}</p>
        </div>
        <MetricIcon size={18} className={tone} />
      </div>
    </div>
  )
}

function StatusBadge({ status, arabic }) {
  const meta = STATUS_META[status] || STATUS_META.unconfigured
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-1 text-[11px] font-semibold ${meta.className}`}>
      {arabic ? meta.ar : meta.en}
    </span>
  )
}

export default function InventoryIntelligence() {
  const { lang } = useLanguage()
  const arabic = lang === 'ar'
  const copy = (english, arabicText) => arabic ? arabicText : english
  const [sourceRows, setSourceRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshedAt, setRefreshedAt] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data, error: queryError } = await supabase.rpc('inventory_theoretical_status')
    if (queryError) {
      setError(queryError.message || 'Inventory report could not be loaded')
      setLoading(false)
      return
    }
    setSourceRows(data || [])
    setRefreshedAt(new Date())
    setLoading(false)
  }, [])

  useEffect(() => {
    let active = true
    supabase.rpc('inventory_theoretical_status').then(({ data, error: queryError }) => {
      if (!active) return
      if (queryError) {
        setError(queryError.message || 'Inventory report could not be loaded')
      } else {
        setSourceRows(data || [])
        setRefreshedAt(new Date())
      }
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [])

  const report = useMemo(
    () => buildInventoryControlReport(sourceRows),
    [sourceRows],
  )

  const exportReport = () => {
    downloadCsv(
      `inventory_control_report_${new Date().toISOString().slice(0, 10)}`,
      [
        'ingredient',
        'status',
        'last_counted_qty',
        'recipe_usage_since_count',
        'estimated_on_hand',
        'minimum_threshold',
        'threshold_configured',
        'count_freshness',
        'last_counted_at',
        'unit',
      ],
      inventoryControlExportRows(report.rows),
    )
  }

  const locale = arabic ? 'ar-LY' : 'en-GB'
  const belowOrNear = report.statusCounts.below_minimum + report.statusCounts.near_minimum

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-6">
        <BackButton to="/inventory" />

        <div className="flex flex-col gap-4 mt-3 mb-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-white font-bold text-2xl">
              {copy('Inventory Control Report', 'تقرير الرقابة على المخزون')}
            </h1>
            <p className="text-noch-muted text-sm mt-1 max-w-3xl">
              {copy(
                'Estimated on-hand quantity equals the last physical count minus recipe usage from completed POS orders.',
                'الكمية التقديرية المتاحة تساوي آخر جرد فعلي ناقص استهلاك الوصفات من طلبات نقاط البيع المكتملة.',
              )}
            </p>
            <p className="text-noch-muted text-xs mt-2">
              {refreshedAt
                ? `${copy('Data refreshed', 'تم تحديث البيانات')}: ${refreshedAt.toLocaleString(locale)}`
                : copy('Waiting for current data', 'بانتظار البيانات الحالية')}
            </p>
          </div>
          <div className="flex gap-2 no-print">
            <button
              onClick={exportReport}
              disabled={loading || report.total === 0}
              className="btn-secondary text-sm flex items-center gap-2 disabled:opacity-50"
            >
              <Download size={15} />
              {copy('Export evidence', 'تصدير البيانات')}
            </button>
            <button
              onClick={load}
              disabled={loading}
              className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50"
            >
              {loading
                ? <Loader2 size={15} className="animate-spin" />
                : <RefreshCw size={15} />}
              {copy('Refresh', 'تحديث')}
            </button>
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-5">
            <p className="text-red-300 font-semibold">
              {copy('Inventory data is unavailable', 'بيانات المخزون غير متاحة')}
            </p>
            <p className="text-red-200/70 text-sm mt-1">{error}</p>
            <button onClick={load} className="btn-secondary text-sm mt-4">
              {copy('Try again', 'إعادة المحاولة')}
            </button>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center gap-2 py-24 text-noch-muted">
            <Loader2 size={22} className="animate-spin" />
            {copy('Calculating inventory controls…', 'جارٍ احتساب مؤشرات المخزون…')}
          </div>
        ) : report.total === 0 ? (
          <div className="rounded-xl border border-noch-border bg-noch-card p-8 text-center">
            <Package size={24} className="text-noch-muted mx-auto mb-3" />
            <p className="text-white font-semibold">
              {copy('No tracked ingredient stock', 'لا يوجد مخزون مكونات متابع')}
            </p>
            <p className="text-noch-muted text-sm mt-1">
              {copy(
                'Add ingredients and record a physical count before using this report.',
                'أضف المكونات وسجل جرداً فعلياً قبل استخدام هذا التقرير.',
              )}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <MetricCard
                label={copy('Tracked ingredients', 'المكونات المتابعة')}
                value={report.total}
                detail={copy('Included in this report', 'مدرجة في هذا التقرير')}
                icon={Package}
              />
              <MetricCard
                label={copy('Out of stock', 'نفد المخزون')}
                value={report.statusCounts.out}
                detail={copy('Estimated on hand is zero', 'المتاح التقديري يساوي صفراً')}
                tone="text-red-300"
                icon={AlertTriangle}
              />
              <MetricCard
                label={copy('Needs attention', 'يحتاج متابعة')}
                value={belowOrNear}
                detail={copy('Below or near minimum', 'أقل من الحد الأدنى أو قريب منه')}
                tone="text-amber-300"
                icon={AlertTriangle}
              />
              <MetricCard
                label={copy('Stale counts', 'جرد قديم')}
                value={report.staleCount}
                detail={copy('Last physical count is over 7 days old', 'آخر جرد فعلي أقدم من 7 أيام')}
                tone={report.staleCount ? 'text-yellow-200' : 'text-noch-green'}
                icon={CheckCircle2}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <div className="rounded-xl border border-noch-border bg-noch-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-white font-semibold text-sm">
                      {copy('Threshold coverage', 'تغطية حدود إعادة الطلب')}
                    </p>
                    <p className="text-noch-muted text-xs mt-1">
                      {report.configuredCount} / {report.total} {copy('ingredients configured', 'مكونات تم إعدادها')}
                    </p>
                  </div>
                  <p className="text-white font-bold text-xl">
                    {report.thresholdCoveragePct ?? '—'}%
                  </p>
                </div>
                <div className="h-2 rounded-full bg-black/30 mt-3 overflow-hidden">
                  <div
                    className="h-full bg-blue-400"
                    style={{ width: `${report.thresholdCoveragePct || 0}%` }}
                  />
                </div>
              </div>
              <div className="rounded-xl border border-noch-border bg-noch-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-white font-semibold text-sm">
                      {copy('Healthy configured stock', 'المخزون السليم المهيأ')}
                    </p>
                    <p className="text-noch-muted text-xs mt-1">
                      {copy(
                        'Share of threshold-configured items safely above 150% of minimum',
                        'نسبة العناصر المهيأة التي تتجاوز 150٪ من الحد الأدنى بأمان',
                      )}
                    </p>
                  </div>
                  <p className="text-noch-green font-bold text-xl">
                    {report.healthyConfiguredPct ?? '—'}{report.healthyConfiguredPct == null ? '' : '%'}
                  </p>
                </div>
                <div className="h-2 rounded-full bg-black/30 mt-3 overflow-hidden">
                  <div
                    className="h-full bg-noch-green"
                    style={{ width: `${report.healthyConfiguredPct || 0}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-noch-border bg-noch-card overflow-hidden">
              <div className="p-4 border-b border-noch-border">
                <h2 className="text-white font-semibold">
                  {copy('Inventory evidence', 'أدلة المخزون')}
                </h2>
                <p className="text-noch-muted text-xs mt-1">
                  {copy(
                    'Rows are sorted by operational risk. “Estimated on hand” is not a physical count.',
                    'تم ترتيب الصفوف حسب المخاطر التشغيلية. «المتاح التقديري» ليس جرداً فعلياً.',
                  )}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-black/20 text-noch-muted">
                    <tr>
                      <th className="text-left px-4 py-3">{copy('Ingredient', 'المكون')}</th>
                      <th className="text-left px-3 py-3">{copy('Status', 'الحالة')}</th>
                      <th className="text-right px-3 py-3">{copy('Last count', 'آخر جرد')}</th>
                      <th className="text-right px-3 py-3">{copy('Recipe usage', 'استهلاك الوصفات')}</th>
                      <th className="text-right px-3 py-3">{copy('Estimated on hand', 'المتاح التقديري')}</th>
                      <th className="text-right px-3 py-3">{copy('Minimum', 'الحد الأدنى')}</th>
                      <th className="text-right px-4 py-3">{copy('Counted at', 'تاريخ الجرد')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map(row => (
                      <tr key={row.ingredientId || row.name} className="border-t border-noch-border/50">
                        <td className="px-4 py-3 text-white font-medium min-w-44">
                          {row.name}
                          <span className="block text-noch-muted text-[10px] mt-0.5">{row.unit || '—'}</span>
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge status={row.status} arabic={arabic} />
                        </td>
                        <td className="px-3 py-3 text-right text-white tabular-nums">
                          {formatQuantity(row.countedQty)}
                        </td>
                        <td className="px-3 py-3 text-right text-noch-muted tabular-nums">
                          {formatQuantity(row.consumedSinceCount)}
                        </td>
                        <td className="px-3 py-3 text-right text-white font-semibold tabular-nums">
                          {formatQuantity(row.theoreticalQty)}
                        </td>
                        <td className="px-3 py-3 text-right text-noch-muted tabular-nums">
                          {row.thresholdConfigured ? formatQuantity(row.minThreshold) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <p className={row.countIsStale ? 'text-yellow-200' : 'text-noch-muted'}>
                            {row.lastCountedAt
                              ? new Date(row.lastCountedAt).toLocaleDateString(locale)
                              : copy('Never', 'لم يتم')}
                          </p>
                          {row.countIsStale && (
                            <p className="text-yellow-200/70 text-[10px] mt-0.5">
                              {copy('Stale', 'قديم')}
                            </p>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-xl border border-blue-400/20 bg-blue-400/5 p-4 mt-4 flex gap-3">
              <Settings size={17} className="text-blue-300 shrink-0 mt-0.5" />
              <div>
                <p className="text-blue-200 font-semibold text-sm">
                  {copy('How to interpret this report', 'كيفية قراءة هذا التقرير')}
                </p>
                <p className="text-blue-200/70 text-xs mt-1 leading-relaxed">
                  {copy(
                    'Completed POS orders reduce theoretical stock through configured recipes. Refunds, waste, transfers, missing recipes, and unrecorded physical movements can create differences, so stale or high-risk rows should be physically counted before purchasing decisions.',
                    'تخفض طلبات نقاط البيع المكتملة المخزون النظري عبر الوصفات المهيأة. قد تؤدي المرتجعات والهدر والتحويلات والوصفات الناقصة والحركات غير المسجلة إلى فروقات، لذلك يجب جرد الصفوف القديمة أو عالية المخاطر فعلياً قبل اتخاذ قرارات الشراء.',
                  )}
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  )
}
