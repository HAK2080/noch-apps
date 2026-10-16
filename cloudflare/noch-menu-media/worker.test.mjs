import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import worker from './worker.js'

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

const key = 'products/4d481f28-be35-4fdd-ba49-8e1788858bb5/1791825138132-720.webp'
const requestUrl = `https://noch-menu-media.2080testing.workers.dev/${key}`

function bucket() {
  const objects = new Map()
  return {
    objects,
    async put(path, body, options) { objects.set(path, { body, options }) },
    async get(path, options) {
      const stored = objects.get(path)
      if (!stored) return null
      const bytes = new Uint8Array(stored.body)
      const rangeHeader = options?.range?.get('Range')
      const match = /^bytes=(\d+)-(\d+)$/.exec(rangeHeader || '')
      const start = match ? Number(match[1]) : 0
      const end = match ? Math.min(Number(match[2]) + 1, bytes.length) : bytes.length
      return {
        body: new Response(bytes.slice(start, end)).body,
        size: bytes.length,
        httpEtag: '"test-etag"',
        range: match ? { offset: start, length: end - start } : undefined,
        writeHttpMetadata(headers) { headers.set('Content-Type', stored.options.httpMetadata.contentType) },
      }
    },
  }
}

test('copies a public image once and serves later reads from R2', async () => {
  const mediaBucket = bucket()
  let originReads = 0
  globalThis.fetch = async () => {
    originReads += 1
    return new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'image/webp' } })
  }
  const env = { MEDIA_BUCKET: mediaBucket }
  const first = await worker.fetch(new Request(requestUrl), env)
  const second = await worker.fetch(new Request(requestUrl), env)
  assert.equal(first.status, 200)
  assert.equal(second.status, 200)
  assert.deepEqual(new Uint8Array(await second.arrayBuffer()), new Uint8Array([1, 2, 3]))
  assert.equal(originReads, 1)
  assert.equal(mediaBucket.objects.size, 1)
})

test('returns a ranged response from R2', async () => {
  const mediaBucket = bucket()
  await mediaBucket.put(key, new Uint8Array([1, 2, 3, 4]), { httpMetadata: { contentType: 'image/webp' } })
  const response = await worker.fetch(new Request(requestUrl, { headers: { Range: 'bytes=1-2' } }), { MEDIA_BUCKET: mediaBucket })
  assert.equal(response.status, 206)
  assert.equal(response.headers.get('Content-Range'), 'bytes 1-2/4')
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([2, 3]))
})

test('maps a missing Supabase derivative to 404', async () => {
  globalThis.fetch = async () => new Response('', { status: 400 })
  const response = await worker.fetch(new Request(requestUrl), { MEDIA_BUCKET: bucket() })
  assert.equal(response.status, 404)
})

test('rejects other paths and write methods', async () => {
  const env = { MEDIA_BUCKET: bucket() }
  assert.equal((await worker.fetch(new Request('https://example.com/expense-receipts/file.pdf'), env)).status, 404)
  assert.equal((await worker.fetch(new Request(requestUrl, { method: 'PUT' }), env)).status, 405)
})
