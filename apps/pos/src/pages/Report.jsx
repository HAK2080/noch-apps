import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Clock,
  CreditCard,
  MessageSquare,
  Package,
  Receipt,
  RefreshCw,
  Send,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  Users,
  WalletCards,
} from 'lucide-react'
import { getTasks, getTaskStats, getLastReport, logReport } from '../lib/tasks'
import { businessYmd } from '../modules/pos/lib/pos-supabase'
import { getManagementReport } from '../modules/reports/lib/management-report'
import { sendTelegram } from '../lib/telegram'
import { useLanguage } from '../contexts/LanguageContext'
import { useAuth } from '../contexts/AuthContext'
import Layout from '../components/Layout'
import toast from 'react-hot-toast'

const periods = [
  { en: 'Today', ar: 'اليوم', days: 1 },
  { en: '7 days', ar: '7 أيام', days: 7 },
  { en: '30 days', ar: '30 يومًا', days: 30 },
]

const REPORT_COPY = {
  en: {
    title: 'Management Report',
    subtitle: 'Authoritative finance, payment, branch, and operational controls',
    generated: 'Generated',
    cutoff: '05:00 business-day cutoff',
    allBranches: 'All branches',
    refresh: 'Refresh',
    completeness: 'Report completeness',
    complete: 'Complete',
    reviewWarnings: 'Review warnings',
    unavailableRule: 'Unavailable sources remain explicitly unavailable; they are never converted to zero.',
    netSales: 'Net sales',
    orders: 'orders',
    refunds: 'refunds',
    netSalesTrend: 'Net sales trend',
    noPriorSales: 'No comparable prior sales',
    versusPrevious: 'vs previous',
    businessDays: 'business days',
    directProfit: 'Direct operating profit',
    beforeShared: 'Before shared operating costs',
    fullyLoadedProfit: 'Fully loaded operating profit',
    sharedAllocated: 'shared costs allocated',
    cogs: 'Product costs (COGS)',
    cogsSub: 'Current configured product costs',
    staffCosts: 'Staff costs',
    staffCostsSub: 'Hourly, salary, and payroll adjustments',
    opex: 'Operating expenses',
    capexExcluded: 'CapEx excluded',
    averageOrder: 'Average order',
    averageOrderSub: 'Net sales ÷ completed orders',
    payments: 'Payment reconciliation',
    reconciled: 'Reconciled',
    reviewVariance: 'Review variance',
    unavailable: 'Unavailable',
    paymentUnavailable: 'Payment data is unavailable; no payment total is represented as zero.',
    cash: 'Cash collected',
    cashSub: 'Includes the cash part of split payments',
    card: 'Card collected',
    cardSub: 'Includes the card part of split payments',
    presto: 'Presto collected',
    prestoSub: 'Presto orders',
    other: 'Other payment methods',
    otherSub: 'Unmapped or alternative tenders',
    completedSales: 'Completed sales',
    paymentNetSales: 'Payment net sales',
    financeNetSales: 'Finance P&L net sales',
    difference: 'Difference',
    branches: 'Branch performance',
    branchesReconciled: 'Consolidated totals reconcile',
    branchesAdjusted: 'Reconciled with corporate / unallocated adjustment',
    branchesReview: 'Review consolidated differences',
    branch: 'Branch',
    orderVolume: 'Orders',
    productCosts: 'Product costs',
    operatingCosts: 'Operating costs',
    loadedProfit: 'Fully loaded profit',
    managementAttention: 'Management attention',
  },
  ar: {
    title: 'تقرير الإدارة',
    subtitle: 'ملخص موثوق للمالية والمدفوعات والفروع وتنبيهات التشغيل',
    generated: 'أُنشئ في',
    cutoff: 'يبدأ يوم العمل الساعة 05:00',
    allBranches: 'كل الفروع',
    refresh: 'تحديث',
    completeness: 'اكتمال التقرير',
    complete: 'مكتمل',
    reviewWarnings: 'راجع التنبيهات',
    unavailableRule: 'تبقى المصادر غير المتاحة واضحة ولا تُعرض أبدًا كقيمة صفرية.',
    netSales: 'صافي المبيعات',
    orders: 'طلب',
    refunds: 'مرتجعات',
    netSalesTrend: 'اتجاه صافي المبيعات',
    noPriorSales: 'لا توجد مبيعات سابقة قابلة للمقارنة',
    versusPrevious: 'مقارنةً بـ',
    businessDays: 'أيام عمل سابقة',
    directProfit: 'الربح التشغيلي المباشر',
    beforeShared: 'قبل التكاليف التشغيلية المشتركة',
    fullyLoadedProfit: 'الربح التشغيلي بعد تحميل جميع التكاليف',
    sharedAllocated: 'تكاليف مشتركة موزعة',
    cogs: 'تكلفة المنتجات (تكلفة المبيعات)',
    cogsSub: 'حسب تكاليف المنتجات المسجلة حاليًا',
    staffCosts: 'تكاليف الموظفين',
    staffCostsSub: 'الساعات والرواتب وتسويات كشوف المرتبات',
    opex: 'المصروفات التشغيلية',
    capexExcluded: 'النفقات الرأسمالية مستبعدة',
    averageOrder: 'متوسط قيمة الطلب',
    averageOrderSub: 'صافي المبيعات ÷ الطلبات المكتملة',
    payments: 'مطابقة المدفوعات',
    reconciled: 'مطابق',
    reviewVariance: 'راجع الفرق',
    unavailable: 'غير متاح',
    paymentUnavailable: 'بيانات المدفوعات غير متاحة، ولا تُعرض أي قيمة دفع كصفر.',
    cash: 'النقد المحصل',
    cashSub: 'يشمل الجزء النقدي من المدفوعات المقسمة',
    card: 'البطاقات المحصلة',
    cardSub: 'يشمل جزء البطاقة من المدفوعات المقسمة',
    presto: 'مدفوعات بريستو',
    prestoSub: 'طلبات بريستو',
    other: 'طرق دفع أخرى',
    otherSub: 'وسائل دفع بديلة أو غير مصنفة',
    completedSales: 'إجمالي المبيعات المكتملة',
    paymentNetSales: 'صافي المبيعات حسب المدفوعات',
    financeNetSales: 'صافي المبيعات حسب قائمة الأرباح والخسائر',
    difference: 'الفرق',
    branches: 'أداء الفروع',
    branchesReconciled: 'الإجمالي الموحد مطابق',
    branchesAdjusted: 'مطابق بعد إظهار تعديل الشركة / غير الموزع',
    branchesReview: 'راجع فروق التجميع',
    branch: 'الفرع',
    orderVolume: 'الطلبات',
    productCosts: 'تكلفة المنتجات',
    operatingCosts: 'تكاليف التشغيل',
    loadedProfit: 'الربح بعد تحميل جميع التكاليف',
    managementAttention: 'ما يحتاج إلى انتباه الإدارة',
  },
}

const insightStyle = {
  good: 'border-noch-green/30 bg-noch-green/10 text-noch-green',
  warn: 'border-yellow-400/30 bg-yellow-400/10 text-yellow-300',
  risk: 'border-red-400/30 bg-red-400/10 text-red-300',
}

const fmtLyd = value => `${Number(value || 0).toLocaleString('en-GB', { maximumFractionDigits: 2 })} LYD`

function fmtYmd(value) {
  if (!value) return '—'
  return new Date(`${String(value).slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB')
}

function fmtTimestamp(value, locale = 'en-GB') {
  return value ? new Date(value).toLocaleString(locale) : 'not available'
}

function countValue(value) {
  return value == null ? 'Unavailable' : Number(value).toLocaleString('en-GB')
}

function localizeInsight(item, lang) {
  if (lang !== 'ar') return item
  const values = String(item.detail || '').match(/\d+(?:\.\d+)?/g) || []
  const count = values[0] || '0'
  const translations = {
    finance_quality_missing: ['دليل اكتمال البيانات المالية مفقود', 'لا يستطيع مصدر الأرباح والخسائر إثبات اكتمال تكاليف المنتجات وتوزيع المصروفات.'],
    finance_model_incomplete: ['التكاليف التشغيلية المشتركة مفقودة', 'لا يعرض مصدر الأرباح والخسائر نموذج التكلفة المحمّل بالكامل.'],
    missing_product_costs: ['تكاليف المنتجات غير مكتملة', `${count} منتج مباع بلا تكلفة، لذلك تكلفة المبيعات والربح أقل من الحقيقة.`],
    unallocated_expenses: ['مصروفات تحتاج إلى مركز تكلفة', `${count} مصروف معتمد يظهر في الإجمالي الموحد فقط إلى أن يتم توزيعه.`],
    stale_inventory_counts: ['الجرد الفعلي قديم', `${count} عملية جرد مضى عليها أكثر من سبعة أيام.`],
    payment_reconciliation_variance: ['المبيعات والمدفوعات غير متطابقة', `يختلف صافي المبيعات حسب المدفوعات عن قائمة الأرباح والخسائر بمقدار ${count} د.ل.`],
    branch_reconciliation_variance: ['إجماليات الفروع تحتاج إلى مطابقة', `${count} مؤشر موحد يختلف عن مجموع الفروع؛ قد تفسر التكاليف غير الموزعة هذا الفرق.`],
    net_sales_trend: [item.title.includes('up') ? 'صافي المبيعات ارتفع' : 'صافي المبيعات انخفض', `${count}% مقارنة بفترة العمل السابقة المماثلة.`],
    fully_loaded_operating_loss: ['خسارة تشغيلية بعد تحميل جميع التكاليف', 'صافي المبيعات لا يغطي المنتجات والموظفين والتشغيل والتكاليف المشتركة الموزعة.'],
    approved_expenses_unpaid: ['مصروفات معتمدة تحتاج إلى دفع', `${count} مصروف معتمد ما زال غير مدفوع.`],
    theoretical_stock_risk: ['مخاطر في المخزون النظري', `${count} صنف تحت الحد الأدنى ويحتاج إلى مراجعة.`],
    whatsapp_delivery_failures: ['تعذر تسليم رسائل واتساب', `${count} رسالة فشلت أو تم حظرها خلال الفترة.`],
    no_material_exceptions: ['لا توجد استثناءات جوهرية', 'كل مصادر التقرير متاحة ولا يوجد حد رقابي متجاوز.'],
  }
  if (translations[item.id]) {
    return { ...item, title: translations[item.id][0], detail: translations[item.id][1] }
  }
  if (String(item.id).endsWith('_unavailable')) {
    return {
      ...item,
      title: 'مصدر بيانات غير متاح',
      detail: `تعذر قراءة هذا المصدر ولا يتم تمثيله كقيمة صفرية. ${item.detail || ''}`.trim(),
    }
  }
  return item
}

function MetricCard({ icon, label, value, sub, tone = 'text-white' }) {
  const MetricIcon = icon
  return (
    <div className="card !p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-noch-muted text-[11px] uppercase tracking-wider">{label}</p>
          <p className={`text-xl font-bold mt-1 ${tone}`}>{value}</p>
          {sub && <p className="text-noch-muted text-xs mt-1">{sub}</p>}
        </div>
        <MetricIcon size={18} className={tone} />
      </div>
    </div>
  )
}

function Section({ title, children, action }) {
  return (
    <div className="card">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-white font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  )
}

function Empty({ text }) {
  return <p className="text-noch-muted text-sm py-2">{text}</p>
}

function PeriodBadge({ children }) {
  return (
    <span className="text-[11px] px-2 py-1 rounded border border-noch-border text-noch-muted">
      {children}
    </span>
  )
}

function SourceCard({ source, locale, lang }) {
  const complete = source.status === 'complete'
  const labels = {
    finance: { en: 'Authoritative P&L', ar: 'قائمة الأرباح والخسائر المعتمدة' },
    payments: { en: 'Payment reconciliation', ar: 'مطابقة المدفوعات' },
    inventory: { en: 'Inventory control', ar: 'رقابة المخزون' },
    expenses: { en: 'Expense details', ar: 'تفاصيل المصروفات' },
    loyalty: { en: 'Loyalty membership', ar: 'عضوية الولاء' },
    messaging: { en: 'WhatsApp delivery', ar: 'تسليم رسائل واتساب' },
  }
  const label = labels[source.id]?.[lang] || source.label
  const scope = lang === 'ar'
    ? {
        finance: 'نطاق التقرير المحدد',
        payments: 'نطاق التقرير المحدد',
        inventory: 'مخزون المكونات المتعقب · غير مفلتر حسب الفرع',
        expenses: 'نطاق التقرير المحدد',
        loyalty: 'كل الفروع',
        messaging: 'كل الفروع',
      }[source.id] || source.scope
    : source.scope
  return (
    <div className="rounded-lg border border-noch-border bg-black/10 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-white text-xs font-semibold">{label}</p>
          <p className="text-noch-muted text-[10px] mt-1">{scope}</p>
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
          complete
            ? 'border-noch-green/30 bg-noch-green/10 text-noch-green'
            : 'border-red-400/30 bg-red-400/10 text-red-300'
        }`}>
          {complete ? (lang === 'ar' ? 'متاح' : 'Available') : (lang === 'ar' ? 'غير متاح' : 'Unavailable')}
        </span>
      </div>
      <p className="text-noch-muted text-[10px] mt-2">
        {complete
          ? `${lang === 'ar' ? 'حتى' : 'As of'} ${fmtTimestamp(source.asOf, locale)}`
          : source.error}
      </p>
    </div>
  )
}

export default function Report() {
  const { t, lang } = useLanguage()
  const { profile } = useAuth()
  const copy = REPORT_COPY[lang] || REPORT_COPY.en
  const locale = lang === 'ar' ? 'ar-LY' : 'en-GB'
  const [periodDays, setPeriodDays] = useState(7)
  const [branchId, setBranchId] = useState('')
  const [stats, setStats] = useState(null)
  const [tasks, setTasks] = useState([])
  const [report, setReport] = useState(null)
  const [lastReport, setLastReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState('')

  const load = async (days = periodDays) => {
    setRefreshing(true)
    setLoadError('')
    try {
      const [managementResult, taskStatsResult, tasksResult, lastReportResult] = await Promise.allSettled([
        getManagementReport({ days, branchId: branchId || null }),
        getTaskStats(),
        getTasks(),
        getLastReport(),
      ])
      if (managementResult.status === 'rejected') throw managementResult.reason

      setReport(managementResult.value)
      setStats(taskStatsResult.status === 'fulfilled' ? taskStatsResult.value : null)
      setTasks(tasksResult.status === 'fulfilled' ? tasksResult.value : [])
      setLastReport(lastReportResult.status === 'fulfilled' ? lastReportResult.value : null)

      const operationalFailures = [taskStatsResult, tasksResult, lastReportResult]
        .filter(result => result.status === 'rejected').length
      if (operationalFailures > 0) {
        toast.error(`${operationalFailures} operational source(s) unavailable; financial reporting remains visible.`)
      }
    } catch (error) {
      setLoadError(error?.message || 'Management report unavailable')
      toast.error(error?.message || t('error'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    load(periodDays)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodDays, branchId])

  const staffBreakdown = useMemo(() => tasks.reduce((accumulator, task) => {
    const assignee = task.assignee || task.assignees?.[0]?.assignee
    if (!assignee) return accumulator
    const key = assignee.id
    if (!accumulator[key]) {
      accumulator[key] = {
        name: assignee.full_name || 'Staff',
        pending: 0,
        in_progress: 0,
        done: 0,
        overdue: 0,
      }
    }
    accumulator[key][task.status] = (accumulator[key][task.status] || 0) + 1
    if (task.status !== 'done' && task.due_date && task.due_date < businessYmd()) {
      accumulator[key].overdue += 1
    }
    return accumulator
  }, {}), [tasks])

  const buildReportMessage = () => {
    const metrics = report?.metrics || {}
    const lines = [
      `Noch management report (${report?.period?.from} to ${report?.period?.to})`,
      `Scope: ${report?.scope?.branchName || 'All branches'}`,
      `Completeness: ${report?.completeness?.status || 'unknown'}`,
      `Net sales: ${fmtLyd(metrics.netSales)} from ${metrics.orders || 0} orders`,
      `Product costs: ${fmtLyd(metrics.cogs)}`,
      `Staff costs: ${fmtLyd(metrics.labor)}`,
      `Direct operating expenses: ${fmtLyd(metrics.directOperatingExpenses)}`,
      `Shared operating costs: ${fmtLyd(metrics.sharedOperatingCosts)}`,
      `Direct operating profit: ${fmtLyd(metrics.directOperatingProfit)}`,
      `Fully loaded operating profit: ${fmtLyd(metrics.fullyLoadedOperatingProfit)}`,
      `Theoretical stock risks: ${metrics.lowStockCount == null ? 'unavailable' : metrics.lowStockCount}`,
      `WhatsApp failures: ${metrics.whatsappFailed == null ? 'unavailable' : metrics.whatsappFailed}`,
      `Tasks: ${stats ? `${stats.pending || 0} pending, ${stats.overdue || 0} overdue` : 'unavailable'}`,
    ]
    report?.insights?.slice(0, 5).forEach(item => lines.push(`- ${item.title}: ${item.detail}`))
    return lines.join('\n')
  }

  const sendReport = async () => {
    const chatId = profile?.telegram_chat_id
    if (!chatId) return toast.error('No Telegram chat ID is set on your profile')
    if (!report) return toast.error('Load the management report before sending it')
    try {
      await sendTelegram(chatId, buildReportMessage())
      await logReport(String(chatId), {
        metrics: report.metrics,
        completeness: report.completeness,
        sources: report.sources,
        tasks: stats,
      })
      setLastReport({ sent_at: new Date().toISOString() })
      toast.success(t('reportSent'))
    } catch (error) {
      toast.error(error.message || t('error'))
    }
  }

  const metrics = report?.metrics || {}
  const trendTone = metrics.revenueChangePct == null
    ? 'text-noch-muted'
    : metrics.revenueChangePct >= 0
      ? 'text-noch-green'
      : 'text-red-400'
  const TrendIcon = metrics.revenueChangePct == null || metrics.revenueChangePct >= 0
    ? TrendingUp
    : TrendingDown
  const selectedPeriodLabel = periods.find(period => period.days === periodDays)?.[lang]
    || `${periodDays} days`

  return (
    <Layout>
      <div className="flex flex-col gap-4 mb-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-white font-bold text-xl">{copy.title}</h1>
          <p className="text-noch-muted text-sm mt-1">
            {report
              ? `${selectedPeriodLabel}: ${fmtYmd(report.period.from)} – ${fmtYmd(report.period.to)} · ${copy.cutoff}`
              : copy.subtitle}
          </p>
          {report && (
            <p className="text-noch-muted text-xs mt-1">
              {copy.generated} {fmtTimestamp(report.generatedAt, locale)} · {branchId ? report.scope.branchName : copy.allBranches}
            </p>
          )}
          {lastReport && (
            <p className="text-noch-muted text-xs mt-1">
              Last sent: {fmtTimestamp(lastReport.sent_at, locale)}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={branchId}
            onChange={event => setBranchId(event.target.value)}
            className="input py-2 text-sm"
          >
            <option value="">{copy.allBranches}</option>
            {report?.branches?.map(branch => (
              <option key={branch.id} value={branch.id}>{branch.name}</option>
            ))}
          </select>
          <div className="flex rounded-lg border border-noch-border bg-noch-card p-1">
            {periods.map(period => (
              <button
                key={period.days}
                onClick={() => setPeriodDays(period.days)}
                className={`px-3 py-1.5 rounded-md text-sm ${
                  periodDays === period.days
                    ? 'bg-noch-green text-black font-semibold'
                    : 'text-noch-muted hover:text-white'
                }`}
              >
                {period[lang] || period.en}
              </button>
            ))}
          </div>
          <button
            onClick={() => load(periodDays)}
            className="btn-secondary flex items-center gap-2"
            disabled={refreshing}
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            {copy.refresh}
          </button>
          <button
            onClick={sendReport}
            className="btn-primary flex items-center gap-2"
            disabled={!report}
          >
            <Send size={16} />
            {t('sendReport')}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-noch-muted text-center py-16">{t('loading')}</p>
      ) : loadError && !report ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
          <p className="text-red-300 font-semibold">Authoritative finance data is unavailable</p>
          <p className="text-red-200/70 text-sm mt-1">{loadError}</p>
          <button onClick={() => load(periodDays)} className="btn-secondary mt-4">Try again</button>
        </div>
      ) : (
        <div className="space-y-5">
          {loadError && (
            <div className="rounded-xl border border-yellow-400/30 bg-yellow-400/10 p-3 text-yellow-200 text-sm">
              Refresh failed: {loadError}. Showing the last report generated {fmtTimestamp(report?.generatedAt, locale)}.
            </div>
          )}
          <Section
            title={copy.completeness}
            action={(
              <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${
                report?.completeness?.status === 'complete'
                  ? 'border-noch-green/30 bg-noch-green/10 text-noch-green'
                  : 'border-yellow-400/30 bg-yellow-400/10 text-yellow-300'
              }`}>
                {report?.completeness?.status === 'complete' ? copy.complete : copy.reviewWarnings}
              </span>
            )}
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              {report?.sources?.map(source => (
                <SourceCard key={source.id} source={source} locale={locale} lang={lang} />
              ))}
            </div>
            <p className="text-noch-muted text-xs mt-3">
              {copy.unavailableRule}
            </p>
          </Section>

          <div className={`grid gap-3 md:grid-cols-2 xl:grid-cols-4 ${refreshing ? 'opacity-60' : ''}`}>
            <MetricCard
              icon={ShoppingBag}
              label={`${copy.netSales} (${selectedPeriodLabel})`}
              value={fmtLyd(metrics.netSales)}
              sub={`${metrics.orders || 0} ${copy.orders} · ${fmtLyd(metrics.refunds)} ${copy.refunds}`}
              tone="text-noch-green"
            />
            <MetricCard
              icon={TrendIcon}
              label={copy.netSalesTrend}
              value={metrics.revenueChangePct == null ? copy.noPriorSales : `${metrics.revenueChangePct.toFixed(1)}%`}
              sub={`${copy.versusPrevious} ${periodDays} ${copy.businessDays}`}
              tone={trendTone}
            />
            <MetricCard
              icon={Receipt}
              label={copy.directProfit}
              value={fmtLyd(metrics.directOperatingProfit)}
              sub={copy.beforeShared}
              tone={metrics.directOperatingProfit >= 0 ? 'text-white' : 'text-red-400'}
            />
            <MetricCard
              icon={CheckCircle2}
              label={copy.fullyLoadedProfit}
              value={fmtLyd(metrics.fullyLoadedOperatingProfit)}
              sub={`${fmtLyd(metrics.sharedOperatingCosts)} ${copy.sharedAllocated}`}
              tone={metrics.fullyLoadedOperatingProfit >= 0 ? 'text-white' : 'text-red-400'}
            />
          </div>

          <div className={`grid gap-3 md:grid-cols-2 xl:grid-cols-4 ${refreshing ? 'opacity-60' : ''}`}>
            <MetricCard icon={Receipt} label={copy.cogs} value={fmtLyd(metrics.cogs)} sub={copy.cogsSub} tone="text-yellow-300" />
            <MetricCard icon={Users} label={copy.staffCosts} value={fmtLyd(metrics.labor)} sub={copy.staffCostsSub} tone="text-yellow-300" />
            <MetricCard icon={Receipt} label={copy.opex} value={fmtLyd(metrics.operatingExpenses)} sub={`${fmtLyd(metrics.capitalExpenses)} ${copy.capexExcluded}`} tone="text-yellow-300" />
            <MetricCard icon={ShoppingBag} label={copy.averageOrder} value={fmtLyd(metrics.averageOrder)} sub={copy.averageOrderSub} />
          </div>

          <Section
            title={copy.payments}
            action={(
              <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${
                report?.payments?.reconciliationStatus === 'reconciled'
                  ? 'border-noch-green/30 bg-noch-green/10 text-noch-green'
                  : 'border-yellow-400/30 bg-yellow-400/10 text-yellow-300'
              }`}>
                {report?.payments?.reconciliationStatus === 'reconciled'
                  ? copy.reconciled
                  : report?.payments?.reconciliationStatus === 'warning'
                    ? copy.reviewVariance
                    : copy.unavailable}
              </span>
            )}
          >
            {report?.payments?.status === 'unavailable' ? (
              <Empty text={copy.paymentUnavailable} />
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <MetricCard
                    icon={Banknote}
                    label={copy.cash}
                    value={fmtLyd(report.payments.cashCollected)}
                    sub={copy.cashSub}
                    tone="text-noch-green"
                  />
                  <MetricCard
                    icon={CreditCard}
                    label={copy.card}
                    value={fmtLyd(report.payments.cardCollected)}
                    sub={copy.cardSub}
                    tone="text-blue-300"
                  />
                  <MetricCard
                    icon={WalletCards}
                    label={copy.presto}
                    value={fmtLyd(report.payments.prestoCollected)}
                    sub={copy.prestoSub}
                    tone="text-purple-300"
                  />
                  <MetricCard
                    icon={Receipt}
                    label={copy.other}
                    value={fmtLyd(report.payments.otherCollected)}
                    sub={copy.otherSub}
                    tone={report.payments.otherCollected ? 'text-yellow-300' : 'text-noch-muted'}
                  />
                </div>
                <div className="mt-3 grid gap-2 rounded-lg border border-noch-border bg-black/10 p-3 text-xs sm:grid-cols-2 xl:grid-cols-5">
                  <p className="text-noch-muted">{copy.completedSales} <b className="text-white">{fmtLyd(report.payments.completedSales)}</b></p>
                  <p className="text-noch-muted">{copy.refunds} <b className="text-white">{fmtLyd(report.payments.refunds)}</b></p>
                  <p className="text-noch-muted">{copy.paymentNetSales} <b className="text-white">{fmtLyd(report.payments.netSales)}</b></p>
                  <p className="text-noch-muted">{copy.financeNetSales} <b className="text-white">{fmtLyd(report.payments.financeNetSales)}</b></p>
                  <p className={Math.abs(report.payments.variance) <= 0.01 ? 'text-noch-green' : 'text-red-300'}>
                    {copy.difference} <b>{fmtLyd(report.payments.variance)}</b>
                  </p>
                </div>
              </>
            )}
          </Section>

          <Section
            title={copy.branches}
            action={(
              <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${
                report?.branchPerformance?.reconciliation?.status === 'reconciled'
                  ? 'border-noch-green/30 bg-noch-green/10 text-noch-green'
                  : 'border-yellow-400/30 bg-yellow-400/10 text-yellow-300'
              }`}>
                {report?.branchPerformance?.reconciliation?.status === 'reconciled'
                  ? copy.branchesReconciled
                  : report?.branchPerformance?.reconciliation?.status === 'reconciled_with_adjustment'
                    ? copy.branchesAdjusted
                  : copy.branchesReview}
              </span>
            )}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-noch-border text-left text-[10px] uppercase tracking-wide text-noch-muted">
                    <th className="px-2 py-2 font-medium">{copy.branch}</th>
                    <th className="px-2 py-2 text-right font-medium">{copy.netSales}</th>
                    <th className="px-2 py-2 text-right font-medium">{copy.orderVolume}</th>
                    <th className="px-2 py-2 text-right font-medium">{copy.productCosts}</th>
                    <th className="px-2 py-2 text-right font-medium">{copy.staffCosts}</th>
                    <th className="px-2 py-2 text-right font-medium">{copy.operatingCosts}</th>
                    <th className="px-2 py-2 text-right font-medium">{copy.loadedProfit}</th>
                  </tr>
                </thead>
                <tbody>
                  {report?.branchPerformance?.rows?.map(row => (
                    <tr key={row.id} className="border-b border-noch-border/60 last:border-0">
                      <td className="px-2 py-2 text-white">{row.name}</td>
                      <td className="px-2 py-2 text-right font-mono text-white">{fmtLyd(row.netSales)}</td>
                      <td className="px-2 py-2 text-right font-mono text-noch-muted">{row.orders.toLocaleString('en-GB')}</td>
                      <td className="px-2 py-2 text-right font-mono text-noch-muted">{fmtLyd(row.cogs)}</td>
                      <td className="px-2 py-2 text-right font-mono text-noch-muted">{fmtLyd(row.labor)}</td>
                      <td className="px-2 py-2 text-right font-mono text-noch-muted">{fmtLyd(row.operatingExpenses)}</td>
                      <td className={`px-2 py-2 text-right font-mono ${row.fullyLoadedOperatingProfit >= 0 ? 'text-noch-green' : 'text-red-300'}`}>
                        {fmtLyd(row.fullyLoadedOperatingProfit)}
                      </td>
                    </tr>
                  ))}
                  {report?.branchPerformance?.adjustment && (
                    <tr className="border-t border-yellow-400/30 bg-yellow-400/5">
                      <td className="px-2 py-2 text-yellow-200">
                        {lang === 'ar' ? 'الشركة / غير موزع' : report.branchPerformance.adjustment.name}
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-yellow-200">{fmtLyd(report.branchPerformance.adjustment.netSales)}</td>
                      <td className="px-2 py-2 text-right font-mono text-noch-muted">—</td>
                      <td className="px-2 py-2 text-right font-mono text-yellow-200">{fmtLyd(report.branchPerformance.adjustment.cogs)}</td>
                      <td className="px-2 py-2 text-right font-mono text-yellow-200">{fmtLyd(report.branchPerformance.adjustment.labor)}</td>
                      <td className="px-2 py-2 text-right font-mono text-yellow-200">{fmtLyd(report.branchPerformance.adjustment.operatingExpenses)}</td>
                      <td className="px-2 py-2 text-right font-mono text-yellow-200">{fmtLyd(report.branchPerformance.adjustment.fullyLoadedOperatingProfit)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Section>

          <div className={`grid gap-3 md:grid-cols-2 xl:grid-cols-4 ${refreshing ? 'opacity-60' : ''}`}>
            <MetricCard
              icon={Package}
              label="Theoretical stock risk"
              value={countValue(metrics.lowStockCount)}
              sub={metrics.outOfStockCount == null ? 'Inventory source unavailable' : `${metrics.outOfStockCount} at zero · ${metrics.staleStockCount} stale counts`}
              tone={metrics.lowStockCount ? 'text-red-400' : metrics.lowStockCount === 0 ? 'text-noch-green' : 'text-noch-muted'}
            />
            <MetricCard
              icon={Users}
              label="Loyalty network"
              value={countValue(metrics.loyaltyActive)}
              sub={metrics.newCustomers == null ? 'Loyalty source unavailable' : `${metrics.newCustomers} new · ${metrics.loyaltyCustomers} total · all branches`}
              tone="text-blue-300"
            />
            <MetricCard
              icon={MessageSquare}
              label="WhatsApp network"
              value={countValue(metrics.whatsappSent)}
              sub={metrics.whatsappFailed == null ? 'Messaging source unavailable' : `${metrics.whatsappFailed} failed · ${metrics.whatsappQueued} queued/sent · all branches`}
              tone={metrics.whatsappFailed ? 'text-red-400' : metrics.whatsappFailed === 0 ? 'text-noch-green' : 'text-noch-muted'}
            />
            <MetricCard
              icon={Clock}
              label="Tasks (live)"
              value={stats ? `${stats.pending || 0} pending` : 'Unavailable'}
              sub={stats ? `${stats.overdue || 0} overdue · ${stats.done || 0} done` : 'Task source unavailable'}
              tone={stats?.overdue ? 'text-red-400' : stats ? 'text-white' : 'text-noch-muted'}
            />
          </div>

          <Section title={copy.managementAttention} action={<PeriodBadge>{selectedPeriodLabel}</PeriodBadge>}>
            <div className="grid gap-3 lg:grid-cols-2">
              {report?.insights?.map(item => localizeInsight(item, lang)).map((item, index) => (
                <div key={`${item.title}-${index}`} className={`rounded-lg border px-3 py-3 ${insightStyle[item.type] || insightStyle.warn}`}>
                  <div className="flex items-start gap-2">
                    {item.type === 'good'
                      ? <CheckCircle2 size={16} className="mt-0.5" />
                      : <AlertTriangle size={16} className="mt-0.5" />}
                    <div>
                      <p className="text-sm font-semibold">{item.title}</p>
                      <p className="text-xs opacity-90 mt-0.5">{item.detail}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <div className="grid gap-5 xl:grid-cols-2">
            <Section title="Theoretical stock risks" action={<PeriodBadge>Not branch-filtered</PeriodBadge>}>
              {report?.sources?.find(source => source.id === 'inventory')?.status === 'unavailable' ? (
                <Empty text="Inventory control source unavailable; no zero-risk claim is shown." />
              ) : !report?.stockRisk?.length ? (
                <Empty text="No theoretical stock item is below its configured minimum." />
              ) : (
                <div className="space-y-2">
                  {report.stockRisk.map(item => (
                    <div key={item.ingredientId} className="flex items-center justify-between gap-3 border-b border-noch-border pb-2 last:border-0 last:pb-0">
                      <div>
                        <p className="text-white text-sm">{item.name}</p>
                        <p className="text-noch-muted text-xs">
                          Minimum {item.minThreshold.toLocaleString('en-GB')} {item.unit}
                          {item.countIsStale ? ' · physical count stale' : ''}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-red-300 text-sm font-mono">
                          {item.theoreticalQty.toLocaleString('en-GB')} {item.unit}
                        </p>
                        <p className="text-noch-muted text-[10px]">estimated on hand</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Largest approved operating expenses" action={<PeriodBadge>{selectedPeriodLabel}</PeriodBadge>}>
              {report?.sources?.find(source => source.id === 'expenses')?.status === 'unavailable' ? (
                <Empty text="Expense detail source unavailable; P&L totals remain authoritative." />
              ) : !report?.expenses?.length ? (
                <Empty text="No approved or paid expense details in this period." />
              ) : (
                <div className="space-y-2">
                  {report.expenses.map(item => (
                    <div key={item.id} className="flex items-center justify-between gap-3 border-b border-noch-border pb-2 last:border-0 last:pb-0">
                      <div>
                        <p className="text-white text-sm">{item.vendor || item.description || 'Expense'}</p>
                        <p className="text-noch-muted text-xs">{fmtYmd(item.expense_date)} · {item.status}</p>
                      </div>
                      <p className="text-yellow-300 text-sm font-mono">{fmtLyd(item.amountLyd)}</p>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <Section title="Staff execution" action={<PeriodBadge>Live</PeriodBadge>}>
              {Object.keys(staffBreakdown).length === 0 ? (
                <Empty text={stats ? 'No assigned tasks.' : 'Task source unavailable.'} />
              ) : (
                <div className="space-y-2">
                  {Object.values(staffBreakdown).map(staff => (
                    <div key={staff.name} className="flex items-center gap-3 border-b border-noch-border py-2 last:border-0">
                      <div className="w-8 h-8 rounded-full bg-noch-green/10 border border-noch-green/20 flex items-center justify-center text-noch-green font-bold text-sm flex-shrink-0">
                        {staff.name.charAt(0)}
                      </div>
                      <p className="text-white text-sm font-medium flex-1">{staff.name}</p>
                      <div className="flex flex-wrap justify-end gap-3 text-xs">
                        <span className="text-green-400">Done {staff.done}</span>
                        <span className="text-blue-400">Doing {staff.in_progress}</span>
                        <span className="text-yellow-400">Pending {staff.pending}</span>
                        {staff.overdue > 0 && <span className="text-red-400">Overdue {staff.overdue}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title="WhatsApp delivery" action={<PeriodBadge>All branches</PeriodBadge>}>
              {report?.sources?.find(source => source.id === 'messaging')?.status === 'unavailable' ? (
                <Empty text="Messaging source unavailable." />
              ) : !report?.whatsapp?.length ? (
                <Empty text="No WhatsApp sends in this period." />
              ) : (
                <div className="space-y-2">
                  {report.whatsapp.map(item => {
                    const status = item.provider_status || item.status || 'unknown'
                    const risky = ['failed', 'undelivered', 'error', 'cooldown_recent_send', 'not_opted_in', 'missing_template_sid']
                      .includes(String(status).toLowerCase())
                    return (
                      <div key={item.id} className="flex items-center justify-between gap-3 border-b border-noch-border pb-2 last:border-0 last:pb-0">
                        <div>
                          <p className="text-white text-sm">{item.template_key || 'WhatsApp message'}</p>
                          <p className="text-noch-muted text-xs">{fmtTimestamp(item.created_at, locale)}</p>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded border ${
                          risky
                            ? 'border-red-400/30 bg-red-400/10 text-red-300'
                            : 'border-noch-green/30 bg-noch-green/10 text-noch-green'
                        }`}>
                          {status}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </Section>
          </div>
        </div>
      )}
    </Layout>
  )
}
