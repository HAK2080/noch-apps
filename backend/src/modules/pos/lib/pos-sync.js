// pos-sync.js — Offline order sync service

import { getOfflineQueue, clearOfflineOrder, isOnline } from './pos-offline'
import { createPOSOrder } from './pos-supabase'
import toast from 'react-hot-toast'

export async function syncOfflineOrders() {
  if (!isOnline()) return { synced: 0, failed: 0 }

  const queue = await getOfflineQueue()
  if (!queue.length) return { synced: 0, failed: 0 }

  let synced = 0
  let failed = 0

  for (const offlineOrder of queue) {
    try {
      const { local_id, items, queued_at, ...orderData } = offlineOrder
      await createPOSOrder(orderData, items || [])
      await clearOfflineOrder(local_id)
      synced++
    } catch (err) {
      console.error('Failed to sync offline order:', err)
      failed++
    }
  }

  return { synced, failed }
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
