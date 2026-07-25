import { useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { format } from '../lib/money'
import { printDrinkTicket } from '../lib/escpos'
import { sendCustomerGreeting } from '../../../lib/vestaboard'
import toast from 'react-hot-toast'

// ── New order popup modal ─────────────────────────────────────────────────────
export default function NewOrderModal({ order, branchId, branch, onAccept, onDecline }) {
  const [busy, setBusy] = useState(false)

  const handle = async (action) => {
    setBusy(true)
    try {
      const fn = action === 'accept' ? 'approve_online_order' : 'cancel_online_order'
      const { data, error } = await supabase.rpc(fn, { p_order_id: order.id, p_branch_id: branchId })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      if (action === 'accept') {
        toast.success(`✅ Order ${order.order_number} accepted`)
        // Print drink ticket for the bar — customer name comes from the
        // online order itself. Fire-and-forget.
        // Always enqueue — the print host tablet picks it up. Silent on no-host.
        printDrinkTicket(order, order.pos_order_items || [], branch)
          .catch(err => console.warn(`Drink ticket enqueue failed: ${err.message}`))
        // Vestaboard cheeky greeting for the customer.
        if (order.customer_name) {
          sendCustomerGreeting(order.customer_name, { seed: order.order_number })
            .then(r => {
              if (r?.simulated) toast('Vestaboard: no API key — simulated', { icon: '⚙️' })
              else if (r?.skipped) console.log('[Vestaboard] skipped:', r.reason)
              else toast.success(`Vestaboard: ${order.customer_name}`, { duration: 2500 })
            })
            .catch(err => toast.error(`Vestaboard: ${err?.message || 'failed'}`, { duration: 5000 }))
        }
        onAccept()
      }
      else { toast(`❌ Order ${order.order_number} declined`, { icon: '🚫' }); onDecline() }
    } catch (err) {
      toast.error(err.message || 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.85)' }}>
      <div className="bg-noch-card border-2 border-yellow-500/60 rounded-2xl w-full max-w-sm shadow-2xl animate-pulse-once">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-3 border-b border-noch-border">
          <span className="text-3xl">🛎</span>
          <div>
            <p className="text-yellow-400 font-bold text-lg">New Online Order!</p>
            <p className="text-noch-muted text-sm font-mono">{order.order_number}</p>
          </div>
        </div>
        {/* Customer */}
        <div className="px-5 py-3 border-b border-noch-border">
          <p className="text-white font-semibold">{order.customer_name || 'Guest'}</p>
          {order.customer_phone && <p className="text-noch-muted text-sm">{order.customer_phone}</p>}
          {order.table_number && (
            <p className="text-yellow-400 text-sm mt-1">📍 Table {order.table_number}</p>
          )}
        </div>
        {/* Items */}
        {order.pos_order_items?.length > 0 && (
          <div className="px-5 py-3 border-b border-noch-border max-h-48 overflow-y-auto">
            {order.pos_order_items.map((it, i) => (
              <div key={i} className="flex justify-between text-sm py-1">
                <span className="text-white">{it.quantity}× {it.product_name_ar || it.product_name}</span>
                <span className="text-noch-muted">{format(it.total)}</span>
              </div>
            ))}
          </div>
        )}
        {/* Total */}
        <div className="flex justify-between items-center px-5 py-3 border-b border-noch-border">
          <span className="text-noch-muted">Total</span>
          <span className="text-white font-bold text-lg">{format(order.total)} LYD</span>
        </div>
        {/* Pickup code */}
        {order.pickup_code && (
          <div className="px-5 py-3 border-b border-noch-border text-center">
            <p className="text-noch-muted text-xs mb-1">Pickup code</p>
            <p className="text-yellow-300 font-mono font-bold text-2xl tracking-widest">{order.pickup_code}</p>
          </div>
        )}
        {/* Actions */}
        <div className="flex gap-3 px-5 py-4">
          <button
            onClick={() => handle('decline')}
            disabled={busy}
            className="flex-1 py-3 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 font-bold transition-colors disabled:opacity-50"
          >
            ✕ Decline
          </button>
          <button
            onClick={() => handle('accept')}
            disabled={busy}
            className="flex-1 py-3 rounded-xl bg-noch-green text-black font-bold hover:bg-noch-green/80 transition-colors disabled:opacity-50"
          >
            ✓ Accept
          </button>
        </div>
      </div>
    </div>
  )
}
