// POSOrders.jsx — Today's orders for a branch with reprint, void, and
// "Mark Presto collected" actions. Closes the audit gap "no order lookup
// UI / no reprint / no refund-by-search" (Pass 5).
// Route: /pos/:branchId/orders

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Printer, RotateCcw, CheckCircle2, Bike, Search, X, Minus, Plus } from 'lucide-react'
import {
  getPOSBranch, getPOSOrders, voidPOSOrder, markPrestoCollected,
  refundPOSOrderLines,
} from '../lib/pos-supabase'
import { printReceipt, isPrinterConnected } from '../lib/escpos'
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
              return (
                <div key={o.id} className="py-3 flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[180px]">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-noch-green text-sm">{o.order_number}</span>
                      {isVoided && <span className="text-red-400 text-xs uppercase">voided</span>}
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
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-white font-bold">{Number(o.total).toFixed(2)} LYD</p>
                    {Number(o.discount_amount) > 0 && (
                      <p className="text-yellow-400 text-xs">-{Number(o.discount_amount).toFixed(2)} disc</p>
                    )}
                  </div>
                  <div className="flex gap-2 w-full sm:w-auto">
                    <button onClick={() => handleReprint(o)} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1">
                      <Printer size={12} /> Reprint
                    </button>
                    {owedByPresto && (
                      <button
                        onClick={() => handlePrestoCollected(o)}
                        disabled={busyId === o.id}
                        className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1"
                      >
                        <CheckCircle2 size={12} /> Mark Collected
                      </button>
                    )}
                    {!isVoided && (
                      <>
                        <button
                          onClick={() => setRefundOrder(o)}
                          disabled={busyId === o.id}
                          className="btn-secondary text-xs px-3 py-1.5 text-yellow-400 hover:bg-yellow-500/10 flex items-center gap-1"
                        >
                          <RotateCcw size={12} /> Refund
                        </button>
                        <button
                          onClick={() => handleVoid(o)}
                          disabled={busyId === o.id}
                          className="btn-secondary text-xs px-3 py-1.5 text-red-400 hover:bg-red-500/10 flex items-center gap-1"
                        >
                          <X size={12} /> Void
                        </button>
                      </>
                    )}
                  </div>
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
