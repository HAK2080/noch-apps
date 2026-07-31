import { createElement, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRightLeft,
  ClipboardCheck,
  History,
  Loader2,
  MapPin,
  Package,
  PackagePlus,
  RefreshCw,
  ShoppingCart,
  Store,
  Truck,
  Users,
  Warehouse,
} from 'lucide-react'
import Layout from '../components/Layout'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import { usePermissions } from '../contexts/PermissionsContext'
import { supabase } from '../lib/supabase'
import { buildInventoryControlReport } from './inventory/lib/inventoryIntelligence'

function Metric({ label, value, detail, tone = 'text-white' }) {
  return (
    <div className="rounded-xl border border-noch-border bg-noch-card p-4">
      <p className="text-noch-muted text-[11px] uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${tone}`}>{value}</p>
      <p className="text-noch-muted text-xs mt-1">{detail}</p>
    </div>
  )
}

function ActionCard({ title, description, icon, onClick, tone = 'text-noch-green' }) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl border border-noch-border bg-noch-card p-4 text-start hover:border-noch-green/40 transition-colors"
    >
      {createElement(icon, { size: 18, className: tone })}
      <p className="text-white font-semibold mt-3">{title}</p>
      <p className="text-noch-muted text-xs mt-1 leading-relaxed">{description}</p>
    </button>
  )
}

export default function InventoryHub() {
  const navigate = useNavigate()
  const { isOwner, profile } = useAuth()
  const { hasAccess } = usePermissions()
  const { lang } = useLanguage()
  const arabic = lang === 'ar'
  const copy = (english, arabicText) => arabic ? arabicText : english
  const canManage = isOwner || profile?.role === 'supervisor' || hasAccess('inventory')
  const canManageSuppliers = isOwner || profile?.role === 'supervisor' || hasAccess('suppliers')
  const [rows, setRows] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const [statusResult, summaryResult] = await Promise.all([
      supabase.rpc('inventory_control_status_v2'),
      supabase.rpc('inventory_control_summary'),
    ])
    const queryError = statusResult.error || summaryResult.error
    if (queryError) {
      setError(queryError.message || (arabic ? 'ضوابط المخزون غير متاحة' : 'Inventory controls are unavailable'))
    } else {
      setRows(statusResult.data || [])
      setSummary(summaryResult.data || null)
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
        setError(queryError.message || (arabic ? 'ضوابط المخزون غير متاحة' : 'Inventory controls are unavailable'))
      } else {
        setRows(statusResult.data || [])
        setSummary(summaryResult.data || null)
      }
      setLoading(false)
    })
    return () => { active = false }
  }, [arabic])

  const report = useMemo(() => buildInventoryControlReport(rows), [rows])
  const urgentCount = report.statusCounts.out
    + report.statusCounts.below_minimum
    + report.statusCounts.near_minimum
  const exceptionCount = report.staleCount
    + report.locationVarianceCount
    + (summary?.negative_product_locations || 0)
    + (summary?.open_transfers || 0)

  const operations = [
    {
      title: copy('Count ingredient stock', 'جرد مخزون المكوّنات'),
      description: copy('Record physical counts and reconcile every storage location.', 'سجّل الجرد الفعلي وطابق كل موقع تخزين.'),
      icon: ClipboardCheck,
      path: '/inventory/stock',
    },
    {
      title: copy('Branch product stock', 'مخزون منتجات الفروع'),
      description: copy('See branch-specific quantities and minimum levels.', 'اعرض كميات كل فرع وحدوده الدنيا.'),
      icon: Store,
      path: '/inventory/branch-stock',
    },
    {
      title: copy('Warehouse stock', 'مخزون المستودع'),
      description: copy('Receive centrally and see the auditable warehouse balance.', 'استلم مركزيًا واعرض رصيد المستودع القابل للتدقيق.'),
      icon: Warehouse,
      path: '/inventory/warehouse',
    },
    {
      title: copy('Request stock', 'طلب مخزون'),
      description: copy('Ask the warehouse to send a product to a branch.', 'اطلب من المستودع إرسال منتج إلى فرع.'),
      icon: PackagePlus,
      path: '/inventory/requests',
    },
    {
      title: copy('Transfers', 'التحويلات'),
      description: copy('Ship, receive, and explain any quantity difference.', 'اشحن واستلم وفسّر أي فرق في الكمية.'),
      icon: ArrowRightLeft,
      path: '/inventory/transfers',
    },
    {
      title: copy('In transit', 'قيد النقل'),
      description: copy('Items shipped but not fully received.', 'العناصر المشحونة التي لم تُستلم بالكامل.'),
      icon: Truck,
      path: '/inventory/in-transit',
    },
    {
      title: copy('Movement evidence', 'سجل حركات المخزون'),
      description: copy('Audit receipts, sales, waste, transfers, and adjustments.', 'راجع الاستلام والمبيعات والهدر والتحويلات والتعديلات.'),
      icon: History,
      path: '/inventory/movements',
    },
  ]

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">
              {copy('Inventory Control', 'الرقابة على المخزون')}
            </h1>
            <p className="text-noch-muted text-sm mt-1">
              {copy(
                'Count what exists, trace every movement, and act on exceptions.',
                'احصر الموجود، وتتبع كل حركة، وتعامل مع الاستثناءات.',
              )}
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="p-2 text-noch-muted hover:text-white rounded-lg hover:bg-noch-card disabled:opacity-50"
            title={copy('Refresh', 'تحديث')}
          >
            {loading ? <Loader2 size={17} className="animate-spin" /> : <RefreshCw size={17} />}
          </button>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
            <p className="text-red-300 font-semibold">
              {copy('Inventory status is unavailable', 'حالة المخزون غير متاحة')}
            </p>
            <p className="text-red-200/70 text-sm mt-1">{error}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Metric
                label={copy('Urgent stock', 'مخزون عاجل')}
                value={loading ? '—' : urgentCount}
                detail={copy('Out, below, or near minimum', 'نافد أو أقل من الحد أو قريب منه')}
                tone={urgentCount ? 'text-red-300' : 'text-noch-green'}
              />
              <Metric
                label={copy('Control exceptions', 'استثناءات الرقابة')}
                value={loading ? '—' : exceptionCount}
                detail={copy('Stale counts, variances, negatives, transfers', 'جرد قديم وفروقات وأرصدة سالبة وتحويلات')}
                tone={exceptionCount ? 'text-amber-300' : 'text-noch-green'}
              />
              <Metric
                label={copy('Open procurement', 'مشتريات مفتوحة')}
                value={loading ? '—' : summary?.open_procurement_orders ?? 0}
                detail={copy('Not yet fully received or closed', 'لم تُستلم أو تُغلق بالكامل')}
                tone={summary?.open_procurement_orders ? 'text-purple-300' : 'text-white'}
              />
              <Metric
                label={copy('Recipe coverage', 'تغطية الوصفات')}
                value={loading ? '—' : summary?.recipe_coverage_pct == null ? '—' : `${summary.recipe_coverage_pct}%`}
                detail={copy('Sold products with explicit recipes, 30 days', 'المنتجات المباعة المرتبطة بوصفات خلال 30 يومًا')}
                tone={(summary?.recipe_coverage_pct ?? 0) < 100 ? 'text-yellow-200' : 'text-noch-green'}
              />
            </div>

            {(report.staleCount > 0 || report.recipeUsageUnavailableCount > 0 || report.missingLocationCount > 0) && (
              <button
                onClick={() => navigate(isOwner ? '/inventory/intelligence' : '/inventory/stock')}
                className="w-full rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-start flex gap-3"
              >
                <AlertTriangle size={18} className="text-amber-300 shrink-0 mt-0.5" />
                <div>
                  <p className="text-amber-200 font-semibold text-sm">
                    {copy('Inventory evidence needs repair', 'أدلة المخزون تحتاج إلى معالجة')}
                  </p>
                  <p className="text-amber-200/70 text-xs mt-1">
                    {copy(
                      `${report.staleCount} stale counts, ${report.recipeUsageUnavailableCount} ingredients without recipe usage evidence, and ${report.missingLocationCount} ingredients without location counts.`,
                      `${report.staleCount} عمليات جرد قديمة، و${report.recipeUsageUnavailableCount} مكوّنات بلا دليل استهلاك من الوصفات، و${report.missingLocationCount} مكوّنات بلا جرد للمواقع.`,
                    )}
                  </p>
                </div>
              </button>
            )}
          </>
        )}

        {isOwner && (
          <button
            onClick={() => navigate('/inventory/intelligence')}
            className="w-full rounded-xl border border-blue-400/30 bg-blue-400/5 p-4 text-start flex items-center justify-between gap-4"
          >
            <div>
              <p className="text-blue-200 font-semibold">{copy('Owner control report', 'تقرير الرقابة للمالك')}</p>
              <p className="text-blue-200/70 text-xs mt-1">
                {copy('Definitions, freshness, recipe evidence, location reconciliation, and export.', 'التعريفات والحداثة وأدلة الوصفات ومطابقة المواقع والتصدير.')}
              </p>
            </div>
            <MapPin size={20} className="text-blue-300 shrink-0" />
          </button>
        )}

        <div>
          <h2 className="text-noch-muted text-xs font-semibold uppercase tracking-wide mb-3">
            {copy('Daily operations', 'العمليات اليومية')}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {operations.map(action => (
              <ActionCard
                key={action.path}
                {...action}
                onClick={() => navigate(action.path)}
              />
            ))}
          </div>
        </div>

        {canManage && (
          <div>
            <h2 className="text-noch-muted text-xs font-semibold uppercase tracking-wide mb-3">
              {copy('Purchasing and setup', 'الشراء والإعداد')}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {isOwner && (
                <ActionCard
                  title={copy('Procurement', 'المشتريات')}
                  description={copy('Orders, landed cost, receiving, returns, and payables.', 'الطلبات والتكلفة الكاملة والاستلام والمرتجعات والذمم.')}
                  icon={ShoppingCart}
                  tone="text-purple-300"
                  onClick={() => navigate('/inventory/procurement')}
                />
              )}
              {canManageSuppliers && (
                <ActionCard
                  title={copy('Suppliers', 'المورّدون')}
                  description={copy('Supplier contacts, terms, and price evidence.', 'بيانات المورّدين والشروط وأدلة الأسعار.')}
                  icon={Users}
                  tone="text-blue-300"
                  onClick={() => navigate('/inventory/suppliers')}
                />
              )}
              <ActionCard
                title={copy('Stock checklists', 'قوائم فحص المخزون')}
                description={copy('Operational presence checks; not a quantity ledger.', 'فحص تشغيلي للتوفر، وليس سجلًا للكميات.')}
                icon={Package}
                onClick={() => navigate('/inventory/stock-check')}
              />
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
