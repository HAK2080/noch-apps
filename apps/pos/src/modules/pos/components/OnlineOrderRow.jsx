import { useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { format } from '../lib/money'
import { printDrinkTicket } from '../lib/escpos'
import { sendCustomerGreeting } from '../../../lib/vestaboard'
import toast from 'react-hot-toast'

// ── Pending order row in the panel ───────────────────────────────────────────
export default function OnlineOrderRow({ order, branchId, branch, onConfirmed, onCancelled }) {
  const [busy, setBusy] = useState(false)

  const handleAction = async (action) => {
    setBusy(true)
    try {
      if (action === 'confirm_pickup') {
        const { data, error } = await supabase.rpc('confirm_pickup_order', {
          p_pickup_code: order.pickup_code, p_branch_id: branchId,
        })
        if (error) throw error
        if (data?.error) throw new Error(data.error)
        toast.success(`Order ${order.order_number} collected`)
        onConfirmed()
      } else if (action === 'accept') {
        const { data, error } = await supabase.rpc('approve_online_order', {
          p_order_id: order.id, p_branch_id: branchId,
        })
        if (error) throw error
        if (data?.error) throw new Error(data.error)
        toast.success(`Order ${order.order_number} accepted`)
        // Print drink ticket for the bar.
        // Always enqueue — the print host tablet picks it up. Silent on no-host.
        printDrinkTicket(order, order.pos_order_items || [], branch)
          .catch(err => console.warn(`Drink ticket enqueue failed: ${err.message}`))
        // Vestaboard cheeky greeting.
        if (order.customer_name) {
          sendCustomerGreeting(order.customer_name, { seed: order.order_number })
            .then(r => {
              if (r?.simulated) toast('Vestaboard: no API key — simulated', { icon: '⚙️' })
              else if (r?.skipped) console.log('[Vestaboard] skipped:', r.reason)
              else toast.success(`Vestaboard: ${order.customer_name}`, { duration: 2500 })
            })
            .catch(err => toast.error(`Vestaboard: ${err?.message || 'failed'}`, { duration: 5000 }))
        }
        onConfirmed()
      } else {
        const { data, error } = await supabase.rpc('cancel_online_order', {
          p_order_id: order.id, p_branch_id: branchId,
        })
        if (error) throw error
        if (data?.error) throw new Error(data.error)
        toast(`Order ${order.order_number} cancelled`, { icon: '🚫' })
        onCancelled()
      }
    } catch (err) {
      toast.error(err.message || 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const isPending = order.awaiting_staff_confirm
  const isInProgress = order.status === 'in_progress'

  return (
    <div className={`rounded-lg px-3 py-2 text-sm border ${
      isPending ? 'bg-yellow-500/10 border-yellow-500/40' : 'bg-noch-dark border-transparent'
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-noch-green font-mono text-xs">{order.order_number}</span>
          <span className="text-white font-medium">{order.customer_name || 'Guest'}</span>
          {order.table_number && <span className="text-yellow-400 text-xs">📍 Table {order.table_number}</span>}
          {isInProgress && order.pickup_code && (
            <span className="text-yellow-300 text-xs font-mono tracking-widest mt-1">
              CODE: {order.pickup_code}
            </span>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="text-white font-semibold">{format(order.total)} LYD</span>
          <span className="text-noch-muted text-xs">
            {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
      <div className="flex gap-2 mt-2">
        {isPending && (
          <>
            <button onClick={() => handleAction('decline')} disabled={busy}
              className="flex-1 py-1 text-xs rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 font-medium disabled:opacity-50">
              ✕ Decline
            </button>
            <button onClick={() => handleAction('accept')} disabled={busy}
              className="flex-1 py-1 text-xs rounded-lg bg-noch-green/20 text-noch-green hover:bg-noch-green/30 font-medium disabled:opacity-50">
              ✓ Accept
            </button>
          </>
        )}
        {isInProgress && (
          <>
            <button onClick={() => handleAction('cancel')} disabled={busy}
              className="flex-1 py-1 text-xs rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 font-medium disabled:opacity-50">
              Cancel
            </button>
            <button onClick={() => handleAction('confirm_pickup')} disabled={busy}
              className="flex-1 py-1 text-xs rounded-lg bg-noch-green text-black hover:bg-noch-green/80 font-bold disabled:opacity-50">
              ✓ Collected
            </button>
          </>
        )}
      </div>
    </div>
  )
}
