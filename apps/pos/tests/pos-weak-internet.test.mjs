import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { cacheProfile, getCachedProfile } from '../src/lib/profile-cache.js'
import { cacheRolePermissions, getCachedRolePermissions } from '../src/lib/permission-cache.js'
import { isRetryablePOSNetworkError, withPOSNetworkTimeout } from '../src/modules/pos/lib/pos-offline.js'

function memoryStorage() {
  const values = new Map()
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

test('profile cache is user-scoped and expires after seven days', () => {
  const storage = memoryStorage()
  const now = Date.now()
  cacheProfile('user-1', { id: 'user-1', role: 'staff' }, storage)
  assert.equal(getCachedProfile('user-1', storage, now)?.role, 'staff')
  assert.equal(getCachedProfile('user-2', storage, now), null)
  assert.equal(getCachedProfile('user-1', storage, now + 8 * 24 * 60 * 60 * 1000), null)
})

test('permission cache is role-scoped and expires after seven days', () => {
  const storage = memoryStorage()
  const now = Date.now()
  cacheRolePermissions('staff', { pos: { can_access: true, can_edit: false } }, storage)
  assert.equal(getCachedRolePermissions('staff', storage, now)?.pos.can_access, true)
  assert.equal(getCachedRolePermissions('owner', storage, now), null)
  assert.equal(getCachedRolePermissions('staff', storage, now + 8 * 24 * 60 * 60 * 1000), null)
})

test('weak-network failures are eligible for the idempotent offline queue', () => {
  assert.equal(isRetryablePOSNetworkError(new TypeError('Failed to fetch')), true)
  assert.equal(isRetryablePOSNetworkError({ message: 'duplicate key', code: '23505' }), false)
})

test('network timeout stops a hanging checkout attempt', async () => {
  await assert.rejects(
    withPOSNetworkTimeout(new Promise(() => {}), 5),
    error => error.code === 'POS_NETWORK_TIMEOUT',
  )
})

test('service worker precaches entry assets and persists optimized product images', async () => {
  const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8')
  assert.match(source, /matchAll\(\/\(\?:src\|href\)/)
  assert.match(source, /noch-pos-images-v1/)
  assert.match(source, /render\/image\/public\/product-images/)
  assert.match(source, /fetchWithTimeout\(req, 4000, \{ cache: 'reload' \}\)/)
  assert.match(source, /event\.waitUntil\(\s*precacheCurrentShell\(\)/)
})

test('dashboard and customer storefront stay out of the eager POS shell', async () => {
  const source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
  assert.match(source, /const Dashboard\s+= lazy/)
  assert.match(source, /const Menu\s+= lazy/)
  assert.doesNotMatch(source, /import Dashboard from/)
  assert.doesNotMatch(source, /import Menu from/)
})
