// POSOrders.jsx — Today's orders for a branch with reprint, void, and
// "Mark Presto collected" actions. Closes the audit gap "no order lookup
// UI / no reprint / no refund-by-search" (Pass 5).
// Route: /pos/:branchId/orders

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Printer, RotateCcw, CheckCircle2, Bike, Search, X, Minus, Plus, Coffee, CreditCard, DollarSign, ArrowLeftRight } from 'lucide-react'
import {
  getPOSBranch, getPOSOrders, voidPOSOrder, markPrestoCollected,
  refundPOSOrderLines, switchPOSOrderPayment,
} from '../lib/pos-supabase'
import { printReceipt, printDrinkTicket, isPrinterConnected } from '../lib/escpos'
import { getServedBy } from '../lib/pos-session'
import Layout from '../../../components/Layout'
import toast from 'react-hot-toast'

function RefundModal({ order, onClose, onSaved }) {
  // Initial state: 0 refund qty per line; the operator dials up the
  // lines they want to refund. "Refund full" sets all to remaining qty.
  const [qtys, setQtys] = useState(() => {
    const o = {}
    for (const it of (order.pos_order_items || [])) o[it.id] = 0
    return o
  })
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const totalToRefund = (order.pos_order_items || [])
    .reduce((s, it) => s + (qtys[it.id] || 0) * Number(it.unit_price), 0)

  const setQty = (id, value, max) => {
    const n = Math.max(0, Math.min(value, max))
    setQtys(q => ({ ...q, [id]: n }))
  }

  const refundFull = () => {
    const o = {}
    for (const it of (order.pos_order_items || [])) {
      o[it.id] = Math.max(0, it.quantity - (it.refunded_qty || 0))
    }
    setQtys(o)
  }

  const handleSubmit = async () => {
    const lines = Object.entries(qtys)
      .filter(([, q]) => q > 0)
      .map(([order_item_id, refund_qty]) => ({ order_item_id, refund_qty }))
    if (!lines.length) {
      toast.error('Pick at least one line to refund')
      return
    }
    setSaving(true)
    try {
      const servedBy = getServedBy()?.id || null
      await refundPOSOrderLines(order.id, lines, reason, servedBy)
      toast.success(`Refunded ${totalToRefund.toFixed(2)} LYD`)
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err.message || 'Refund failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-noch-card border border-noch-border rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-noch-border">
          <div>
            <h2 className="text-white font-bold">Refund</h2>
            <p className="text-noch-muted text-xs">{order.order_number}</p>
          </div>
          <button onClick={onClose} className="text-noch-muted hover:text-white"><X size={18} /></button>
        </div>
        <div className="p-4">
          <div className="flex justify-end mb-2">
            <button onClick={refundFull} className="text-xs text-noch-green underline">Refund full order</button>
          </div>
          <div className="flex flex-col gap-2 mb-3">
            {(order.pos_order_items || []).map(it => {
              const remaining = it.quantity - (it.refunded_qty || 0)
              return (
                <div key={it.id} className="flex items-center justify-between bg-noch-dark rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-white text-sm truncate">{it.product_name}</p>
                    <p className="text-noch-muted text-xs">
                      {it.quantity} × {Number(it.unit_price).toFixed(2)}
                      {it.refunded_qty > 0 && ` · ${it.refunded_qty} refunded`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setQty(it.id, (qtys[it.id] || 0) - 1, remaining)}
                      className="w-7 h-7 rounded bg-noch-border/40 text-noch-muted flex items-center justify-center"
                      disabled={(qtys[it.id] || 0) <= 0}
                    ><Minus size={12} /></button>
                    <span className="text-white text-sm w-6 text-center">{qtys[it.id] || 0}</span>
                    <button
                      onClick={() => setQty(it.id, (qtys[it.id] || 0) + 1, remaining)}
                      className="w-7 h-7 rounded bg-noch-green/20 text-noch-green flex items-center justify-center"
                      disabled={(qtys[it.id] || 0) >= remaining}
                    ><Plus size={12} /></button>
                  </div>
                </div>
              )
            })}
          </div>

          <label className="label block mb-1">Reason</label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={2}
            className="input w-full resize-none mb-3"
            placeholder="e.g. wrong drink made, customer changed mind"
          />

          <div className="flex justify-between items-center bg-noch-dark/50 rounded-lg px-3 py-2 mb-3">
            <span className="text-noch-muted text-sm">Refund total</span>
            <span className="text-noch-green font-bold">{totalToRefund.toFixed(2)} LYD</span>
          </div>

          <div className="flex gap-3">
            <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button onClick={handleSubmit} disabled={saving || totalToRefund <= 0} className="btn-primary flex-1">
              {saving ? 'Refunding…' : 'Refund'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function POSOrders() {
  const { branchId } = useParams()
  const navigate = useNavigate()

  const [branch, setBranch] = useState(null)
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [refundOrder, setRefundOrder] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  // Date range — defaults to today, but operators can scroll back.
  const today = () => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString().slice(0, 10)
  }
  const [fromDate, setFromDate] = useState(today())
  const [toDate, setToDate] = useState(today())

  const load = async () => {
    setLoading(true)
    try {
      const fromIso = new Date(`${fromDate}T00:00:00`).toISOString()
      const toIso   = new Date(`${toDate}T23:59:59.999`).toISOString()
      const [b, list] = await Promise.all([
        getPOSBranch(branchId),
        getPOSOrders(branchId, { from: fromIso, to: toIso, limit: 500 }),
      ])
      setBranch(b)
      setOrders(list || [])
    } catch (err) {
      toast.error(err.message || 'Failed to load orders')
    } finally {
      setLoading(false)
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [branchId, fromDate, toDate])

  const handleReprint = async (order) => {
    if (!isPrinterConnected()) { toast.error('Printer not connected'); return }
    try {
      await printReceipt(order, branch, order.pos_order_items || [])
      toast.success(`Reprinted ${order.order_number}`)
    } catch (err) {
      toast.error(err.message || 'Print failed')
    }
  }

  const handleDrinkTicket = async (order) => {
    if (!isPrinterConnected()) { toast.error('Printer not connected'); return }
    try {
      await printDrinkTicket(order, order.pos_order_items || [], branch)
      toast.success(`Drink ticket reprinted`)
    } catch (err) {
      toast.error(err.message || 'Print failed')
    }
  }

  const handleSwitchPayment = async (order) => {
    const current = order.payment_method
    if (current !== 'cash' && current !== 'card') {
      toast.error(`Cannot swap from "${current}" — only cash ↔ card is supported here`)
      return
    }
    const next = current === 'cash' ? 'card' : 'cash'
    if (!window.confirm(`Switch order ${order.order_number} from ${current.toUpperCase()} to ${next.toUpperCase()}?\nThis updates today's shift totals.`)) {
      return
    }
    setBusyId(order.id)
    try {
      const servedBy = getServedBy()?.id || null
      const result = await switchPOSOrderPayment(order.id, next, servedBy)
      if (result?.changed) {
        toast.success(`Switched to ${next.toUpperCase()}`)
      } else {
        toast(`No change — already ${next.toUpperCase()}`, { icon: '✓' })
      }
      await load()
    } catch (err) {
      toast.error(err.message || 'Switch failed')
    } finally {
      setBusyId(null)
    }
  }

  // Refund helpers — compute per-order state from item-level refunded_qty.
  // Returns one of: 'none' | 'partial' | 'full'.
  const refundStateOf = (order) => {
    const items = order.pos_order_items || []
    if (!items.length) return 'none'
    let totalQty = 0, refundedQty = 0
    for (const it of items) {
      totalQty += Number(it.quantity) || 0
      refundedQty += Number(it.refunded_qty) || 0
    }
    if (refundedQty === 0) return 'none'
    if (refundedQty >= totalQty) return 'full'
    return 'partial'
  }
  const refundedAmountOf = (order) => {
    const items = order.pos_order_items || []
    return items.reduce(
      (s, it) => s + (Number(it.unit_price) || 0) * (Number(it.refunded_qty) || 0),
      0,
    )
  }

  const handleVoid = async (order) => {
    const reason = window.prompt(`Void order ${order.order_number}?\nReason:`)
    if (!reason) return
    setBusyId(order.id)
    try {
      const servedBy = getServedBy()?.id || null
      await voidPOSOrder(order.id, reason, servedBy)
      toast.success('Order voided')
      await load()
    } catch (err) {
      toast.error(err.message || 'Void failed')
    } finally {
      setBusyId(null)
    }
  }

  const handlePrestoCollected = async (order) => {
    setBusyId(order.id)
    try {
      const r = await markPrestoCollected(order.id)
      if (r?.already_collected) toast('Already marked collected', { icon: '✓' })
      else toast.success(`Marked ${order.total} LYD collected from Presto`)
      await load()
    } catch (err) {
      toast.error(err.message || 'Update failed')
    } finally {
      setBusyId(null)
    }
  }

  const filtered = orders.filter(o => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      o.order_number?.toLowerCase().includes(q) ||
      o.payment_method?.toLowerCase().includes(q) ||
      o.status?.toLowerCase().includes(q) ||
      String(o.total).includes(q)
    )
  })

  // Executive summary — computed from non-voided orders in the current range.
  // Revenue is net of refunds: each line item's refunded portion is deducted.
  // Payment-method totals reflect the order's CURRENT method (after any
  // cash↔card switch), with refunded amounts subtracted from that bucket.
  const summary = filtered.reduce((acc, o) => {
    if (o.status === 'voided') return acc
    const gross = Number(o.total) || 0
    const refunded = refundedAmountOf(o)
    const net = Math.max(0, gross - refunded)
    acc.revenue += net
    acc.refunds += refunded
    acc.orders += 1
    const m = (o.payment_method || '').toLowerCase()
    if (m === 'cash')   acc.cash   += net
    else if (m === 'card')   acc.card   += net
    else if (m === 'presto') acc.presto += net
    else if (m === 'split') {
      const cardAmt = Number(o.card_amount) || 0
      const cashAmt = gross - cardAmt
      // Apportion refund pro-rata between cash and card legs of the split.
      const cardShare = gross > 0 ? cardAmt / gross : 0
      acc.card += Math.max(0, cardAmt - refunded * cardShare)
      acc.cash += Math.max(0, cashAmt - refunded * (1 - cardShare))
    }
    else acc.other += net
    return acc
  }, { revenue: 0, orders: 0, cash: 0, card: 0, presto: 0, other: 0, refunds: 0 })

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => navigate(`/pos/${branchId}`)} className="p-2 text-noch-muted hover:text-white">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <h1 className="text-white font-bold text-xl">Orders</h1>
            <p className="text-noch-muted text-sm">{branch?.name}</p>
          </div>
          <button onClick={load} className="btn-secondary text-sm px-3 py-1">Refresh</button>
        </div>

        {/* Date range */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="label block mb-1 text-xs">From</label>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="input w-full text-sm" max={toDate} />
          </div>
          <div>
            <label className="label block mb-1 text-xs">To</label>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="input w-full text-sm" min={fromDate} />
          </div>
        </div>

        <div className="relative mb-4">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-noch-muted" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by order #, method, status, total…"
            className="input w-full pl-9 py-2 text-sm"
          />
        </div>

        {/* Executive summary — totals for the visible (filtered) range */}
        {!loading && (
          <div className="card p-4 mb-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div>
                <p className="text-noch-muted text-[10px] uppercase tracking-wider">Revenue</p>
                <p className="text-noch-green font-bold text-lg leading-tight">{summary.revenue.toFixed(2)}</p>
                <p className="text-noch-muted text-[10px]">LYD</p>
              </div>
              <div>
                <p className="text-noch-muted text-[10px] uppercase tracking-wider">Orders</p>
                <p className="text-white font-bold text-lg leading-tight">{summary.orders}</p>
                <p className="text-noch-muted text-[10px]">tickets</p>
              </div>
              <div>
                <p className="text-noch-muted text-[10px] uppercase tracking-wider">Cash</p>
                <p className="text-white font-bold text-lg leading-tight">{summary.cash.toFixed(2)}</p>
                <p className="text-noch-muted text-[10px]">LYD</p>
              </div>
              <div>
                <p className="text-noch-muted text-[10px] uppercase tracking-wider">Card</p>
                <p className="text-white font-bold text-lg leading-tight">{summary.card.toFixed(2)}</p>
                <p className="text-noch-muted text-[10px]">LYD</p>
              </div>
              <div>
                <p className="text-noch-muted text-[10px] uppercase tracking-wider">Presto</p>
                <p className="text-white font-bold text-lg leading-tight">{summary.presto.toFixed(2)}</p>
                <p className="text-noch-muted text-[10px]">LYD</p>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-2 flex-wrap text-xs">
              {summary.refunds > 0 && (
                <span className="text-red-400">↩ {summary.refunds.toFixed(2)} LYD refunded (already deducted from Revenue)</span>
              )}
              {summary.other > 0 && (
                <span className="text-noch-muted">+ {summary.other.toFixed(2)} LYD other methods</span>
              )}
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-noch-muted text-center py-12">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-noch-muted text-center py-12 text-sm">No orders match.</p>
        ) : (
          <div className="card divide-y divide-noch-border/40">
            {filtered.map(o => {
              const isVoided = o.status === 'voided'
              const isPresto = o.payment_method === 'presto'
              const owedByPresto = isPresto && o.presto_collected !== true
              const isExpanded = expandedId === o.id
              const refundState = refundStateOf(o)
              const refundAmt = refundedAmountOf(o)
              const netTotal = Math.max(0, (Number(o.total) || 0) - refundAmt)
              return (
                <div key={o.id} className="py-3">
                  {/* Clickable summary row */}
                  <div
                    className="flex flex-wrap items-center gap-3 cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : o.id)}
                  >
                    <div className="flex-1 min-w-[180px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-noch-green text-sm">{o.order_number}</span>
                        {isVoided && <span className="text-red-400 text-xs uppercase">voided</span>}
                        {refundState === 'full' && (
                          <span className="bg-red-500/15 border border-red-500/30 text-red-400 text-[10px] uppercase px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                            <RotateCcw size={10} /> Refunded
                          </span>
                        )}
                        {refundState === 'partial' && (
                          <span className="bg-yellow-500/15 border border-yellow-500/30 text-yellow-400 text-[10px] uppercase px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                            <RotateCcw size={10} /> Partial refund
                          </span>
                        )}
                        {owedByPresto && (
                          <span className="bg-yellow-500/15 border border-yellow-500/30 text-yellow-300 text-[10px] uppercase px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                            <Bike size={10} /> owed by Presto
                          </span>
                        )}
                        {isPresto && o.presto_collected === true && (
                          <span className="bg-noch-green/15 border border-noch-green/30 text-noch-green text-[10px] uppercase px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                            <CheckCircle2 size={10} /> Presto paid
                          </span>
                        )}
                      </div>
                      <div className="text-noch-muted text-xs mt-0.5">
                        {new Date(o.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        {' · '}{o.payment_method?.toUpperCase()}
                        {' · '}{(o.pos_order_items?.length || 0)} items
                        {o.customer_name && <span className="text-zinc-400"> · {o.customer_name}</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      {refundAmt > 0 ? (
                        <>
                          <p className="text-white font-bold line-through opacity-60 text-sm">{Number(o.total).toFixed(2)}</p>
                          <p className="text-red-400 text-xs">-{refundAmt.toFixed(2)} refunded</p>
                          <p className="text-noch-green font-bold">{netTotal.toFixed(2)} LYD</p>
                        </>
                      ) : (
                        <p className="text-white font-bold">{Number(o.total).toFixed(2)} LYD</p>
                      )}
                      {Number(o.discount_amount) > 0 && (
                        <p className="text-yellow-400 text-xs">-{Number(o.discount_amount).toFixed(2)} disc</p>
                      )}
                    </div>
                    <span className="text-noch-muted text-xs">{isExpanded ? '▲' : '▼'}</span>
                  </div>

                  {/* Expanded items */}
                  {isExpanded && (
                    <div className="mt-2 mb-1 bg-noch-dark rounded-xl overflow-hidden">
                      <div className="divide-y divide-noch-border/30">
                        {(o.pos_order_items || []).map((it, i) => {
                          const refQty = Number(it.refunded_qty) || 0
                          const liveQty = Math.max(0, (Number(it.quantity) || 0) - refQty)
                          const fullyRefunded = refQty > 0 && liveQty === 0
                          return (
                            <div key={i} className={`flex items-center justify-between px-3 py-2 ${fullyRefunded ? 'opacity-60' : ''}`}>
                              <div className="min-w-0">
                                <p className={`text-white text-sm ${fullyRefunded ? 'line-through' : ''}`}>
                                  {it.product_name_ar || it.product_name}
                                </p>
                                {it.product_name_ar && it.product_name !== it.product_name_ar && (
                                  <p className="text-noch-muted text-xs">{it.product_name}</p>
                                )}
                                {Array.isArray(it.modifiers) && it.modifiers.length > 0 && (
                                  <p className="text-noch-muted text-[11px] mt-0.5">
                                    {it.modifiers.map(m => m.modifier_name_ar || m.modifier_name).filter(Boolean).join(' · ')}
                                  </p>
                                )}
                                {refQty > 0 && (
                                  <p className="text-red-400 text-[11px] mt-0.5">
                                    ↩ {refQty} of {it.quantity} refunded
                                  </p>
                                )}
                              </div>
                              <div className="text-right shrink-0 ml-3">
                                <p className="text-noch-muted text-xs">{it.quantity} × {Number(it.unit_price).toFixed(2)}</p>
                                <p className={`text-white text-sm font-medium ${fullyRefunded ? 'line-through' : ''}`}>
                                  {Number(it.total || it.unit_price * it.quantity).toFixed(2)} LYD
                                </p>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      <div className="flex gap-2 px-3 py-2 border-t border-noch-border/40 flex-wrap">
                        <button onClick={(e) => { e.stopPropagation(); handleReprint(o) }} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1">
                          <Printer size={12} /> Reprint
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleDrinkTicket(o) }} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1 text-noch-green hover:bg-noch-green/10">
                          <Coffee size={12} /> Drink ticket
                        </button>
                        {!isVoided && (o.payment_method === 'cash' || o.payment_method === 'card') && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleSwitchPayment(o) }}
                            disabled={busyId === o.id}
                            className="btn-secondary text-xs px-3 py-1.5 text-blue-400 hover:bg-blue-500/10 flex items-center gap-1"
                            title={`Currently ${o.payment_method?.toUpperCase()}. Click to swap.`}
                          >
                            <ArrowLeftRight size={12} />
                            {o.payment_method === 'cash' ? (
                              <><DollarSign size={11} /> → <CreditCard size={11} /></>
                            ) : (
                              <><CreditCard size={11} /> → <DollarSign size={11} /></>
                            )}
                          </button>
                        )}
                        {owedByPresto && (
                          <button onClick={(e) => { e.stopPropagation(); handlePrestoCollected(o) }} disabled={busyId === o.id} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1">
                            <CheckCircle2 size={12} /> Mark Collected
                          </button>
                        )}
                        {!isVoided && refundState !== 'full' && (
                          <>
                            <button onClick={(e) => { e.stopPropagation(); setRefundOrder(o) }} disabled={busyId === o.id} className="btn-secondary text-xs px-3 py-1.5 text-yellow-400 hover:bg-yellow-500/10 flex items-center gap-1">
                              <RotateCcw size={12} /> Refund
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); handleVoid(o) }} disabled={busyId === o.id} className="btn-secondary text-xs px-3 py-1.5 text-red-400 hover:bg-red-500/10 flex items-center gap-1">
                              <X size={12} /> Void
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {refundOrder && (
        <RefundModal
          order={refundOrder}
          onClose={() => setRefundOrder(null)}
          onSaved={load}
        />
      )}
    </Layout>
  )
}
