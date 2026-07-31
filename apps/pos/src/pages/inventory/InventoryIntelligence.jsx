import { createElement, useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  MapPin,
  Package,
  RefreshCw,
  UtensilsCrossed,
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
    en: 'Out',
    ar: 'نافد',
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
    en: 'Above minimum',
    ar: 'فوق الحد الأدنى',
    className: 'border-noch-green/30 bg-noch-green/10 text-noch-green',
  },
}

function formatQuantity(value) {
  if (value == null) return '—'
  return Number(value).toLocaleString('en-GB', { maximumFractionDigits: 3 })
}

function MetricCard({ label, value, detail, tone = 'text-white', icon }) {
  return (
    <div className="rounded-xl border border-noch-border bg-noch-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-noch-muted text-[11px] uppercase tracking-wider">{label}</p>
          <p className={`text-2xl font-bold mt-1 ${tone}`}>{value}</p>
          <p className="text-noch-muted text-xs mt-1">{detail}</p>
        </div>
        {createElement(icon, { size: 18, className: tone })}
      </div>
    </div>
  )
}

export default function InventoryIntelligence() {
  const { lang } = useLanguage()
  const arabic = lang === 'ar'
  const copy = (english, arabicText) => arabic ? arabicText : english
  const [sourceRows, setSourceRows] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshedAt, setRefreshedAt] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const [statusResult, summaryResult] = await Promise.all([
      supabase.rpc('inventory_control_status_v2'),
      supabase.rpc('inventory_control_summary'),
    ])
    const queryError = statusResult.error || summaryResult.error
    if (queryError) {
      setError(queryError.message || (arabic ? 'تعذر تحميل تقرير المخزون' : 'Inventory report could not be loaded'))
    } else {
      setSourceRows(statusResult.data || [])
      setSummary(summaryResult.data || null)
      setRefreshedAt(new Date())
    }
    setLoading(false)
  }, [arabic])

  useEffect(() => {
    let active = true
    Promise.all([
      supabase.rpc('inventory_control_status_v2'),
      supabase.rpc('inventory_control_summary'),
    ]).then(([statusResult, summaryResult]) => {
      if (!active) return
      const queryError = statusResult.error || summaryResult.error
      if (queryError) {
        setError(queryError.message || (arabic ? 'تعذر تحميل تقرير المخزون' : 'Inventory report could not be loaded'))
      } else {
        setSourceRows(statusResult.data || [])
        setSummary(summaryResult.data || null)
        setRefreshedAt(new Date())
      }
      setLoading(false)
    })
    return () => { active = false }
  }, [arabic])

  const report = useMemo(
    () => buildInventoryControlReport(sourceRows),
    [sourceRows],
  )
  const locale = arabic ? 'ar-LY' : 'en-GB'
  const attentionCount = report.statusCounts.out
    + report.statusCounts.below_minimum
    + report.statusCounts.near_minimum

  const exportReport = () => {
    downloadCsv(
      `inventory_control_evidence_${new Date().toISOString().slice(0, 10)}`,
      [
        'ingredient',
        'status',
        'physical_balance',
        'explicit_recipe_usage_since_count',
        'estimated_on_hand',
        'recipe_usage_status',
        'minimum_threshold',
        'threshold_configured',
        'count_freshness',
        'last_counted_at',
        'location_count',
        'location_total',
        'location_variance',
        'unit',
      ],
      inventoryControlExportRows(report.rows),
    )
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-6">
        <BackButton to="/inventory" />

        <div className="flex flex-col gap-4 mt-3 mb-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-white font-bold text-2xl">
              {copy('Inventory Control', 'الرقابة على المخزون')}
            </h1>
            <p className="text-noch-muted text-sm mt-1 max-w-3xl">
              {copy(
                'Physical counts are the baseline. Estimated usage appears only when an explicit product recipe exists; missing evidence is never treated as zero.',
                'الجرد الفعلي هو الأساس. يظهر الاستهلاك التقديري فقط عند وجود وصفة مرتبطة بالمنتج، ولا تُعامل البيانات المفقودة كأنها صفر.',
              )}
            </p>
            <p className="text-noch-muted text-xs mt-2">
              {refreshedAt
                ? `${copy('Refreshed', 'آخر تحديث')}: ${refreshedAt.toLocaleString(locale)}`
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
              {copy('Export evidence', 'تصدير الأدلة')}
            </button>
            <button
              onClick={load}
              disabled={loading}
              className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50"
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
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
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center gap-2 py-24 text-noch-muted">
            <Loader2 size={22} className="animate-spin" />
            {copy('Loading inventory controls…', 'جارٍ تحميل ضوابط المخزون…')}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <MetricCard
                label={copy('Needs attention', 'يحتاج متابعة')}
                value={attentionCount}
                detail={copy('Out, below, or near minimum', 'نافد أو أقل من الحد أو قريب منه')}
                tone={attentionCount ? 'text-amber-300' : 'text-noch-green'}
                icon={AlertTriangle}
              />
              <MetricCard
                label={copy('Stale counts', 'جرد قديم')}
                value={report.staleCount}
                detail={copy('More than 7 days old', 'أقدم من 7 أيام')}
                tone={report.staleCount ? 'text-yellow-200' : 'text-noch-green'}
                icon={CheckCircle2}
              />
              <MetricCard
                label={copy('Recipe usage unavailable', 'استهلاك الوصفات غير متاح')}
                value={report.recipeUsageUnavailableCount}
                detail={copy(
                  `${summary?.recipe_coverage_pct ?? 0}% of sold products have recipes`,
                  `${summary?.recipe_coverage_pct ?? 0}% من المنتجات المباعة مرتبطة بوصفات`,
                )}
                tone={report.recipeUsageUnavailableCount ? 'text-red-300' : 'text-noch-green'}
                icon={UtensilsCrossed}
              />
              <MetricCard
                label={copy('Location variances', 'فروقات المواقع')}
                value={report.locationVarianceCount}
                detail={copy(
                  `${report.missingLocationCount} ingredients have no location count`,
                  `${report.missingLocationCount} مكوّنًا بلا جرد للموقع`,
                )}
                tone={report.locationVarianceCount || report.missingLocationCount ? 'text-amber-300' : 'text-noch-green'}
                icon={MapPin}
              />
            </div>

            <div className="rounded-xl border border-blue-400/20 bg-blue-400/5 p-4 mb-4">
              <p className="text-blue-200 font-semibold text-sm">
                {copy('Current evidence status', 'حالة الأدلة الحالية')}
              </p>
              <p className="text-blue-200/70 text-xs mt-1 leading-relaxed">
                {copy(
                  `${summary?.open_procurement_orders ?? 0} open procurement orders, ${summary?.open_transfers ?? 0} open transfers, and ${summary?.negative_product_locations ?? 0} negative product-location balances. Ingredient source: stock and stock logs. Product source: location stock and location movements.`,
                  `${summary?.open_procurement_orders ?? 0} أوامر شراء مفتوحة، و${summary?.open_transfers ?? 0} تحويلات مفتوحة، و${summary?.negative_product_locations ?? 0} أرصدة سالبة لمنتجات في المواقع. مصدر المكوّنات: المخزون وسجل الحركات. مصدر المنتجات: مخزون المواقع وحركاته.`,
                )}
              </p>
            </div>

            {report.total === 0 ? (
              <div className="rounded-xl border border-noch-border bg-noch-card p-8 text-center">
                <Package size={24} className="text-noch-muted mx-auto mb-3" />
                <p className="text-white font-semibold">
                  {copy('No tracked ingredient stock', 'لا يوجد مخزون مكوّنات متابع')}
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-noch-border bg-noch-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[920px] text-sm">
                    <thead className="border-b border-noch-border text-noch-muted text-xs">
                      <tr>
                        <th className="text-start px-4 py-3">{copy('Ingredient', 'المكوّن')}</th>
                        <th className="text-start px-3 py-3">{copy('Control', 'الحالة')}</th>
                        <th className="text-end px-3 py-3">{copy('Physical balance', 'الرصيد الفعلي')}</th>
                        <th className="text-end px-3 py-3">{copy('Recipe usage', 'استهلاك الوصفة')}</th>
                        <th className="text-end px-3 py-3">{copy('Estimated now', 'التقدير الحالي')}</th>
                        <th className="text-end px-3 py-3">{copy('Minimum', 'الحد الأدنى')}</th>
                        <th className="text-end px-3 py-3">{copy('Location total', 'إجمالي المواقع')}</th>
                        <th className="text-end px-4 py-3">{copy('Last count', 'آخر جرد')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-noch-border/60">
                      {report.rows.map(row => {
                        const meta = STATUS_META[row.status] || STATUS_META.unconfigured
                        return (
                          <tr key={row.ingredientId} className="hover:bg-white/[0.02]">
                            <td className="px-4 py-3">
                              <p className="text-white font-medium">{arabic && row.nameAr ? row.nameAr : row.name}</p>
                              {arabic && row.nameAr && <p className="text-noch-muted text-xs">{row.name}</p>}
                            </td>
                            <td className="px-3 py-3">
                              <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${meta.className}`}>
                                {arabic ? meta.ar : meta.en}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-end text-white tabular-nums">
                              {formatQuantity(row.countedQty)} {row.unit}
                            </td>
                            <td className="px-3 py-3 text-end tabular-nums">
                              {row.recipeUsageAvailable ? (
                                <span className="text-yellow-200">-{formatQuantity(row.consumedSinceCount)} {row.unit}</span>
                              ) : (
                                <span className="text-red-300">{copy('Unavailable', 'غير متاح')}</span>
                              )}
                            </td>
                            <td className="px-3 py-3 text-end text-white tabular-nums">
                              {formatQuantity(row.theoreticalQty)} {row.theoreticalQty == null ? '' : row.unit}
                            </td>
                            <td className="px-3 py-3 text-end text-noch-muted tabular-nums">
                              {row.thresholdConfigured ? `${formatQuantity(row.minThreshold)} ${row.unit}` : '—'}
                            </td>
                            <td className="px-3 py-3 text-end tabular-nums">
                              {row.locationCount ? (
                                <span className={Math.abs(row.locationVariance || 0) > 0.001 ? 'text-amber-300' : 'text-white'}>
                                  {formatQuantity(row.locationQty)} {row.unit}
                                </span>
                              ) : (
                                <span className="text-noch-muted">{copy('Not counted', 'لم يُجرد')}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-end">
                              <p className={row.countIsStale ? 'text-yellow-200' : 'text-noch-muted'}>
                                {row.lastCountedAt
                                  ? new Date(row.lastCountedAt).toLocaleDateString(locale)
                                  : copy('Never', 'لم يُسجل')}
                              </p>
                              {row.countIsStale && (
                                <p className="text-yellow-200/70 text-[10px]">{copy('Count now', 'يجب الجرد الآن')}</p>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  )
}
