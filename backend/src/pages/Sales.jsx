// Sales.jsx — Daily POS sales activity: view, edit notes/discount, void orders

import { useState, useEffect, useCallback } from 'react'
import { ShoppingBag, Search, Trash2, Loader2, ChevronDown, ChevronRight, Edit2, Check, X, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Layout from '../components/Layout'
import { usePermission } from '../lib/usePermission'
import { AccessDenied } from '../components/shared/ProtectedFeature'
import toast from 'react-hot-toast'

const STATUS_COLORS = {
  completed: 'text-noch-green bg-noch-green/10 border-noch-green/30',
  voided: 'text-red-400 bg-red-500/10 border-red-500/30',
  pending: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
}

const PAYMENT_LABELS = { cash: 'Cash', card: 'Card', loyalty: 'Loyalty', online: 'Online' }

function fmt(n) { return parseFloat(n || 0).toFixed(3) }

export default function Sales() {
  const can = usePermission()
  if (!can('sales', 'access')) return <Layout><AccessDenied message="You don't have access to sales data." /></Layout>
  const canEdit = can('sales', 'edit')

  const [orders, setOrders] = useState([])
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)
  const [orderItems, setOrderItems] = useState({}) // orderId → items[]

  // Filters
  const [branch, setBranch] = useState('all')
  const [status, setStatus] = useState('all')
  const [query, setQuery] = useState('')
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10)
  })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10))

  // Edit state
  const [editing, setEditing] = useState(null) // orderId
  const [editNotes, setEditNotes] = useState('')

  // Void confirm
  const [voidTarget, setVoidTarget] = useState(null)
  const [voidReason, setVoidReason] = useState('')
  const [voiding, setVoiding] = useState(false)

  useEffect(() => {
    supabase.from('pos_branches').select('id,name').eq('is_active', true).then(({ data }) => setBranches(data || []))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      let q = supabase
        .from('pos_orders')
        .select('id,order_number,branch_id,total,subtotal,discount_amount,payment_method,status,table_number,created_at,voided_at,void_reason,pos_branches(name)')
        .gte('created_at', `${dateFrom}T00:00:00`)
        .lte('created_at', `${dateTo}T23:59:59`)
        .order('created_at', { ascending: false })
        .limit(200)

      if (branch !== 'all') q = q.eq('branch_id', branch)
      if (status !== 'all') q = q.eq('status', status)

      const { data, error } = await q
      if (error) throw error
      setOrders(data || [])
    } catch (err) {
      toast.error(err.message || 'Failed to load orders')
    } finally {
      setLoading(false)
    }
  }, [branch, status, dateFrom, dateTo])

  useEffect(() => { load() }, [load])

  async function loadItems(orderId) {
    if (orderItems[orderId]) return
    const { data } = await supabase
      .from('pos_order_items')
      .select('id,product_name,quantity,unit_price,total,notes')
      .eq('order_id', orderId)
    setOrderItems(prev => ({ ...prev, [orderId]: data || [] }))
  }

  function toggleExpand(orderId) {
    if (expanded === orderId) {
      setExpanded(null)
    } else {
      setExpanded(orderId)
      loadItems(orderId)
    }
  }

  async function saveNotes(orderId) {
    const { error } = await supabase.from('pos_orders').update({ void_reason: editNotes }).eq('id', orderId)
    if (error) { toast.error('Failed to save'); return }
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, void_reason: editNotes } : o))
    setEditing(null)
    toast.success('Notes saved')
  }

  async function voidOrder() {
    if (!voidTarget) return
    setVoiding(true)
    try {
      const { error } = await supabase.from('pos_orders').update({
        status: 'voided',
        voided_at: new Date().toISOString(),
        void_reason: voidReason || 'Voided by manager',
      }).eq('id', voidTarget.id)
      if (error) throw error

      // Restore inventory for tracked products
      const items = orderItems[voidTarget.id]
      if (items?.length) {
        for (const item of items) {
          if (!item.product_id) continue
          const { data: prod } = await supabase
            .from('pos_products')
            .select('id,track_inventory,stock_qty')
            .eq('id', item.product_id)
            .maybeSingle()
          if (prod?.track_inventory) {
            await supabase.from('pos_products')
              .update({ stock_qty: (prod.stock_qty || 0) + item.quantity })
              .eq('id', prod.id)
          }
        }
      }

      setOrders(prev => prev.map(o => o.id === voidTarget.id
        ? { ...o, status: 'voided', voided_at: new Date().toISOString(), void_reason: voidReason || 'Voided by manager' }
        : o
      ))
      toast.success(`Order ${voidTarget.order_number} voided`)
      setVoidTarget(null)
      setVoidReason('')
    } catch (err) {
      toast.error(err.message || 'Void failed')
    } finally {
      setVoiding(false)
    }
  }

  const filtered = orders.filter(o => {
    if (!query) return true
    const q = query.toLowerCase()
    return o.order_number?.toLowerCase().includes(q) || o.pos_branches?.name?.toLowerCase().includes(q)
  })

  const totalRevenue = filtered.filter(o => o.status === 'completed').reduce((s, o) => s + parseFloat(o.total || 0), 0)
  const totalVoided = filtered.filter(o => o.status === 'voided').length

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3 flex-wrap">
          <ShoppingBag className="text-noch-green" size={22} />
          <h1 className="text-white font-bold text-xl">Sales</h1>
          <div className="ml-auto flex gap-3 text-sm">
            <span className="text-noch-muted">Revenue: <span className="text-noch-green font-semibold">{fmt(totalRevenue)} LYD</span></span>
            {totalVoided > 0 && <span className="text-noch-muted">Voided: <span className="text-red-400 font-semibold">{totalVoided}</span></span>}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 bg-noch-card border border-noch-border rounded-xl p-3">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="input-sm" />
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="input-sm" />
          <select value={branch} onChange={e => setBranch(e.target.value)} className="input-sm">
            <option value="all">All branches</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select value={status} onChange={e => setStatus(e.target.value)} className="input-sm">
            <option value="all">All statuses</option>
            <option value="completed">Completed</option>
            <option value="voided">Voided</option>
            <option value="pending">Pending</option>
          </select>
          <div className="flex items-center gap-2 bg-noch-dark border border-noch-border rounded-lg px-3 py-1.5 flex-1 min-w-40">
            <Search size={13} className="text-noch-muted shrink-0" />
            <input placeholder="Search order #..." value={query} onChange={e => setQuery(e.target.value)}
              className="bg-transparent text-white text-sm outline-none flex-1 placeholder:text-noch-muted" />
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-3 text-noch-muted">
            <Loader2 className="animate-spin" size={20} /> Loading orders...
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-noch-card border border-noch-border rounded-xl p-12 text-center">
            <ShoppingBag size={36} className="mx-auto text-noch-muted mb-3 opacity-40" />
            <p className="text-noch-muted text-sm">No orders found for this period.</p>
          </div>
        ) : (
          <div className="bg-noch-card border border-noch-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-noch-border">
                <tr className="text-left">
                  <th className="py-3 px-4 text-noch-muted font-medium text-xs w-6"></th>
                  <th className="py-3 px-4 text-noch-muted font-medium text-xs">Order</th>
                  <th className="py-3 px-4 text-noch-muted font-medium text-xs">Branch</th>
                  <th className="py-3 px-4 text-noch-muted font-medium text-xs">Date / Time</th>
                  <th className="py-3 px-4 text-noch-muted font-medium text-xs">Payment</th>
                  <th className="py-3 px-4 text-noch-muted font-medium text-xs text-right">Total</th>
                  <th className="py-3 px-4 text-noch-muted font-medium text-xs">Status</th>
                  {canEdit && <th className="py-3 px-4 text-noch-muted font-medium text-xs"></th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(order => (
                  <>
                    <tr
                      key={order.id}
                      className={`border-t border-noch-border/40 hover:bg-noch-dark/50 transition-colors cursor-pointer ${order.status === 'voided' ? 'opacity-50' : ''}`}
                      onClick={() => toggleExpand(order.id)}
                    >
                      <td className="py-3 px-4 text-noch-muted">
                        {expanded === order.id ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      </td>
                      <td className="py-3 px-4 text-white font-mono text-xs">{order.order_number}</td>
                      <td className="py-3 px-4 text-noch-muted text-xs">{order.pos_branches?.name || '—'}</td>
                      <td className="py-3 px-4 text-noch-muted text-xs">
                        {new Date(order.created_at).toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-3 px-4 text-noch-muted text-xs">{PAYMENT_LABELS[order.payment_method] || order.payment_method}</td>
                      <td className="py-3 px-4 text-white text-right font-semibold tabular-nums">{fmt(order.total)}</td>
                      <td className="py-3 px-4">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLORS[order.status] || 'text-noch-muted border-noch-border'}`}>
                          {order.status}
                        </span>
                      </td>
                      {canEdit && (
                        <td className="py-3 px-4" onClick={e => e.stopPropagation()}>
                          {order.status === 'completed' && (
                            <button
                              onClick={() => { setVoidTarget(order); setVoidReason('') }}
                              className="p-1.5 text-red-400/50 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                              title="Void order"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>

                    {/* Expanded row */}
                    {expanded === order.id && (
                      <tr key={`${order.id}-expanded`} className="border-t border-noch-border/20 bg-noch-dark/30">
                        <td colSpan={canEdit ? 8 : 7} className="px-10 py-4">
                          <div className="space-y-3">
                            {/* Items */}
                            {!orderItems[order.id] ? (
                              <div className="flex items-center gap-2 text-noch-muted text-xs"><Loader2 size={12} className="animate-spin" /> Loading items...</div>
                            ) : orderItems[order.id].length === 0 ? (
                              <p className="text-noch-muted text-xs">No items recorded.</p>
                            ) : (
                              <div className="space-y-1">
                                {orderItems[order.id].map(item => (
                                  <div key={item.id} className="flex items-center justify-between text-xs">
                                    <span className="text-white">{item.quantity}× {item.product_name}</span>
                                    <span className="text-noch-muted tabular-nums">{fmt(item.total)} LYD</span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Summary row */}
                            <div className="flex gap-6 text-xs text-noch-muted border-t border-noch-border/30 pt-2">
                              <span>Subtotal: <b className="text-white">{fmt(order.subtotal)}</b></span>
                              {parseFloat(order.discount_amount) > 0 && <span>Discount: <b className="text-red-400">-{fmt(order.discount_amount)}</b></span>}
                              {order.table_number && <span>Table: <b className="text-white">{order.table_number}</b></span>}
                            </div>

                            {/* Notes */}
                            {canEdit && (
                              <div className="flex items-start gap-2 pt-1">
                                <span className="text-noch-muted text-xs mt-1">Notes:</span>
                                {editing === order.id ? (
                                  <div className="flex items-center gap-2 flex-1">
                                    <input
                                      value={editNotes}
                                      onChange={e => setEditNotes(e.target.value)}
                                      className="flex-1 bg-noch-dark border border-noch-green/50 rounded-lg px-3 py-1 text-white text-xs outline-none"
                                      onKeyDown={e => { if (e.key === 'Enter') saveNotes(order.id); if (e.key === 'Escape') setEditing(null) }}
                                      autoFocus
                                    />
                                    <button onClick={() => saveNotes(order.id)} className="p-1 text-noch-green"><Check size={13} /></button>
                                    <button onClick={() => setEditing(null)} className="p-1 text-noch-muted"><X size={13} /></button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => { setEditing(order.id); setEditNotes(order.void_reason || '') }}
                                    className="flex items-center gap-1.5 text-noch-muted hover:text-white text-xs transition-colors"
                                  >
                                    <Edit2 size={11} />
                                    {order.void_reason || <span className="italic opacity-50">Add notes...</span>}
                                  </button>
                                )}
                              </div>
                            )}

                            {order.status === 'voided' && order.void_reason && (
                              <p className="text-red-400 text-xs">Void reason: {order.void_reason}</p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Void confirm modal */}
      {voidTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-noch-card border border-noch-border rounded-2xl p-6 max-w-sm w-full space-y-4">
            <div className="flex items-center gap-3">
              <AlertTriangle size={20} className="text-red-400 shrink-0" />
              <h3 className="text-white font-semibold">Void Order {voidTarget.order_number}?</h3>
            </div>
            <p className="text-noch-muted text-sm">
              This will mark the order as voided. If any products have inventory tracking enabled, their stock will be restored.
            </p>
            <input
              placeholder="Reason (optional)"
              value={voidReason}
              onChange={e => setVoidReason(e.target.value)}
              className="w-full bg-noch-dark border border-noch-border rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-red-500/50"
              onKeyDown={e => e.key === 'Enter' && voidOrder()}
            />
            <div className="flex gap-2">
              <button
                onClick={voidOrder}
                disabled={voiding}
                className="flex-1 flex items-center justify-center gap-2 bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 rounded-xl py-2.5 text-sm font-medium transition-colors"
              >
                {voiding ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Void Order
              </button>
              <button
                onClick={() => { setVoidTarget(null); setVoidReason('') }}
                className="flex-1 btn-secondary text-sm py-2.5"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
