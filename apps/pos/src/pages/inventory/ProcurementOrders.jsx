import { useState, useEffect } from 'react'
import { ShoppingCart, Plus, X, Check, Loader2, Package } from 'lucide-react'
import Layout from '../../components/Layout'
import { useAuth } from '../../contexts/AuthContext'
import {
  getProcurementOrders,
  createProcurementOrder,
  updateProcurementOrder,
  getIngredientsForCost,
  updateStockQty,
  upsertStock,
  getStock,
  updateIngredientForCost,
} from '../../lib/supabase'
import toast from 'react-hot-toast'

function StatusBadge({ status }) {
  const styles = {
    ordered: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
    received: 'bg-green-500/10 text-green-400 border-green-500/30',
    cancelled: 'bg-red-500/10 text-red-400 border-red-500/30',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${styles[status] || styles.ordered}`}>
      {status || 'ordered'}
    </span>
  )
}

export default function ProcurementOrders() {
  const { profile } = useAuth()
  const [orders, setOrders] = useState([])
  const [ingredients, setIngredients] = useState([])
  const [stock, setStock] = useState([])
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
    notes: '',
  })
  const [saving, setSaving] = useState(false)

  // Receive modal
  const [receiveModal, setReceiveModal] = useState(null) // order object
  const [updateBulkCost, setUpdateBulkCost] = useState(false)
  const [receiving, setReceiving] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    try {
      setLoading(true)
      const [orderData, ingredientData, stockData] = await Promise.all([
        getProcurementOrders(),
        getIngredientsForCost(),
        getStock(),
      ])
      setOrders(orderData || [])
      setIngredients(ingredientData || [])
      setStock(stockData || [])
    } catch (err) {
      toast.error('Failed to load procurement data')
    } finally {
      setLoading(false)
    }
  }

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
      toast.error('Ingredient and quantity are required')
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
        notes: form.notes || null,
        ordered_by: profile?.full_name || 'Owner',
        status: 'ordered',
      })
      toast.success('Order created')
      setShowAddModal(false)
      setForm({ ingredient_id: '', supplier_name: '', quantity_ordered: '', unit: 'kg', unit_cost_lyd: '', shipping_cost_lyd: '', customs_cost_lyd: '', other_cost_lyd: '', notes: '' })
      await loadData()
    } catch (err) {
      toast.error(err.message || 'Failed to create order')
    } finally {
      setSaving(false)
    }
  }

  // Mark received
  async function handleReceive() {
    if (!receiveModal) return
    setReceiving(true)
    try {
      // Update order status
      await updateProcurementOrder(receiveModal.id, { status: 'received', received_at: new Date().toISOString() })

      // Update stock
      const existing = stock.find(s => s.ingredient_id === receiveModal.ingredient_id)
      const currentQty = existing ? parseFloat(existing.qty_available) : 0
      const addQty = parseFloat(receiveModal.quantity_ordered) || 0
      if (existing) {
        await updateStockQty(receiveModal.ingredient_id, currentQty + addQty, 'restock', `Procurement order received`)
      } else {
        await upsertStock(receiveModal.ingredient_id, addQty, receiveModal.unit, 0)
      }

      // Optionally update bulk cost
      if (updateBulkCost && receiveModal.unit_cost_lyd) {
        await updateIngredientForCost(receiveModal.ingredient_id, {
          bulk_cost: parseFloat(receiveModal.unit_cost_lyd),
          bulk_unit: receiveModal.unit,
        })
      }

      toast.success('Order marked as received and stock updated')
      setReceiveModal(null)
      setUpdateBulkCost(false)
      await loadData()
    } catch (err) {
      toast.error(err.message || 'Failed to receive order')
    } finally {
      setReceiving(false)
    }
  }

  // Cancel order
  async function handleCancel(order) {
    try {
      await updateProcurementOrder(order.id, { status: 'cancelled' })
      toast.success('Order cancelled')
      await loadData()
    } catch (err) {
      toast.error(err.message || 'Failed to cancel order')
    }
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Procurement Orders</h1>
            <p className="text-noch-muted text-sm mt-1">{filtered.length} orders</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-noch-green/10 text-noch-green border border-noch-green/30 rounded-lg px-4 py-2 text-sm font-medium hover:bg-noch-green/20 transition-colors flex items-center gap-2"
          >
            <Plus size={16} /> Add Order
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-noch-muted text-xs">Status:</label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 bg-noch-card border border-noch-border rounded-lg text-white text-sm focus:outline-none focus:border-noch-green/50"
            >
              <option value="all">All</option>
              <option value="ordered">Ordered</option>
              <option value="received">Received</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-noch-muted text-xs">Ingredient:</label>
            <select
              value={ingredientFilter}
              onChange={e => setIngredientFilter(e.target.value)}
              className="px-3 py-1.5 bg-noch-card border border-noch-border rounded-lg text-white text-sm focus:outline-none focus:border-noch-green/50"
            >
              <option value="">All</option>
              {ingredients.map(ing => (
                <option key={ing.id} value={ing.id}>{ing.name}</option>
              ))}
            </select>
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
            <p>No procurement orders</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-noch-muted text-xs border-b border-noch-border">
                  <th className="text-left py-3 px-3">Ingredient</th>
                  <th className="text-left py-3 px-3">Supplier</th>
                  <th className="text-right py-3 px-3">Qty</th>
                  <th className="text-right py-3 px-3">Unit Cost</th>
                  <th className="text-right py-3 px-3">Shipping</th>
                  <th className="text-right py-3 px-3">Customs</th>
                  <th className="text-right py-3 px-3">Other</th>
                  <th className="text-right py-3 px-3">Total</th>
                  <th className="text-left py-3 px-3">Date</th>
                  <th className="text-left py-3 px-3">Status</th>
                  <th className="text-right py-3 px-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(order => (
                  <tr key={order.id} className="border-b border-noch-border/50 hover:bg-noch-border/20">
                    <td className="py-3 px-3 text-white font-medium">{order.ingredient?.name || '—'}</td>
                    <td className="py-3 px-3 text-noch-muted">{order.supplier_name || '—'}</td>
                    <td className="py-3 px-3 text-white text-right">{order.quantity_ordered} {order.unit}</td>
                    <td className="py-3 px-3 text-white text-right">{order.unit_cost_lyd || 0}</td>
                    <td className="py-3 px-3 text-noch-muted text-right">{order.shipping_cost_lyd || 0}</td>
                    <td className="py-3 px-3 text-noch-muted text-right">{order.customs_cost_lyd || 0}</td>
                    <td className="py-3 px-3 text-noch-muted text-right">{order.other_cost_lyd || 0}</td>
                    <td className="py-3 px-3 text-white font-medium text-right">{parseFloat(order.total_cost_lyd || 0).toFixed(2)}</td>
                    <td className="py-3 px-3 text-noch-muted text-xs">{new Date(order.created_at).toLocaleDateString()}</td>
                    <td className="py-3 px-3"><StatusBadge status={order.status} /></td>
                    <td className="py-3 px-3 text-right">
                      {order.status === 'ordered' && (
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => setReceiveModal(order)}
                            className="text-green-400 hover:text-green-300 text-xs px-2 py-1 rounded hover:bg-green-500/10"
                            title="Mark Received"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            onClick={() => handleCancel(order)}
                            className="text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded hover:bg-red-500/10"
                            title="Cancel"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {/* Totals row */}
                <tr className="border-t-2 border-noch-border bg-noch-dark/50">
                  <td colSpan={7} className="py-3 px-3 text-noch-muted font-medium text-right">Total:</td>
                  <td className="py-3 px-3 text-noch-green font-bold text-right">{totalCost.toFixed(2)} LYD</td>
                  <td colSpan={3}></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Add Order Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-noch-card border border-noch-border rounded-xl p-6 w-full max-w-md max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold text-lg">New Procurement Order</h2>
                <button onClick={() => setShowAddModal(false)} className="text-noch-muted hover:text-white"><X size={20} /></button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-noch-muted text-xs mb-1 block">Ingredient *</label>
                  <select
                    value={form.ingredient_id}
                    onChange={e => setForm({ ...form, ingredient_id: e.target.value })}
                    className="w-full px-3 py-2 bg-noch-dark border border-noch-border rounded-lg text-white text-sm focus:outline-none focus:border-noch-green/50"
                  >
                    <option value="">Select ingredient...</option>
                    {ingredients.map(ing => (
                      <option key={ing.id} value={ing.id}>{ing.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-noch-muted text-xs mb-1 block">Supplier Name</label>
                  <input
                    type="text"
                    value={form.supplier_name}
                    onChange={e => setForm({ ...form, supplier_name: e.target.value })}
                    className="w-full px-3 py-2 bg-noch-dark border border-noch-border rounded-lg text-white text-sm focus:outline-none focus:border-noch-green/50"
                    placeholder="Supplier name"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-noch-muted text-xs mb-1 block">Quantity *</label>
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
                    <label className="text-noch-muted text-xs mb-1 block">Unit</label>
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
                  <label className="text-noch-muted text-xs mb-1 block">Unit Cost (LYD)</label>
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
                    <label className="text-noch-muted text-xs mb-1 block">Shipping</label>
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
                    <label className="text-noch-muted text-xs mb-1 block">Customs</label>
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
                    <label className="text-noch-muted text-xs mb-1 block">Other</label>
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
                {/* Auto-calculated total */}
                <div className="bg-noch-dark rounded-lg p-3 flex items-center justify-between">
                  <span className="text-noch-muted text-sm">Total Cost:</span>
                  <span className="text-noch-green font-bold">{calcTotal(form).toFixed(2)} LYD</span>
                </div>
                <div>
                  <label className="text-noch-muted text-xs mb-1 block">Notes</label>
                  <input
                    type="text"
                    value={form.notes}
                    onChange={e => setForm({ ...form, notes: e.target.value })}
                    className="w-full px-3 py-2 bg-noch-dark border border-noch-border rounded-lg text-white text-sm focus:outline-none focus:border-noch-green/50"
                    placeholder="Optional notes"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <button onClick={() => setShowAddModal(false)} className="px-4 py-2 text-sm text-noch-muted hover:text-white">Cancel</button>
                <button
                  onClick={handleCreateOrder}
                  disabled={saving || !form.ingredient_id || !form.quantity_ordered}
                  className="bg-noch-green/10 text-noch-green border border-noch-green/30 rounded-lg px-4 py-2 text-sm font-medium hover:bg-noch-green/20 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  Create Order
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
                <h2 className="text-white font-semibold">Mark as Received</h2>
                <button onClick={() => { setReceiveModal(null); setUpdateBulkCost(false) }} className="text-noch-muted hover:text-white"><X size={20} /></button>
              </div>
              <div className="space-y-3">
                <p className="text-noch-muted text-sm">
                  Receiving <span className="text-white font-medium">{receiveModal.quantity_ordered} {receiveModal.unit}</span> of{' '}
                  <span className="text-white font-medium">{receiveModal.ingredient?.name || 'Unknown'}</span>
                </p>
                <p className="text-noch-muted text-xs">This will add the quantity to current stock as a restock entry.</p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={updateBulkCost}
                    onChange={e => setUpdateBulkCost(e.target.checked)}
                    className="w-4 h-4 rounded border-noch-border bg-noch-dark text-noch-green focus:ring-noch-green"
                  />
                  <span className="text-sm text-noch-muted">Update ingredient bulk cost to {receiveModal.unit_cost_lyd} LYD/{receiveModal.unit}</span>
                </label>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <button onClick={() => { setReceiveModal(null); setUpdateBulkCost(false) }} className="px-4 py-2 text-sm text-noch-muted hover:text-white">Cancel</button>
                <button
                  onClick={handleReceive}
                  disabled={receiving}
                  className="bg-green-500/10 text-green-400 border border-green-500/30 rounded-lg px-4 py-2 text-sm font-medium hover:bg-green-500/20 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {receiving && <Loader2 size={14} className="animate-spin" />}
                  <Check size={14} /> Confirm Received
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
