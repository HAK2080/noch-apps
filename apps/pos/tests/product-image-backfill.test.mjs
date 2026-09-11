import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { productImageNeedsVariants } from '../src/lib/product-images.js'

const BASE = 'https://kxqjasdvoohiexedtfqw.supabase.co/storage/v1/object/public/product-images'
const master = `${BASE}/products/abc/1712.webp`
const backfillUrl = new URL('../src/modules/pos/lib/product-image-backfill.js', import.meta.url)
const catalogUrl = new URL('../src/pages/ProductCatalog.jsx', import.meta.url)

function respond(ok) {
  const spy = async (url, options) => {
    spy.lastUrl = url
    spy.lastOptions = options
    spy.calls += 1
    return { ok }
  }
  spy.calls = 0
  return spy
}

test('a missing card variant marks the image for re-rendering', async () => {
  const fetchImpl = respond(false)
  assert.equal(await productImageNeedsVariants(master, { fetchImpl }), true)
  assert.equal(fetchImpl.lastUrl, `${BASE}/products/abc/1712-720.webp`)
  assert.equal(fetchImpl.lastOptions.method, 'HEAD')
})

test('an existing card variant is left alone', async () => {
  assert.equal(await productImageNeedsVariants(master, { fetchImpl: respond(true) }), false)
})

test('empty and non-storage sources are never re-rendered', async () => {
  const fetchImpl = respond(false)
  assert.equal(await productImageNeedsVariants('', { fetchImpl }), false)
  assert.equal(await productImageNeedsVariants(null, { fetchImpl }), false)
  assert.equal(await productImageNeedsVariants('https://images.example.com/a.jpg', { fetchImpl }), false)
  assert.equal(await productImageNeedsVariants('not a url', { fetchImpl }), false)
  assert.equal(fetchImpl.calls, 0, 'no request should be made for these')
})

test('a network failure does not trigger a re-upload', async () => {
  const failing = async () => { throw new Error('offline') }
  assert.equal(await productImageNeedsVariants(master, { fetchImpl: failing }), false)
})

test('the backfill runs sequentially and survives a single failure', async () => {
  const source = await readFile(backfillUrl, 'utf8')

  assert.match(source, /for \(const product of targets\)/)
  assert.match(source, /await uploadProductImage\(product\.id, optimized\)/)
  assert.match(source, /catch \(error\)/)
  assert.match(source, /failed\.push\(/)
  // A failure must not abort the remaining products.
  assert.doesNotMatch(source, /Promise\.all\(/)
  assert.match(source, /shouldStop\?\.\(\)/)
})

test('the catalog exposes the backfill to owners only', async () => {
  const source = await readFile(catalogUrl, 'utf8')

  assert.match(source, /profile\?\.role === 'owner' &&/)
  assert.match(source, /onClick=\{handleBackfillImages\}/)
  assert.match(source, /backfillProductImageVariants\(candidates/)
  assert.match(source, /Pre-size images/)
  // Progress must be visible while a long run is in flight.
  assert.match(source, /Pre-sizing product images/)
})
