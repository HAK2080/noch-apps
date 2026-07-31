// Sales.jsx — Sales overview: real totals per branch + range presets,
// then drill into Orders or Sessions views.
// Route: /sales
//
// Figures come from the pos_sales_daily view, which buckets by BUSINESS day
// (5 AM → 5 AM Africa/Tripoli) so post-midnight sales count toward the
// evening's trading day.

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, ListOrdered, Clock, Download, TrendingUp } from 'lucide-react'
import {
  addYmdDays,
  businessDayWindow,
  businessHour,
  businessYmd,
  getPOSBranches,
  getSalesControlSummary,
  getSalesExportRows,
} from '../modules/pos/lib/pos-supabase'
import {
  combineSalesControls,
  normalizeSalesControl,
} from '../modules/pos/lib/sales-control'
import { getServedBy } from '../modules/pos/lib/pos-session'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import { usePermissions } from '../contexts/PermissionsContext'
import Layout from '../components/Layout'
import BusinessRangePicker from '../components/shared/BusinessRangePicker'
import { downloadCsv } from '../lib/exportCsv'
import { maskCustomerPhone } from './sales/salesReporting'
import toast from 'react-hot-toast'

const PRESETS = [
  { key: 'today', label: 'Today', days: 0 },
  { key: '7d',    label: '7 days', days: 6 },
  { key: 'month', label: 'Month', days: 29 },
]

const SALES_COPY = {
  en: {
    title: 'Sales and payment control',
    businessDay: 'Business days run 05:00 to 05:00 in Africa/Tripoli.',
    netSales: 'Net sales',
    orders: 'Orders',
    linkedRefunds: 'Linked refunds',
    completedSales: 'Completed sales',
    paymentReconciliation: 'Payment reconciliation',
    reconciled: 'Reconciled to completed sales',
    variance: 'Variance',
    cash: 'Cash',
    card: 'Card',
    presto: 'Presto',
    other: 'Other / unmapped',
    periodMovement: 'Tender movement processed in this period',
    timingDifference: 'Order/refund timing difference',
    cashNet: 'Cash net',
    cardNet: 'Card net',
    prestoNet: 'Presto net',
    refunded: 'Refunded',
    voids: 'Voids',
    settlementUnavailable: 'Card settlement evidence is unavailable. POS card tender is not proof of bank settlement.',
    dataUnavailable: 'Data unavailable',
    orderEvidence: 'Orders',
    shifts: 'Shifts',
    currency: 'LYD',
  },
  ar: {
    title: 'رقابة المبيعات والمدفوعات',
    businessDay: 'يمتد يوم العمل من 05:00 إلى 05:00 بتوقيت أفريقيا/طرابلس.',
    netSales: 'صافي المبيعات',
    orders: 'الطلبات',
    linkedRefunds: 'المرتجعات المرتبطة',
    completedSales: 'المبيعات المكتملة',
    paymentReconciliation: 'مطابقة المدفوعات',
    reconciled: 'متطابق مع المبيعات المكتملة',
    variance: 'الفرق',
    cash: 'نقدي',
    card: 'بطاقة',
    presto: 'بريستو',
    other: 'أخرى / غير مصنفة',
    periodMovement: 'حركة وسائل الدفع المنفذة خلال الفترة',
    timingDifference: 'فرق توقيت الطلبات والمرتجعات',
    cashNet: 'صافي النقدي',
    cardNet: 'صافي البطاقة',
    prestoNet: 'صافي بريستو',
    refunded: 'مرتجع',
    voids: 'ملغي',
    settlementUnavailable: 'دليل تسوية البطاقات غير متاح. تسجيل الدفع بالبطاقة في نقطة البيع لا يثبت وصوله إلى البنك.',
    dataUnavailable: 'البيانات غير متاحة',
    orderEvidence: 'الطلبات',
    shifts: 'الورديات',
    currency: 'د.ل',
  },
}

function rangeFor(days) {
  const toDate = businessYmd()
  return { fromDate: addYmdDays(toDate, -days), toDate }
}

const fmt = n => Number(n || 0).toLocaleString('en', { maximumFractionDigits: 2 })

export default function Sales() {
  const navigate = useNavigate()
  const { lang } = useLanguage()
  const copy = SALES_COPY[lang] || SALES_COPY.en
  const { profile } = useAuth()
  const { isOwner, hasAccess } = usePermissions()
  // Session/shift totals: 'sales' permission for the logged-in profile, OR a
  // PIN-verified owner/supervisor on a shared terminal (role_permissions keys
  // off the Supabase login, not the PIN operator — keep the role fallback).
  const canViewSessions = isOwner || hasAccess('sales')
    || ['owner', 'supervisor'].includes(getServedBy()?.role)
    || profile?.role === 'supervisor'
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState(() => ({ preset: 'today', ...rangeFor(0) }))
  const [totalsByBranch, setTotalsByBranch] = useState({})
  const [exportBranchId, setExportBranchId] = useState('all')
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    getPOSBranches()
      .then(list => { setBranches(list || []) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Load per-branch totals for the selected range (canViewSessions only —
  // plain staff keep the navigation-only view).
  useEffect(() => {
    if (!canViewSessions || !branches.length) return
    let cancelled = false
    Promise.all(
      branches.map(b =>
        getSalesControlSummary(b.id, range.fromDate, range.toDate)
          .then(row => [b.id, { status: 'complete', data: normalizeSalesControl(row) }])
          .catch(error => [b.id, { status: 'unavailable', data: null, error: error.message }])
      )
    ).then(entries => { if (!cancelled) setTotalsByBranch(Object.fromEntries(entries)) })
    return () => { cancelled = true }
  }, [branches, canViewSessions, range.fromDate, range.toDate])

  const availableControls = Object.values(totalsByBranch)
    .filter(result => result?.status === 'complete' && result.data)
    .map(result => result.data)
  const failedBranches = branches.filter(
    branch => totalsByBranch[branch.id]?.status === 'unavailable',
  )
  const grand = combineSalesControls(availableControls)

  const handleExport = async () => {
    if (!range.fromDate || !range.toDate || range.fromDate > range.toDate) {
      toast.error('Choose a valid export date range')
      return
    }

    setExporting(true)
    try {
      const selectedBranches = exportBranchId === 'all'
        ? branches
        : branches.filter(branch => branch.id === exportBranchId)
      const { fromIso, toIso } = businessDayWindow(range.fromDate, range.toDate)
      const chunks = await Promise.all(
        selectedBranches.map(branch =>
          getSalesExportRows(branch.id, {
            from: fromIso,
            to: toIso,
            status: 'completed',
          })
            .then(rows => rows.map(row => ({ branch, row }))),
        ),
      )
      const exportRows = chunks.flat().map(({ branch, row }) => {
        const order = row.pos_orders || {}
        const created = order.created_at ? new Date(order.created_at) : null
        const quantity = Number(row.quantity) || 0
        const unitPrice = Number(row.unit_price) || 0
        const lineTotal = Number(row.total) || quantity * unitPrice
        const refundedQty = Number(row.refunded_qty) || 0
        const netQty = Math.max(0, quantity - refundedQty)
        const netLineTotal = quantity > 0 ? lineTotal * (netQty / quantity) : lineTotal
        return [
          order.created_at || '',
          created ? businessYmd(created) : '',
          created ? businessHour(created) : '',
          branch.name || order.pos_branches?.name || '',
          order.order_number || '',
          order.status || '',
          order.source || 'pos',
          order.payment_method || '',
          order.customer_name || '',
          maskCustomerPhone(order.customer_phone),
          order.table_number || '',
          order.pickup_code || '',
          order.served_by_profile?.full_name || '',
          row.product_id || '',
          row.product_name || '',
          row.product_name_ar || '',
          quantity,
          refundedQty,
          netQty,
          unitPrice.toFixed(2),
          lineTotal.toFixed(2),
          netLineTotal.toFixed(2),
          Number(order.subtotal || 0).toFixed(2),
          Number(order.discount_amount || 0).toFixed(2),
          Number(order.discount_pct || 0).toFixed(2),
          Number(order.total || 0).toFixed(2),
          order.shift_id || '',
          row.notes || '',
        ]
      })

      downloadCsv(
        `sales_detail_${exportBranchId === 'all' ? 'all_branches' : selectedBranches[0]?.name || 'branch'}_${range.fromDate}_${range.toDate}`,
        [
          'timestamp_utc', 'business_date_tripoli', 'hour_tripoli', 'branch', 'order_number', 'order_status', 'source',
          'payment_method', 'customer_name', 'customer_phone_last4', 'table_number', 'pickup_code',
          'served_by', 'product_id', 'product_name', 'product_name_ar', 'quantity',
          'refunded_qty', 'net_quantity', 'unit_price_lyd', 'line_total_lyd',
          'net_line_total_lyd', 'order_subtotal_lyd', 'order_discount_lyd',
          'order_discount_pct', 'order_total_lyd', 'shift_id', 'line_notes',
        ],
        exportRows,
      )
      toast.success(`Exported ${exportRows.length} sale lines`)
    } catch (err) {
      toast.error(err.message || 'Sales export failed')
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <Layout>
        <p className="text-noch-muted text-center py-20">Loading…</p>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto py-6" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <h1 className="text-white font-bold text-2xl mb-2">{copy.title}</h1>
        <p className="text-noch-muted text-sm mb-4">
          {copy.businessDay}
        </p>

        {canViewSessions && (
          <>
            {/* Range presets */}
            <div className="mb-4">
              <BusinessRangePicker presets={PRESETS} value={{ preset: range.preset, from: range.fromDate, to: range.toDate }} onChange={next => setRange({ preset: next.preset, fromDate: next.from, toDate: next.to })} />
            </div>
            <div className="card p-4 mb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-white font-semibold text-sm flex items-center gap-2">
                    <Download size={15} className="text-noch-green" /> Export detailed sales
                  </h2>
                  <p className="text-noch-muted text-xs mt-1">One CSV row per sold item for the selected business-date range.</p>
                </div>
                <div className="flex items-center gap-2">
                  <select value={exportBranchId} onChange={event => setExportBranchId(event.target.value)} className="input text-sm">
                    <option value="all">All branches</option>
                    {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                  </select>
                  <button onClick={handleExport} disabled={exporting || branches.length === 0} className="btn-primary text-sm px-3 py-2 flex items-center justify-center gap-2 whitespace-nowrap">
                    <Download size={14} /> {exporting ? 'Exporting...' : 'Export CSV'}
                  </button>
                </div>
              </div>
            </div>
            {/* Grand total across branches */}
            <div className="card p-4 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp size={14} className="text-noch-green" />
                <p className="text-noch-muted text-xs">
                  All branches · {range.fromDate} → {range.toDate}
                </p>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <p className="text-noch-muted text-[10px] uppercase tracking-wider">{copy.netSales}</p>
                  <p className="text-noch-green font-bold text-lg leading-tight">{fmt(grand.net_sales)}</p>
                  <p className="text-noch-muted text-[10px]">completed sales less refunds · LYD</p>
                </div>
                <div>
                  <p className="text-noch-muted text-[10px] uppercase tracking-wider">{copy.orders}</p>
                  <p className="text-white font-bold text-lg leading-tight">{grand.order_count}</p>
                  <p className="text-noch-muted text-[10px]">
                    avg {fmt(grand.order_count ? grand.net_sales / grand.order_count : 0)} LYD
                  </p>
                </div>
                <div>
                  <p className="text-noch-muted text-[10px] uppercase tracking-wider">{copy.linkedRefunds}</p>
                  <p className="text-red-300 font-bold text-lg leading-tight">{fmt(grand.linked_refunds)}</p>
                  <p className="text-noch-muted text-[10px]">deducted from completed sales · LYD</p>
                </div>
                <div>
                  <p className="text-noch-muted text-[10px] uppercase tracking-wider">{copy.completedSales}</p>
                  <p className="text-white font-bold text-lg leading-tight">{fmt(grand.completed_sales)}</p>
                  <p className="text-noch-muted text-[10px]">after discounts · before refunds</p>
                </div>
              </div>
              <div className="border-t border-noch-border mt-4 pt-3">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <p className="text-white text-xs font-semibold">{copy.paymentReconciliation}</p>
                  {grand.paymentStatus === 'reconciled' ? (
                    <p className="text-noch-green text-[10px] flex items-center gap-1">
                      <CheckCircle2 size={11} /> {copy.reconciled}
                    </p>
                  ) : (
                    <p className="text-yellow-300 text-[10px] flex items-center gap-1">
                      <AlertTriangle size={11} /> {copy.variance} {fmt(grand.payment_reconciliation_variance)} {copy.currency}
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    [copy.cash, grand.gross_cash_tender],
                    [copy.card, grand.gross_card_tender],
                    [copy.presto, grand.gross_presto_tender],
                    [copy.other, grand.gross_other_tender],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg bg-black/20 px-3 py-2">
                      <p className="text-noch-muted text-[10px]">{label}</p>
                      <p className="text-white text-sm font-semibold">{fmt(value)} {copy.currency}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t border-noch-border mt-4 pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <p className="text-white text-xs font-semibold">{copy.periodMovement}</p>
                  <p className="text-noch-muted text-[10px]">
                    {copy.timingDifference} {fmt(grand.timing_variance)} {copy.currency}
                  </p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {[
                    [copy.cashNet, grand.period_cash_movement],
                    [copy.cardNet, grand.period_card_movement],
                    [copy.prestoNet, grand.period_presto_movement],
                    [copy.refunded, grand.period_refunds],
                    [copy.voids, grand.period_void_reversals],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg bg-black/20 px-3 py-2">
                      <p className="text-noch-muted text-[10px]">{label}</p>
                      <p className="text-white text-sm font-semibold">{fmt(value)} {copy.currency}</p>
                    </div>
                  ))}
                </div>
              </div>
              {(grand.reconstructed_event_count > 0 || grand.untracked_order_count > 0) && (
                <div className="rounded-lg border border-yellow-400/30 bg-yellow-400/10 px-3 py-2 mt-3 text-xs text-yellow-100">
                  {grand.reconstructed_event_count > 0 && (
                    <p>{grand.reconstructed_event_count} historical tender legs were reconstructed and are visibly identified.</p>
                  )}
                  {grand.untracked_order_count > 0 && (
                    <p>{grand.untracked_order_count} orders have no tender event. Financial control is incomplete.</p>
                  )}
                </div>
              )}
              {failedBranches.length > 0 && (
                <div className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 mt-3 text-xs text-red-200">
                  Unavailable branch data: {failedBranches.map(branch => branch.name).join(', ')}. Consolidated totals exclude these branches.
                </div>
              )}
              <div className="rounded-lg border border-blue-400/20 bg-blue-400/5 px-3 py-2 mt-3 text-[11px] text-blue-100">
                {copy.settlementUnavailable}
                {grand.presto_unsettled_count > 0 && (
                  <> Presto outstanding: {fmt(grand.presto_unsettled_amount)} LYD across {grand.presto_unsettled_count} orders.</>
                )}
              </div>
            </div>
          </>
        )}

        <div className="flex flex-col gap-4">
          {branches.map(b => {
            const result = totalsByBranch[b.id]
            const t = result?.data
            return (
              <div key={b.id} className="card p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-white font-semibold">{lang === 'ar' ? (b.name_ar || b.name) : b.name}</p>
                    {b.address && <p className="text-noch-muted text-sm mt-0.5">{b.address}</p>}
                  </div>
                  {canViewSessions && t && (
                    <div className="text-right">
                      <p className="text-noch-green font-bold text-lg leading-tight">
                        {fmt(t.net_sales)} <span className="text-xs">LYD net</span>
                      </p>
                      <p className="text-noch-muted text-xs">
                        {t.order_count} orders · refunds {fmt(t.linked_refunds)}
                      </p>
                      <p className="text-noch-muted text-[10px] mt-0.5">
                        cash {fmt(t.gross_cash_tender)} · card {fmt(t.gross_card_tender)} · Presto {fmt(t.gross_presto_tender)}
                      </p>
                    </div>
                  )}
                  {canViewSessions && result?.status === 'unavailable' && (
                    <div className="text-right text-red-300 text-xs">
                      {copy.dataUnavailable}
                    </div>
                  )}
                </div>
                <div className={`grid ${canViewSessions ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
                  <button
                    onClick={() => navigate(`/pos/${b.id}/orders`)}
                    className="btn-secondary text-sm py-2 flex items-center justify-center gap-2"
                  >
                    <ListOrdered size={14} /> {copy.orderEvidence}
                  </button>
                  {canViewSessions && (
                    <button
                      onClick={() => navigate(`/pos/${b.id}/sessions`)}
                      className="btn-secondary text-sm py-2 flex items-center justify-center gap-2"
                    >
                      <Clock size={14} /> {copy.shifts}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </Layout>
  )
}
