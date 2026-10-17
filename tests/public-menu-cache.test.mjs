import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPublicMenuService } from '../backend/public-menu-cache/server.mjs'

const branch = '8936e821-ad7f-4d69-b654-c2f76404f89f'
const request = path => new Request('http://test' + path)
function fixture() {
  let time = 0
  let broken = false
  let closed = false
  const calls = []
  const service = createPublicMenuService({ anonKey: 'anonymous', now: () => time, fetchImpl: async (input, init) => {
    const url = new URL(input)
    calls.push({ url, init })
    if (broken) throw new Error('offline')
    let data = []
    if (url.pathname.endsWith('/pos_branches')) data = closed ? [] : [{ id: branch, name: 'City Walk' }]
    if (url.pathname.endsWith('/pos_products')) data = [{ id: 'visible', price: 15 }, { id: 'blocked', price: 20 }]
    if (url.pathname.endsWith('/get_customer_sale_availability')) data = [{ product_id: 'visible', available: true }]
    if (url.pathname.endsWith('/my_profile_v2')) data = init.headers.Authorization === 'Bearer owner' ? [{ id: 'owner', role: 'owner', access_enabled: true }] : []
    return Response.json(data)
  } })
  return { ...service, calls, advance: n => { time += n }, break: () => { broken = true }, close: () => { closed = true } }
}

test('shared cache coalesces concurrent loads and filters unavailable products', async () => {
  const f = fixture()
  const responses = await Promise.all(Array.from({ length: 8 }, () => f.handle(request('/v1/branches/' + branch))))
  assert.equal(f.calls.length, 4)
  assert.deepEqual((await responses[0].json()).products.map(p => p.id), ['visible'])
  const hit = await f.handle(request('/v1/branches/' + branch))
  assert.equal(hit.headers.get('X-Noch-Menu-Cache'), 'HIT')
  assert.equal(f.calls.length, 4)
  assert.ok(f.calls.every(c => c.init.headers.Authorization === 'Bearer anonymous'))
  assert.ok(!f.calls.find(c => c.url.pathname.endsWith('pos_products')).url.searchParams.get('select').includes('cost'))
})

test('expiry reloads; bounded stale fallback and closed branches are respected', async () => {
  const f = fixture()
  await f.handle(request('/v1/branches/' + branch))
  f.advance(61000)
  await f.handle(request('/v1/branches/' + branch))
  assert.equal(f.calls.length, 8)
  f.advance(61000); f.break()
  assert.equal((await f.handle(request('/v1/branches/' + branch))).headers.get('X-Noch-Menu-Cache'), 'STALE')
  f.advance(300000)
  assert.equal((await f.handle(request('/v1/branches/' + branch))).status, 502)
  const g = fixture()
  await g.handle(request('/v1/branches/' + branch))
  g.advance(61000); g.close()
  assert.equal((await g.handle(request('/v1/branches/' + branch))).status, 404)
})

test('invalidation requires an enabled editor and clears existing snapshots', async () => {
  const f = fixture()
  await f.handle(request('/v1/branches/' + branch))
  for (const token of ['', 'anonymous', 'staff']) {
    const result = await f.handle(new Request('http://test/v1/invalidate', { method: 'POST', headers: { Authorization: 'Bearer ' + token } }))
    assert.equal(result.status, 403)
  }
  assert.equal((await f.handle(new Request('http://test/v1/invalidate', { method: 'POST', headers: { Authorization: 'Bearer owner' } }))).status, 200)
  assert.equal((await f.handle(request('/v1/branches/' + branch))).headers.get('X-Noch-Menu-Cache'), 'MISS')
})

test('media denies private paths and falls back safely on R2 failure', async () => {
  const calls = []
  const f = createPublicMenuService({ fetchImpl: async input => {
    calls.push(String(input))
    if (String(input).includes('workers.dev')) return new Response(null, { status: 503 })
    return new Response('image', { headers: { 'Content-Type': 'image/webp', 'Set-Cookie': 'origin-only=secret' } })
  } })
  for (const path of ['expense-receipts/test.webp', 'staff-photos/person.png', 'category-icons/person.png', 'invalid']) {
    assert.equal((await f.handle(request('/media/' + path))).status, 404)
  }
  assert.equal(calls.length, 0)
  const result = await f.handle(request('/media/products/' + branch + '/test.webp'))
  assert.equal(result.headers.get('X-Noch-Media-Source'), 'origin-fallback')
  assert.equal(result.headers.get('Set-Cookie'), null)
  assert.equal(await result.text(), 'image')
  assert.equal(calls.length, 2)
})
