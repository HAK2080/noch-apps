// POSOrders.jsx — Today's orders for a branch with reprint, void, and
// "Mark Presto collected" actions. Closes the audit gap "no order lookup
// UI / no reprint / no refund-by-search" (Pass 5).
// Route: /pos/:branchId/orders

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Printer, RotateCcw, CheckCircle2, Bike, Search } from 'lucide-react'
import {
  getPOSBranch, getPOSOrders, voidPOSOrder, markPrestoCollected,
} from '../lib/pos-supabase'
import { printReceipt, isPrinterConnected } from '../lib/escpos'
import { getServedBy } from '../lib/pos-session'
import Layout from '../../../components/Layout'
import toast from 'react-hot-toast'

export default function POSOrders() {
  const { branchId } = useParams()
  const navigate = useNavigate()

  const [branch, setBranch] = useState(null)
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const start = new Date()
      start.setHours(0, 0, 0, 0)
      const [b, list] = await Promise.all([
        getPOSBranch(branchId),
        getPOSOrders(branchId, { from: start.toISOString(), limit: 200 }),
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
  useEffect(() => { load() }, [branchId])

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
            <h1 className="text-white font-bold text-xl">Today's Orders</h1>
            <p className="text-noch-muted text-sm">{branch?.name}</p>
          </div>
          <button onClick={load} className="btn-secondary text-sm px-3 py-1">Refresh</button>
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
                      <button
                        onClick={() => handleVoid(o)}
                        disabled={busyId === o.id}
                        className="btn-secondary text-xs px-3 py-1.5 text-red-400 hover:bg-red-500/10 flex items-center gap-1"
                      >
                        <RotateCcw size={12} /> Void
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Layout>
  )
}
