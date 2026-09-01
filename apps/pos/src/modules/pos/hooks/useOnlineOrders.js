import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { isOnline } from '../lib/pos-offline'

// ── Sound alert (Web Audio API — no file needed) ─────────────────────────────
function playOrderAlert() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const play = (freq, start, dur) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.35, ctx.currentTime + start)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur)
      osc.start(ctx.currentTime + start)
      osc.stop(ctx.currentTime + start + dur)
    }
    play(880, 0, 0.15)
    play(1100, 0.18, 0.15)
    play(1320, 0.36, 0.25)
  } catch { /* audio alerts are optional */ }
}

// Pending online orders for a branch: fetch, realtime INSERT subscription
// (with sound + popup alert), and a 60s fallback poll. Used by POSTerminal's
// header badge, the online-orders panel, and the new-order popup.
export function useOnlineOrders(branchId) {
  const [onlineOrders, setOnlineOrders] = useState([])
  const [showOnlineOrders, setShowOnlineOrders] = useState(false)
  const [newOrderAlert, setNewOrderAlert] = useState(null) // order to show in popup
  const onlineOrdersTimer = useRef(null)

  // Fetch pending online orders (initial load + after actions)
  const fetchOnlineOrders = useCallback(async () => {
    if (!isOnline()) return
    try {
      const { data } = await supabase
        .from('pos_orders')
        .select('id,order_number,customer_name,customer_phone,total,table_number,created_at,awaiting_staff_confirm,pickup_code,status,pos_order_items(product_name,product_name_ar,quantity,unit_price,total)')
        .eq('branch_id', branchId)
        .eq('source', 'online')
        .in('status', ['pending', 'in_progress'])
        .order('created_at', { ascending: false })
        .limit(20)
      setOnlineOrders(data || [])
    } catch { /* silently ignore */ }
  }, [branchId])

  // Realtime subscription — instant notification on new online order
  useEffect(() => {
    // fetchOnlineOrders is async; setOnlineOrders only runs after the
    // awaited query resolves, so this isn't a synchronous setState-in-effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchOnlineOrders()

    const channel = supabase
      .channel(`online-orders-${branchId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'pos_orders',
        filter: `branch_id=eq.${branchId}`,
      }, async (payload) => {
        if (payload.new?.source !== 'online') return
        // Fetch full order with items for the popup
        const { data } = await supabase
          .from('pos_orders')
          .select('id,order_number,customer_name,customer_phone,total,table_number,created_at,awaiting_staff_confirm,pickup_code,status,pos_order_items(product_name,product_name_ar,quantity,unit_price,total)')
          .eq('id', payload.new.id)
          .single()
        if (data) {
          setNewOrderAlert(data)
          setShowOnlineOrders(true)
          playOrderAlert()
          fetchOnlineOrders()
        }
      })
      .subscribe()

    // Fallback poll every 60s (covers cases where Realtime misses an event)
    onlineOrdersTimer.current = setInterval(fetchOnlineOrders, 60000)

    return () => {
      supabase.removeChannel(channel)
      if (onlineOrdersTimer.current) clearInterval(onlineOrdersTimer.current)
    }
  }, [branchId, fetchOnlineOrders])

  return {
    onlineOrders,
    showOnlineOrders, setShowOnlineOrders,
    newOrderAlert, setNewOrderAlert,
    fetchOnlineOrders,
  }
}
