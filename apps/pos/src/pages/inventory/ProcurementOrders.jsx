import { useState, useEffect, useMemo } from 'react'
import { ShoppingCart, Plus, X, Check, Loader2, Package, Wallet, RotateCcw, TrendingUp, AlertTriangle } from 'lucide-react'
import Layout from '../../components/Layout'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import {
  getProcurementOrders,
  createProcurementOrder,
  updateProcurementOrder,
  getIngredientsForCost,
  getInventoryLocations,
  getInventoryStockValuation,
  getInventoryReorderSuggestions,
  getInventorySupplierPriceHistory,
  receiveProcurementOrder,
  returnProcurementOrder,
  supabase,
} from '../../lib/supabase'
import toast from 'react-hot-toast'

const AR = {
  procurementOrders: 'أوامر الشراء',
  orders: 'أوامر',
  addOrder: 'إضافة أمر',
  status: 'الحالة',
  all: 'الكل',
  ordered: 'مطلوب',
  received: 'مستلم',
  cancelled: 'ملغي',
  ingredient: 'المكون',
  supplier: 'المورد',
  qty: 'الكمية',
  unitCost: 'تكلفة الوحدة',
  shipping: 'الشحن',
  customs: 'الجمارك',
  other: 'أخرى',
  total: 'الإجمالي',
  date: 'التاريخ',
  actions: 'الإجراءات',
  noProcurementOrders: 'لا توجد أوامر شراء',
  paid: 'مدفوع',
  unpaid: 'غير مدفوع',
  pay: 'دفع',
  markReceived: 'تسجيل الاستلام',
  cancel: 'إلغاء',
  newProcurementOrder: 'أمر شراء جديد',
  selectIngredient: 'اختر المكون...',
  supplierName: 'اسم المورد',
  quantity: 'الكمية',
  unit: 'الوحدة',
  unitCostLyd: 'تكلفة الوحدة (LYD)',
  invoiceNo: 'رقم الفاتورة',
  invoiceDate: 'تاريخ الفاتورة',
  dueDate: 'تاريخ الاستحقاق',
  totalCost: 'إجمالي التكلفة',
  notes: 'ملاحظات',
  optionalNotes: 'ملاحظات اختيارية',
  createOrder: 'إنشاء الأمر',
  markAsReceived: 'تسجيل كاستلام',
  confirmReceived: 'تأكيد الاستلام',
  receiveHint: 'سيتم إضافة الكمية إلى المخزون كعملية توريد.',
  updateBulkCost: 'تحديث تكلفة شراء المكون إلى',
  paySupplierInvoice: 'دفع فاتورة المورد',
  paying: 'دفع',
  to: 'إلى',
  invoice: 'الفاتورة',
  payFrom: 'الدفع من',
  cash: 'الكاش',
  bank: 'البنك',
  paymentDate: 'تاريخ الدفع',
  reference: 'المرجع',
  paymentReferencePlaceholder: 'تحويل، إيصال كاش، شيك...',
  unknown: 'غير معروف',
  supplierFallback: 'المورد',
  loadError: 'تعذر تحميل بيانات المشتريات',
  requiredError: 'المكون والكمية مطلوبان',
  created: 'تم إنشاء الأمر',
  createError: 'تعذر إنشاء الأمر',
  receivedOk: 'تم استلام الأمر وتحديث المخزون وتسجيله محاسبياً',
  receiveError: 'تعذر استلام الأمر',
  paidOk: 'تم دفع فاتورة المورد وتسجيلها محاسبياً',
  payError: 'تعذر دفع الفاتورة',
  cancelledOk: 'تم إلغاء الأمر',
  cancelError: 'تعذر إلغاء الأمر',
}

const EN = {}
const localT = (lang, key, fallback) => (lang === 'ar' ? AR[key] : EN[key]) || fallback || key

function StatusBadge({ status, tr }) {
  const styles = {
    ordered: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
    partially_received: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
    received: 'bg-green-500/10 text-green-400 border-green-500/30',
    over_received: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
    cancelled: 'bg-red-500/10 text-red-400 border-red-500/30',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${styles[status] || styles.ordered}`}>
      {tr(status || 'ordered', status || 'ordered')}
    </span>
  )
}

export default function ProcurementOrders() {
  const { profile } = useAuth()
  const { lang } = useLanguage()
  const tr = (key, fallback) => localT(lang, key, fallback)
  const [orders, setOrders] = useState([])
  const [ingredients, setIngredients] = useState([])
  const [locations, setLocations] = useState([])
  const [locationsLoaded, setLocationsLoaded] = useState(false)
  const [valuationRows, setValuationRows] = useState([])
  const [reorderRows, setReorderRows] = useState([])
  const [priceHistory, setPriceHistory] = useState([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [statusFilter, setStatusFilter] = useState('all')
  const [ingredientFilter, setIngredientFilter] = useState('')

  // Add order modal
  const [showAddModal, setShowAddModal] = useState(false)
  const [form, setForm] = useState({
    ingredient_id: '',
    supplier_name: '',
    quantity_ordered: '',
    unit: 'kg',
    unit_cost_lyd: '',
    shipping_cost_lyd: '',
    customs_cost_lyd: '',
    other_cost_lyd: '',
    invoice_no: '',
    invoice_date: new Date().toISOString().slice(0, 10),
    due_date: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)

  // Receive modal
  const [receiveModal, setReceiveModal] = useState(null) // order object
  const [receiveQty, setReceiveQty] = useState('')
  const [receiveNotes, setReceiveNotes] = useState('')
  const [receiveLocationId, setReceiveLocationId] = useState('')
  const [updateBulkCost, setUpdateBulkCost] = useState(false)
  const [receiving, setReceiving] = useState(false)
  const [returnModal, setReturnModal] = useState(null)
  const [returnQty, setReturnQty] = useState('')
  const [returnReason, setReturnReason] = useState('')
  const [returnLocationId, setReturnLocationId] = useState('')
  const [returning, setReturning] = useState(false)
  const [paymentModal, setPaymentModal] = useState(null)
  const [paymentForm, setPaymentForm] = useState({ account: 'cash', paid_at: new Date().toISOString().slice(0, 10), reference: '' })

  useEffect(() => { loadData() }, [])
  useEffect(() => {
    if (!receiveModal && !returnModal) return
    if (locationsLoaded) return
    loadLocations()
  }, [receiveModal, returnModal, locationsLoaded])

  async function loadData() {
    try {
      setLoading(true)
      const [orderData, ingredientData, valuationData, reorderData, priceData] = await Promise.all([
        getProcurementOrders(),
        getIngredientsForCost(),
        getInventoryStockValuation().catch(() => []),
        getInventoryReorderSuggestions().catch(() => []),
        getInventorySupplierPriceHistory().catch(() => []),
      ])
      setOrders(orderData || [])
      setIngredients(ingredientData || [])
      setValuationRows(valuationData || [])
      setReorderRows(reorderData || [])
      setPriceHistory(priceData || [])
    } catch (err) {
      toast.error(tr('loadError', 'Failed to load procurement data'))
    } finally {
      setLoading(false)
    }
  }

  async function loadLocations() {
    try {
      const data = await getInventoryLocations()
      setLocations(data || [])
    } catch {
      setLocations([])
    } finally {
      setLocationsLoaded(true)
    }
  }

  const netReceived = (order) => Math.max(0, Number(order.quantity_received || 0) - Number(order.quantity_returned || 0))
  const remainingQty = (order) => Math.max(0, Number(order.quantity_ordered || 0) - Number(order.quantity_received || 0))
  const totalStockValue = useMemo(
    () => valuationRows.reduce((sum, row) => sum + Number(row.stock_value_lyd || 0), 0),
    [valuationRows],
  )

  // Calculate total
  const calcTotal = (f) => {
    const qty = parseFloat(f.quantity_ordered) || 0
    const unitCost = parseFloat(f.unit_cost_lyd) || 0
    const shipping = parseFloat(f.shipping_cost_lyd) || 0
    const customs = parseFloat(f.customs_cost_lyd) || 0
    const other = parseFloat(f.other_cost_lyd) || 0
    return (qty * unitCost) + shipping + customs + other
  }

  // Filtered orders
  const filtered = orders.filter(o => {
    if (statusFilter !== 'all' && o.status !== statusFilter) return false
    if (ingredientFilter && o.ingredient_id !== ingredientFilter) return false
    return true
  })

  // Totals
  const totalCost = filtered.reduce((sum, o) => sum + (parseFloat(o.total_cost_lyd) || 0), 0)

  // Create order
  async function handleCreateOrder() {
    if (!form.ingredient_id || !form.quantity_ordered) {
      toast.error(tr('requiredError', 'Ingredient and quantity are required'))
      return
    }
    setSaving(true)
    try {
      const total = calcTotal(form)
      await createProcurementOrder({
        ingredient_id: form.ingredient_id,
        supplier_name: form.supplier_name || null,
        quantity_ordered: parseFloat(form.quantity_ordered),
        unit: form.unit,
        unit_cost_lyd: parseFloat(form.unit_cost_lyd) || 0,
        shipping_cost_lyd: parseFloat(form.shipping_cost_lyd) || 0,
        customs_cost_lyd: parseFloat(form.customs_cost_lyd) || 0,
        other_cost_lyd: parseFloat(form.other_cost_lyd) || 0,
        total_cost_lyd: total,
        invoice_no: form.invoice_no || null,
        invoice_date: form.invoice_date || null,
        due_date: form.due_date || null,
        notes: form.notes || null,
        ordered_by: profile?.id || null,
        status: 'ordered',
      })
      toast.success(tr('created', 'Order created'))
      setShowAddModal(false)
      setForm({ ingredient_id: '', supplier_name: '', quantity_ordered: '', unit: 'kg', unit_cost_lyd: '', shipping_cost_lyd: '', customs_cost_lyd: '', other_cost_lyd: '', invoice_no: '', invoice_date: new Date().toISOString().slice(0, 10), due_date: '', notes: '' })
      await loadData()
    } catch (err) {
      toast.error(err.message || tr('createError', 'Failed to create order'))
    } finally {
      setSaving(false)
    }
  }

  // Mark received
  async function handleReceive() {
    if (!receiveModal) return
    setReceiving(true)
    try {
      await receiveProcurementOrder({
        orderId: receiveModal.id,
        receivedQty: parseFloat(receiveQty) || 0,
        receivedAt: new Date().toISOString(),
        updateBulkCost,
        receiptNotes: receiveNotes || null,
        locationId: receiveLocationId || null,
      })
      toast.success(tr('receivedOk', 'Order received, stock updated, and accounting posted'))
      setReceiveModal(null)
      setReceiveQty('')
      setReceiveNotes('')
      setReceiveLocationId('')
      setUpdateBulkCost(false)
      await loadData()
    } catch (err) {
      toast.error(err.message || tr('receiveError', 'Failed to receive order'))
    } finally {
      setReceiving(false)
    }
  }

  async function handleReturn() {
    if (!returnModal) return
    setReturning(true)
    try {
      await returnProcurementOrder({
        orderId: returnModal.id,
        returnQty: parseFloat(returnQty) || 0,
        returnedAt: new Date().toISOString(),
        reason: returnReason || null,
        locationId: returnLocationId || null,
      })
      toast.success('Purchase return posted to stock and accounting')
      setReturnModal(null)
      setReturnQty('')
      setReturnReason('')
      setReturnLocationId('')
      await loadData()
    } catch (err) {
      toast.error(err.message || 'Failed to process purchase return')
    } finally {
      setReturning(false)
    }
  }

  async function handlePay() {
    if (!paymentModal) return
    setReceiving(true)
    try {
      const { error } = await supabase.rpc('pay_procurement_order', {
        p_order_id: paymentModal.id,
        p_payment_account_key: paymentForm.account,
        p_paid_at: paymentForm.paid_at,
        p_reference: paymentForm.reference || null,
      })
      if (error) throw error
      toast.success(tr('paidOk', 'Supplier invoice paid and accounting posted'))
      setPaymentModal(null)
      setPaymentForm({ account: 'cash', paid_at: new Date().toISOString().slice(0, 10), reference: '' })
      await loadData()
    } catch (err) {
      toast.error(err.message || tr('payError', 'Failed to pay invoice'))
    } finally {
      setReceiving(false)
    }
  }

  // Cancel order
  async function handleCancel(order) {
    try {
      await updateProcurementOrder(order.id, { status: 'cancelled' })
      toast.success(tr('cancelledOk', 'Order cancelled'))
      await loadData()
    } catch (err) {
      toast.error(err.message || tr('cancelError', 'Failed to cancel order'))
    }
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">{tr('procurementOrders', 'Procurement Orders')}</h1>
            <p className="text-noch-muted text-sm mt-1">{filtered.length} {tr('orders', 'orders')}</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-noch-green/10 text-noch-green border border-noch-green/30 rounded-lg px-4 py-2 text-sm font-medium hover:bg-noch-green/20 transition-colors flex items-center gap-2"
          >
            <Plus size={16} /> {tr('addOrder', 'Add Order')}
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-noch-muted text-xs">{tr('status', 'Status')}:</label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 bg-noch-card border border-noch-border rounded-lg text-white text-sm focus:outline-none focus:border-noch-green/50"
            >
              <option value="all">{tr('all', 'All')}</option>
              <option value="ordered">{tr('ordered', 'Ordered')}</option>
              <option value="partially_received">Partially received</option>
              <option value="received">{tr('received', 'Received')}</option>
              <option value="over_received">Over received</option>
              <option value="cancelled">{tr('cancelled', 'Cancelled')}</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-noch-muted text-xs">{tr('ingredient', 'Ingredient')}:</label>
            <select
              value={ingredientFilter}
              onChange={e => setIngredientFilter(e.target.value)}
              className="px-3 py-1.5 bg-noch-card border border-noch-border rounded-lg text-white text-sm focus:outline-none focus:border-noch-green/50"
            >
              <option value="">{tr('all', 'All')}</option>
              {ingredients.map(ing => (
                <option key={ing.id} value={ing.id}>{ing.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="rounded-xl border border-noch-border bg-noch-card p-4">
            <p className="text-noch-muted text-xs mb-1">Outstanding supplier invoices</p>
            <p className="text-white text-xl font-bold">
              {orders.filter(order => order.status !== 'cancelled' && order.payment_status !== 'paid').length}
            </p>
          </div>
          <div className="rounded-xl border border-noch-border bg-noch-card p-4">
            <p className="text-noch-muted text-xs mb-1 flex items-center gap-1"><AlertTriangle size={12} /> Reorder alerts</p>
            <p className="text-yellow-300 text-xl font-bold">{reorderRows.length}</p>
          </div>
          <div className="rounded-xl border border-noch-border bg-noch-card p-4">
            <p className="text-noch-muted text-xs mb-1 flex items-center gap-1"><Package size={12} /> Stock valuation</p>
            <p className="text-white text-xl font-bold">{totalStockValue.toFixed(2)} LYD</p>
          </div>
          <div className="rounded-xl border border-noch-border bg-noch-card p-4">
            <p className="text-noch-muted text-xs mb-1 flex items-center gap-1"><TrendingUp size={12} /> Recent supplier price updates</p>
            <p className="text-white text-xl font-bold">{priceHistory.length}</p>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-noch-green" size={24} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-noch-muted">
            <ShoppingCart size={40} className="mx-auto mb-3 opacity-50" />
            <p>{tr('noProcurementOrders', 'No procurement orders')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-noch-muted text-xs border-b border-noch-border">
                  <th className="text-left py-3 px-3">{tr('ingredient', 'Ingredient')}</th>
                  <th className="text-left py-3 px-3">{tr('supplier', 'Supplier')}</th>
                  <th className="text-right py-3 px-3">{tr('qty', 'Qty')}</th>
                  <th className="text-right py-3 px-3">{tr('unitCost', 'Unit Cost')}</th>
                  <th className="text-right py-3 px-3">{tr('shipping', 'Shipping')}</th>
                  <th className="text-right py-3 px-3">{tr('customs', 'Customs')}</th>
                  <th className="text-right py-3 px-3">{tr('other', 'Other')}</th>
                  <th className="text-right py-3 px-3">{tr('total', 'Total')}</th>
                  <th className="text-left py-3 px-3">{tr('date', 'Date')}</th>
                  <th className="text-left py-3 px-3">{tr('status', 'Status')}</th>
                  <th className="text-right py-3 px-3">{tr('actions', 'Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(order => (
                  <tr key={order.id} className="border-b border-noch-border/50 hover:bg-noch-border/20">
                    <td className="py-3 px-3 text-white font-medium">{order.ingredient?.name || '—'}</td>
                    <td className="py-3 px-3 text-noch-muted">{order.supplier_name || '—'}</td>
                    <td className="py-3 px-3 text-right">
                      <p className="text-white">{order.quantity_ordered} {order.unit}</p>
                      <p className="text-[11px] text-noch-muted">
                        received {Number(order.quantity_received || 0).toFixed(2)} · returned {Number(order.quantity_returned || 0).toFixed(2)}
                      </p>
                    </td>
                    <td className="py-3 px-3 text-white text-right">{order.unit_cost_lyd || 0}</td>
                    <td className="py-3 px-3 text-noch-muted text-right">{order.shipping_cost_lyd || 0}</td>
                    <td className="py-3 px-3 text-noch-muted text-right">{order.customs_cost_lyd || 0}</td>
                    <td className="py-3 px-3 text-noch-muted text-right">{order.other_cost_lyd || 0}</td>
                    <td className="py-3 px-3 text-white font-medium text-right">{parseFloat(order.total_cost_lyd || 0).toFixed(2)}</td>
                    <td className="py-3 px-3 text-noch-muted text-xs">{new Date(order.created_at).toLocaleDateString()}</td>
                    <td className="py-3 px-3">
                      <StatusBadge status={order.status} tr={tr} />
                      {remainingQty(order) > 0 && order.status !== 'cancelled' && (
                        <p className="text-noch-muted text-xs mt-1">remaining {remainingQty(order).toFixed(2)} {order.unit}</p>
                      )}
                      {netReceived(order) > 0 && (
                        <p className="text-noch-muted text-xs mt-1">net on hand {netReceived(order).toFixed(2)} {order.unit}</p>
                      )}
                      {order.payment_status === 'paid' ? (
                        <p className="text-blue-300 text-xs mt-1">{tr('paid', 'Paid')} {order.paid_at || ''}</p>
                      ) : (
                        <p className="text-noch-muted text-xs mt-1">{tr('unpaid', 'Unpaid')}</p>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      {(order.status === 'ordered' || order.status === 'partially_received') && (
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => {
                              setReceiveModal(order)
                              setReceiveQty(String(remainingQty(order) || order.quantity_ordered || ''))
                              setReceiveNotes('')
                              setReceiveLocationId('')
                              setUpdateBulkCost(false)
                            }}
                            className="text-green-400 hover:text-green-300 text-xs px-2 py-1 rounded hover:bg-green-500/10"
                            title={tr('markReceived', 'Mark Received')}
                          >
                            <Check size={14} />
                          </button>
                          <button
                            onClick={() => handleCancel(order)}
                            className="text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded hover:bg-red-500/10"
                            title={tr('cancel', 'Cancel')}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      )}
                      {netReceived(order) > 0 && order.status !== 'cancelled' && (
                        <button
                          onClick={() => {
                            setReturnModal(order)
                            setReturnQty(String(netReceived(order)))
                            setReturnReason('')
                            setReturnLocationId('')
                          }}
                          className="text-yellow-300 hover:text-yellow-200 text-xs px-2 py-1 rounded hover:bg-yellow-500/10 inline-flex items-center gap-1 mt-1"
                          title="Purchase return"
                        >
                          <RotateCcw size={14} /> Return
                        </button>
                      )}
                      {(order.status === 'received' || order.status === 'over_received') && order.payment_status !== 'paid' && (
                        <button
                          onClick={() => setPaymentModal(order)}
                          className="text-blue-400 hover:text-blue-300 text-xs px-2 py-1 rounded hover:bg-blue-500/10 inline-flex items-center gap-1"
                          title={tr('paySupplierInvoice', 'Pay Supplier Invoice')}
                        >
                          <Wallet size={14} /> {tr('pay', 'Pay')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {/* Totals row */}
                <tr className="border-t-2 border-noch-border bg-noch-dark/50">
                  <td colSpan={7} className="py-3 px-3 text-noch-muted font-medium text-right">{tr('total', 'Total')}:</td>
                  <td className="py-3 px-3 text-noch-green font-bold text-right">{totalCost.toFixed(2)} LYD</td>
                  <td colSpan={3}></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_1fr] gap-4">
          <div className="rounded-xl border border-noch-border bg-noch-card p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-white font-semibold">Reorder suggestions</h2>
              <span className="text-noch-muted text-xs">{reorderRows.length} items</span>
            </div>
            {reorderRows.length === 0 ? (
              <p className="text-noch-muted text-sm">No ingredients are currently below threshold.</p>
            ) : (
              <div className="space-y-2">
                {reorderRows.slice(0, 6).map(row => (
                  <div key={row.ingredient_id} className="rounded-lg border border-noch-border/60 bg-noch-dark/40 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-white text-sm font-medium">{row.ingredient_name}</p>
                      <span className={`text-[10px] font-semibold uppercase ${row.priority === 'critical' ? 'text-red-400' : 'text-yellow-300'}`}>
                        {row.priority}
                      </span>
                    </div>
                    <p className="text-noch-muted text-xs mt-1">
                      on hand {Number(row.qty_available || 0).toFixed(2)} {row.unit} · threshold {Number(row.min_threshold || 0).toFixed(2)}
                    </p>
                    <p className="text-noch-green text-xs mt-1">suggested reorder {Number(row.suggested_reorder_qty || 0).toFixed(2)} {row.unit}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-noch-border bg-noch-card p-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h2 className="text-white font-semibold">Supplier price history</h2>
                <span className="text-noch-muted text-xs">recent receipts</span>
              </div>
              {priceHistory.length === 0 ? (
                <p className="text-noch-muted text-sm">No supplier price history yet.</p>
              ) : (
                <div className="space-y-2">
                  {priceHistory.slice(0, 5).map(row => {
                    const previous = Number(row.previous_unit_cost_lyd || 0)
                    const current = Number(row.unit_cost_lyd || 0)
                    const delta = previous > 0 ? (((current - previous) / previous) * 100) : null
                    return (
                      <div key={`${row.procurement_order_id}-${row.effective_date}`} className="rounded-lg border border-noch-border/60 bg-noch-dark/40 px-3 py-2">
                        <p className="text-white text-sm font-medium">{row.ingredient_name}</p>
                        <p className="text-noch-muted text-xs mt-0.5">{row.supplier_name || 'Unspecified supplier'} · {row.effective_date}</p>
                        <div className="flex items-center justify-between mt-2 text-xs font-mono">
                          <span className="text-white">{current.toFixed(2)} LYD/{row.unit || '-'}</span>
                          <span className={delta == null ? 'text-noch-muted' : delta > 0 ? 'text-red-400' : delta < 0 ? 'text-noch-green' : 'text-noch-muted'}>
                            {delta == null ? 'new' : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-noch-border bg-noch-card p-4">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h2 className="text-white font-semibold">Warehouse signals</h2>
                <span className="text-noch-muted text-xs">{locations.length} active locations</span>
              </div>
              <p className="text-noch-muted text-sm">
                Receipts can now be assigned to a specific warehouse or storage location without changing legacy stock tables.
              </p>
              <p className="text-white text-sm mt-3">Tracked valuation: {totalStockValue.toFixed(2)} LYD</p>
            </div>
          </div>
        </div>

        {/* Add Order Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-noch-card border border-noch-border rounded-xl p-6 w-full max-w-md max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold text-lg">{tr('newProcurementOrder', 'New Procurement Order')}</h2>
                <button onClick={() => setShowAddModal(false)} className="text-noch-muted hover:text-white"><X size={20} /></button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-noch-muted text-xs mb-1 block">{tr('ingredient', 'Ingredient')} *</label>
                  <select
                    value={form.ingredient_id}
                    onChange={e => setForm({ ...form, ingredient_id: e.target.value })}
                    className="w-full px-3 py-2 bg-noch-dark border border-noch-border rounded-lg text-white text-sm focus:outline-none focus:border-noch-green/50"
                  >
                    <option value="">{tr('selectIngredient', 'Select ingredient...')}</option>
                    {ingredients.map(ing => (
                      <option key={ing.id} value={ing.id}>{ing.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-noch-muted text-xs mb-1 block">{tr('supplierName', 'Supplier Name')}</label>
                  <input
                    type="text"
                    value={form.supplier_name}
                    onChange={e => setForm({ ...form, supplier_name: e.target.value })}
                    className="w-full px-3 py-2 bg-noch-dark border border-noch-border rounded-lg text-white text-sm focus:outline-none focus:border-noch-green/50"
                    placeholder={tr('supplierName', 'Supplier name')}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-noch-muted text-xs mb-1 block">{tr('quantity', 'Quantity')} *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.quantity_ordered}
                      onChange={e => setForm({ ...form, quantity_ordered: e.target.value })}
                      className="w-full px-3 py-2 bg-noch-dark border border-noch-border rounded-lg text-white text-sm focus:outline-none focus:border-noch-green/50"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="text-noch-muted text-xs mb-1 block">{tr('unit', 'Unit')}</label>
                    <input
                      type="text"
                      value={form.unit}
                      onChange={e => setForm({ ...form, unit: e.target.value })}
                      className="w-full px-3 py-2 bg-noch-dark border border-noch-border rounded-lg text-white text-sm focus:outline-none focus:border-noch-green/50"
                      placeholder="kg"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-noch-muted text-xs mb-1 block">{tr('unitCostLyd', 'Unit Cost (LYD)')}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.unit_cost_lyd}
                    onChange={e => setForm({ ...form, unit_cost_lyd: e.target.value })}
                    className="w-full px-3 py-2 bg-noch-dark border border-noch-border rounded-lg text-white text-sm focus:outline-none focus:border-noch-green/50"
                    placeholder="0.00"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-noch-muted text-xs mb-1 block">{tr('shipping', 'Shipping')}</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.shipping_cost_lyd}
                      onChange={e => setForm({ ...form, shipping_cost_lyd: e.target.value })}
                      className="w-full px-3 py-2 bg-noch-dark border border-noch-border rounded-lg text-white text-sm focus:outline-none focus:border-noch-green/50"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="text-noch-muted text-xs mb-1 block">{tr('customs', 'Customs')}</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.customs_cost_lyd}
                      onChange={e => setForm({ ...form, customs_cost_lyd: e.target.value })}
                      className="w-full px-3 py-2 bg-noch-dark border border-noch-border rounded-lg text-white text-sm focus:outline-none focus:border-noch-green/50"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="text-noch-muted text-xs mb-1 block">{tr('other', 'Other')}</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.other_cost_lyd}
                      onChange={e => setForm({ ...form, other_cost_lyd: e.target.value })}
                      className="w-full px-3 py-2 bg-noch-dark border border-noch-border rounded-lg text-white text-sm focus:outline-none focus:border-noch-green/50"
                      placeholder="0"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-noch-muted text-xs mb-1 block">{tr('invoiceNo', 'Invoice No.')}</label>
                    <input
                      type="text"
                      value={form.invoice_no}
                      onChange={e => setForm({ ...form, invoice_no: e.target.value })}
                      className="w-full px-3 py-2 bg-noch-dark border border-noch-border rounded-lg text-white text-sm focus:outline-none focus:border-noch-green/50"
                    />
                  </div>
                  <div>
                    <label className="text-noch-muted text-xs mb-1 block">{tr('invoiceDate', 'Invoice Date')}</label>
                    <input
                      type="date"
                      value={form.invoice_date}
                      onChange={e => setForm({ ...form, invoice_date: e.target.value })}
                      className="w-full px-3 py-2 bg-noch-dark border border-noch-border rounded-lg text-white text-sm focus:outline-none focus:border-noch-green/50"
                    />
                  </div>
                  <div>
                    <label className="text-noch-muted text-xs mb-1 block">{tr('dueDate', 'Due Date')}</label>
                    <input
                      type="date"
                      value={form.due_date}
                      onChange={e => setForm({ ...form, due_date: e.target.value })}
                      className="w-full px-3 py-2 bg-noch-dark border border-noch-border rounded-lg text-white text-sm focus:outline-none focus:border-noch-green/50"
                    />
                  </div>
                </div>
                {/* Auto-calculated total */}
                <div className="bg-noch-dark rounded-lg p-3 flex items-center justify-between">
                  <span className="text-noch-muted text-sm">{tr('totalCost', 'Total Cost')}:</span>
                  <span className="text-noch-green font-bold">{calcTotal(form).toFixed(2)} LYD</span>
                </div>
                <div>
                  <label className="text-noch-muted text-xs mb-1 block">{tr('notes', 'Notes')}</label>
                  <input
                    type="text"
                    value={form.notes}
                    onChange={e => setForm({ ...form, notes: e.target.value })}
                    className="w-full px-3 py-2 bg-noch-dark border border-noch-border rounded-lg text-white text-sm focus:outline-none focus:border-noch-green/50"
                    placeholder={tr('optionalNotes', 'Optional notes')}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <button onClick={() => setShowAddModal(false)} className="px-4 py-2 text-sm text-noch-muted hover:text-white">{tr('cancel', 'Cancel')}</button>
                <button
                  onClick={handleCreateOrder}
                  disabled={saving || !form.ingredient_id || !form.quantity_ordered}
                  className="bg-noch-green/10 text-noch-green border border-noch-green/30 rounded-lg px-4 py-2 text-sm font-medium hover:bg-noch-green/20 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  {tr('createOrder', 'Create Order')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Receive Modal */}
        {receiveModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-noch-card border border-noch-border rounded-xl p-6 w-full max-w-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold">{tr('markAsReceived', 'Mark as Received')}</h2>
                <button onClick={() => { setReceiveModal(null); setUpdateBulkCost(false) }} className="text-noch-muted hover:text-white"><X size={20} /></button>
              </div>
              <div className="space-y-3">
                <p className="text-noch-muted text-sm">
                  {tr('received', 'Receiving')} <span className="text-white font-medium">{receiveModal.quantity_ordered} {receiveModal.unit}</span>{' '}
                  <span className="text-white font-medium">{receiveModal.ingredient?.name || tr('unknown', 'Unknown')}</span>
                </p>
                <p className="text-noch-muted text-xs">{tr('receiveHint', 'This will add the quantity to current stock as a restock entry.')}</p>
                <div>
                  <label className="text-noch-muted text-xs mb-1 block">Receipt quantity</label>
                  <input
                    type="number"
                    step="0.01"
                    value={receiveQty}
                    onChange={e => setReceiveQty(e.target.value)}
                    className="w-full px-3 py-2 bg-noch-dark border border-noch-border rounded-lg text-white text-sm focus:outline-none focus:border-noch-green/50"
                  />
                  <p className="text-noch-muted text-[11px] mt-1">
                    Ordered {Number(receiveModal.quantity_ordered || 0).toFixed(2)} · already received {Number(receiveModal.quantity_received || 0).toFixed(2)} · remaining {remainingQty(receiveModal).toFixed(2)}
                  </p>
                </div>
                <div>
                  <label className="text-noch-muted text-xs mb-1 block">Warehouse / location</label>
                  <select
                    value={receiveLocationId}
                    onChange={e => setReceiveLocationId(e.target.value)}
                    className="w-full px-3 py-2 bg-noch-dark border border-noch-border rounded-lg text-white text-sm focus:outline-none focus:border-noch-green/50"
                  >
                    <option value="">Main stock only</option>
                    {locations.map(location => (
                      <option key={location.id} value={location.id}>{location.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-noch-muted text-xs mb-1 block">Receipt notes</label>
                  <textarea
                    rows={2}
                    value={receiveNotes}
                    onChange={e => setReceiveNotes(e.target.value)}
                    className="w-full px-3 py-2 bg-noch-dark border border-noch-border rounded-lg text-white text-sm resize-none focus:outline-none focus:border-noch-green/50"
                    placeholder="Partial delivery, overage, damaged bags excluded..."
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={updateBulkCost}
                    onChange={e => setUpdateBulkCost(e.target.checked)}
                    className="w-4 h-4 rounded border-noch-border bg-noch-dark text-noch-green focus:ring-noch-green"
                  />
                  <span className="text-sm text-noch-muted">{tr('updateBulkCost', 'Update ingredient bulk cost to')} {receiveModal.unit_cost_lyd} LYD/{receiveModal.unit}</span>
                </label>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <button onClick={() => { setReceiveModal(null); setUpdateBulkCost(false) }} className="px-4 py-2 text-sm text-noch-muted hover:text-white">{tr('cancel', 'Cancel')}</button>
                <button
                  onClick={handleReceive}
                  disabled={receiving || !(parseFloat(receiveQty) > 0)}
                  className="bg-green-500/10 text-green-400 border border-green-500/30 rounded-lg px-4 py-2 text-sm font-medium hover:bg-green-500/20 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {receiving && <Loader2 size={14} className="animate-spin" />}
                  <Check size={14} /> {tr('confirmReceived', 'Confirm Received')}
                </button>
              </div>
            </div>
          </div>
        )}

        {returnModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-noch-card border border-noch-border rounded-xl p-6 w-full max-w-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold">Purchase Return</h2>
                <button onClick={() => setReturnModal(null)} className="text-noch-muted hover:text-white"><X size={20} /></button>
              </div>
              <div className="space-y-3">
                <p className="text-noch-muted text-sm">
                  Returning <span className="text-white font-medium">{returnModal.ingredient?.name || tr('unknown', 'Unknown')}</span>{' '}
                  to <span className="text-white font-medium">{returnModal.supplier_name || tr('supplierFallback', 'supplier')}</span>
                </p>
                <div>
                  <label className="text-noch-muted text-xs mb-1 block">Return quantity</label>
                  <input
                    type="number"
                    step="0.01"
                    value={returnQty}
                    onChange={e => setReturnQty(e.target.value)}
                    className="w-full px-3 py-2 bg-noch-dark border border-noch-border rounded-lg text-white text-sm focus:outline-none focus:border-yellow-400/50"
                  />
                  <p className="text-noch-muted text-[11px] mt-1">
                    Available to return {netReceived(returnModal).toFixed(2)} {returnModal.unit}
                  </p>
                </div>
                <div>
                  <label className="text-noch-muted text-xs mb-1 block">Warehouse / location</label>
                  <select
                    value={returnLocationId}
                    onChange={e => setReturnLocationId(e.target.value)}
                    className="w-full px-3 py-2 bg-noch-dark border border-noch-border rounded-lg text-white text-sm focus:outline-none focus:border-yellow-400/50"
                  >
                    <option value="">Main stock only</option>
                    {locations.map(location => (
                      <option key={location.id} value={location.id}>{location.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-noch-muted text-xs mb-1 block">Reason</label>
                  <textarea
                    rows={2}
                    value={returnReason}
                    onChange={e => setReturnReason(e.target.value)}
                    className="w-full px-3 py-2 bg-noch-dark border border-noch-border rounded-lg text-white text-sm resize-none focus:outline-none focus:border-yellow-400/50"
                    placeholder="Damaged stock, short expiry, supplier pickup..."
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <button onClick={() => setReturnModal(null)} className="px-4 py-2 text-sm text-noch-muted hover:text-white">{tr('cancel', 'Cancel')}</button>
                <button
                  onClick={handleReturn}
                  disabled={returning || !(parseFloat(returnQty) > 0)}
                  className="bg-yellow-500/10 text-yellow-300 border border-yellow-500/30 rounded-lg px-4 py-2 text-sm font-medium hover:bg-yellow-500/20 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {returning && <Loader2 size={14} className="animate-spin" />}
                  <RotateCcw size={14} /> Confirm return
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Payment Modal */}
        {paymentModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-noch-card border border-noch-border rounded-xl p-6 w-full max-w-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold">{tr('paySupplierInvoice', 'Pay Supplier Invoice')}</h2>
                <button onClick={() => setPaymentModal(null)} className="text-noch-muted hover:text-white"><X size={20} /></button>
              </div>
              <div className="space-y-3">
                <p className="text-noch-muted text-sm">
                  {tr('paying', 'Paying')} <span className="text-white font-medium">{parseFloat(paymentModal.total_cost_lyd || 0).toFixed(2)} LYD</span>
                  {' '}{tr('to', 'to')} <span className="text-white font-medium">{paymentModal.supplier_name || tr('supplierFallback', 'supplier')}</span>
                </p>
                {paymentModal.invoice_no && <p className="text-noch-muted text-xs">{tr('invoice', 'Invoice')}: {paymentModal.invoice_no}</p>}
                <div>
                  <label className="text-noch-muted text-xs mb-1 block">{tr('payFrom', 'Pay from')}</label>
                  <select
                    value={paymentForm.account}
                    onChange={e => setPaymentForm({ ...paymentForm, account: e.target.value })}
                    className="w-full px-3 py-2 bg-noch-dark border border-noch-border rounded-lg text-white text-sm focus:outline-none focus:border-noch-green/50"
                  >
                    <option value="cash">{tr('cash', 'Cash')}</option>
                    <option value="bank">{tr('bank', 'Bank')}</option>
                  </select>
                </div>
                <div>
                  <label className="text-noch-muted text-xs mb-1 block">{tr('paymentDate', 'Payment Date')}</label>
                  <input
                    type="date"
                    value={paymentForm.paid_at}
                    onChange={e => setPaymentForm({ ...paymentForm, paid_at: e.target.value })}
                    className="w-full px-3 py-2 bg-noch-dark border border-noch-border rounded-lg text-white text-sm focus:outline-none focus:border-noch-green/50"
                  />
                </div>
                <div>
                  <label className="text-noch-muted text-xs mb-1 block">{tr('reference', 'Reference')}</label>
                  <input
                    type="text"
                    value={paymentForm.reference}
                    onChange={e => setPaymentForm({ ...paymentForm, reference: e.target.value })}
                    className="w-full px-3 py-2 bg-noch-dark border border-noch-border rounded-lg text-white text-sm focus:outline-none focus:border-noch-green/50"
                    placeholder={tr('paymentReferencePlaceholder', 'Transfer, cash receipt, cheque...')}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <button onClick={() => setPaymentModal(null)} className="px-4 py-2 text-sm text-noch-muted hover:text-white">{tr('cancel', 'Cancel')}</button>
                <button
                  onClick={handlePay}
                  disabled={receiving || !paymentForm.paid_at}
                  className="bg-blue-500/10 text-blue-400 border border-blue-500/30 rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-500/20 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {receiving && <Loader2 size={14} className="animate-spin" />}
                  <Wallet size={14} /> {tr('pay', 'Pay')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
