// pos-offline.js — IndexedDB offline support for POS
// Uses idb package. Database: noch-pos

import { openDB } from 'idb'

const DB_NAME = 'noch-pos'
const DB_VERSION = 1

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
  for (const key of existing) await tx.store.delete(key)
  // Insert new
  for (const p of products) await tx.store.put({ ...p, branch_id: branchId })
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
  for (const key of existing) await tx.store.delete(key)
  for (const c of categories) await tx.store.put({ ...c, branch_id: branchId })
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
  return local_id
}

export async function getOfflineQueue() {
  const db = await getDB()
  return db.getAll('offline_orders')
}

export async function clearOfflineOrder(localId) {
  const db = await getDB()
  await db.delete('offline_orders', localId)
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
