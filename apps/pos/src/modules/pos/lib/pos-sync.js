// pos-sync.js — Offline order sync service.
// Audit fix 2026-05-06:
//   - Each queued order carries the idempotency_key generated at charge time,
//     so a sync re-run (page reload mid-drain, two tabs) cannot duplicate
//     orders — create_pos_order returns the existing row on key replay.
//   - The OFFLINE-N number printed on the customer's receipt is preserved
//     server-side via p_offline_order_number, so reprints/refunds match.
//   - A single in-flight guard prevents two `online` events from both
//     starting a drain at the same time.

import {
  getOfflineQueue,
  clearOfflineOrder,
  isOnline,
  isRetryablePOSNetworkError,
  withPOSNetworkTimeout,
} from './pos-offline'
import { createPOSOrder } from './pos-supabase'
import toast from 'react-hot-toast'

let _syncing = false

export async function syncOfflineOrders() {
  if (!isOnline()) return { synced: 0, failed: 0 }
  if (_syncing) return { synced: 0, failed: 0, skipped: true }
  _syncing = true

  try {
    const queue = await getOfflineQueue()
    if (!queue.length) return { synced: 0, failed: 0 }

    let synced = 0
    let failed = 0

    for (const offlineOrder of queue) {
      try {
        const { local_id, items } = offlineOrder
        const orderData = { ...offlineOrder }
        delete orderData.local_id
        delete orderData.items
        delete orderData.queued_at
        // Preserve the OFFLINE-N order number the customer's receipt shows.
        const offlineNumber = `OFFLINE-${local_id}`
        await withPOSNetworkTimeout(createPOSOrder(
          { ...orderData, offline_order_number: offlineNumber },
          items || []
        ))
        await clearOfflineOrder(local_id)
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('pos-network-restored'))
        synced++
      } catch (err) {
        console.error('Failed to sync offline order:', err)
        failed++
        // A weak connection will fail the rest of this FIFO queue too. Stop
        // hammering it and retry later; successful earlier rows are removed.
        if (isRetryablePOSNetworkError(err)) break
      }
    }

    return { synced, failed }
  } finally {
    _syncing = false
  }
}

async function drainQueue() {
  const queue = await getOfflineQueue()
  if (!queue.length) return

  toast.loading(`Syncing ${queue.length} offline order(s)…`, { id: 'pos-sync' })
  try {
    const { synced, failed } = await syncOfflineOrders()
    if (failed === 0) {
      toast.success(`Synced ${synced} offline order(s)`, { id: 'pos-sync' })
    } else {
      toast.error(`Synced ${synced}, failed ${failed}`, { id: 'pos-sync' })
    }
  } catch (err) {
    toast.error('Sync failed: ' + err.message, { id: 'pos-sync' })
  }
}

export function startSyncListener() {
  // Drain any orders that were queued during a previous offline session.
  // (The 'online' event only fires on a transition, so it's never triggered
  // if the device was already online when the page loaded.)
  if (isOnline()) drainQueue().catch(() => {})

  const handleOnline = () => drainQueue().catch(() => {})

  window.addEventListener('online', handleOnline)

  // navigator.onLine often stays true on poor Wi-Fi. Checking the local queue
  // once a minute lets timed-out sales recover without generating any network
  // traffic while the queue is empty.
  const retryTimer = setInterval(() => {
    if (!document.hidden && isOnline()) drainQueue().catch(() => {})
  }, 60000)

  // Return cleanup fn
  return () => {
    window.removeEventListener('online', handleOnline)
    clearInterval(retryTimer)
  }
}
