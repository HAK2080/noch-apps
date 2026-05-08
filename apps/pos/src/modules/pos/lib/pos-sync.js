// pos-sync.js — Offline order sync service.
// Audit fix 2026-05-06:
//   - Each queued order carries the idempotency_key generated at charge time,
//     so a sync re-run (page reload mid-drain, two tabs) cannot duplicate
//     orders — create_pos_order returns the existing row on key replay.
//   - The OFFLINE-N number printed on the customer's receipt is preserved
//     server-side via p_offline_order_number, so reprints/refunds match.
//   - A single in-flight guard prevents two `online` events from both
//     starting a drain at the same time.

import { getOfflineQueue, clearOfflineOrder, isOnline } from './pos-offline'
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
        const { local_id, items, queued_at, ...orderData } = offlineOrder
        // Preserve the OFFLINE-N order number the customer's receipt shows.
        const offlineNumber = `OFFLINE-${local_id}`
        await createPOSOrder(
          { ...orderData, offline_order_number: offlineNumber },
          items || []
        )
        await clearOfflineOrder(local_id)
        synced++
      } catch (err) {
        console.error('Failed to sync offline order:', err)
        failed++
      }
    }

    return { synced, failed }
  } finally {
    _syncing = false
  }
}

export function startSyncListener() {
  const handleOnline = async () => {
    const queue = await getOfflineQueue()
    if (!queue.length) return

    toast.loading(`Syncing ${queue.length} offline order(s)...`, { id: 'pos-sync' })
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

  window.addEventListener('online', handleOnline)

  // Return cleanup fn
  return () => window.removeEventListener('online', handleOnline)
}
