// pos-offline.js — IndexedDB offline support for POS
// Uses idb package. Database: noch-pos

import { openDB } from 'idb'

const DB_NAME = 'noch-pos'
const DB_VERSION = 2

async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('products')) {
        const prodStore = db.createObjectStore('products', { keyPath: 'id' })
        prodStore.createIndex('branch_id', 'branch_id')
      }
      if (!db.objectStoreNames.contains('categories')) {
        const catStore = db.createObjectStore('categories', { keyPath: 'id' })
        catStore.createIndex('branch_id', 'branch_id')
      }
      if (!db.objectStoreNames.contains('offline_orders')) {
        db.createObjectStore('offline_orders', { keyPath: 'local_id', autoIncrement: true })
      }
      if (!db.objectStoreNames.contains('branch_config')) {
        db.createObjectStore('branch_config', { keyPath: 'branch_id' })
      }
      // v2: held (parked) orders — local-only, never touches the server or
      // inventory until resumed and charged like a normal sale.
      if (!db.objectStoreNames.contains('held_orders')) {
        const heldStore = db.createObjectStore('held_orders', { keyPath: 'local_id', autoIncrement: true })
        heldStore.createIndex('branch_id', 'branch_id')
      }
    },
  })
}

// ── Products ──────────────────────────────────────────────────

export async function cacheProducts(branchId, products) {
  const db = await getDB()
  const tx = db.transaction('products', 'readwrite')
  // Clear existing for this branch
  const index = tx.store.index('branch_id')
  const existing = await index.getAllKeys(branchId)
  for (const key of existing) tx.store.delete(key)
  // Insert new
  for (const p of products) tx.store.put({ ...p, branch_id: branchId })
  await tx.done
}

export async function getCachedProducts(branchId) {
  const db = await getDB()
  const index = db.transaction('products').store.index('branch_id')
  return index.getAll(branchId)
}

// ── Categories ────────────────────────────────────────────────

export async function cacheCategories(branchId, categories) {
  const db = await getDB()
  const tx = db.transaction('categories', 'readwrite')
  const index = tx.store.index('branch_id')
  const existing = await index.getAllKeys(branchId)
  for (const key of existing) tx.store.delete(key)
  for (const c of categories) tx.store.put({ ...c, branch_id: branchId })
  await tx.done
}

export async function getCachedCategories(branchId) {
  const db = await getDB()
  const index = db.transaction('categories').store.index('branch_id')
  return index.getAll(branchId)
}

// ── Offline Order Queue ───────────────────────────────────────

export async function queueOfflineOrder(orderData) {
  const db = await getDB()
  const local_id = await db.add('offline_orders', {
    ...orderData,
    queued_at: new Date().toISOString(),
  })
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('pos-offline-queue-changed'))
  return local_id
}

export async function getOfflineQueue() {
  const db = await getDB()
  return db.getAll('offline_orders')
}

export async function clearOfflineOrder(localId) {
  const db = await getDB()
  await db.delete('offline_orders', localId)
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('pos-offline-queue-changed'))
}

// ── Held (parked) Orders ──────────────────────────────────────
// Local-only. A held order is a full snapshot of an unfinished cart so
// staff can serve another customer and resume later. These NEVER hit the
// server or inventory — they only become a real sale when resumed and
// charged through the normal payment flow. Tagged with branch + staff so
// the panel can show who parked each one.

export async function holdOrder(record) {
  const db = await getDB()
  const now = new Date().toISOString()
  const local_id = await db.add('held_orders', {
    ...record,
    held_at: record.held_at || now,
    updated_at: now,
  })
  return local_id
}

export async function getHeldOrders(branchId) {
  const db = await getDB()
  const index = db.transaction('held_orders').store.index('branch_id')
  const rows = await index.getAll(branchId)
  // Newest first.
  return rows.sort((a, b) => (b.held_at || '').localeCompare(a.held_at || ''))
}

export async function getHeldOrder(localId) {
  const db = await getDB()
  return db.get('held_orders', localId)
}

export async function deleteHeldOrder(localId) {
  const db = await getDB()
  await db.delete('held_orders', localId)
}

// ── Branch Config Cache ───────────────────────────────────────

export async function cacheBranchConfig(branchId, config) {
  const db = await getDB()
  await db.put('branch_config', { branch_id: branchId, ...config, cached_at: new Date().toISOString() })
}

export async function getCachedBranchConfig(branchId) {
  const db = await getDB()
  return db.get('branch_config', branchId)
}

// ── Online check ──────────────────────────────────────────────

export function isOnline() {
  return navigator.onLine
}

export function isRetryablePOSNetworkError(error) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const message = String(error?.message || error || '').toLowerCase()
  return error?.name === 'TimeoutError'
    || error?.code === 'POS_NETWORK_TIMEOUT'
    || message.includes('failed to fetch')
    || message.includes('networkerror')
    || message.includes('network request failed')
    || message.includes('load failed')
    || message.includes('connection')
    || message.includes('timed out')
}

export function withPOSNetworkTimeout(promise, timeoutMs = 12000) {
  let timeoutId
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error('The café connection timed out')
      error.name = 'TimeoutError'
      error.code = 'POS_NETWORK_TIMEOUT'
      reject(error)
    }, timeoutMs)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId))
}
