import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { getSharedPublicMenu, schedulePublicMenuRefresh } from '../apps/pos/src/lib/public-menu-cache.js'
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

test('client validates snapshots and rejects malformed branch data', async () => {
  globalThis.fetch = async () => Response.json({ version: 1, products: [], categories: [], branch: { id: 'branch' } })
  assert.equal((await getSharedPublicMenu('branch')).branch.id, 'branch')
  globalThis.fetch = async () => Response.json({ version: 1, products: [], categories: [] })
  await assert.rejects(() => getSharedPublicMenu('branch'), /Invalid shared menu/)
})

test('only successful catalogue writes invalidate; reads, orders and failed writes do not', async () => {
  const calls = []
  globalThis.fetch = async (input, init) => { calls.push({ input, init }); return Response.json({ ok: true }) }
  const origin = 'https://kxqjasdvoohiexedtfqw.supabase.co/rest/v1/'
  const headers = { Authorization: 'Bearer owner-session' }
  for (const [path, method, ok] of [['pos_products', 'GET', true], ['pos_orders', 'POST', true], ['rpc/finalize_order', 'POST', true], ['pos_products', 'PATCH', false]]) {
    schedulePublicMenuRefresh(origin + path, { method, headers }, { ok })
  }
  await new Promise(resolve => setTimeout(resolve, 350))
  assert.equal(calls.length, 0)
  schedulePublicMenuRefresh(new URL(origin + 'pos_products'), { method: 'PATCH', headers }, { ok: true })
  schedulePublicMenuRefresh(origin + 'pos_categories', { method: 'POST', headers }, { ok: true })
  await new Promise(resolve => setTimeout(resolve, 350))
  assert.equal(calls.length, 1)
  assert.ok(calls[0].input.endsWith('/v1/invalidate'))
  assert.equal(calls[0].init.headers.Authorization, 'Bearer owner-session')
})
