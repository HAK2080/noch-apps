import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  STORED_IMAGE_VARIANTS,
  buildStoredProductImageUrl,
} from '../src/lib/product-images.js'

const BASE = 'https://kxqjasdvoohiexedtfqw.supabase.co/storage/v1/object/public/product-images'
const srcUrl = new URL('../src/lib/product-images.js', import.meta.url)
const processingUrl = new URL('../src/modules/pos/lib/product-image-processing.js', import.meta.url)
const uploadUrl = new URL('../src/modules/pos/lib/pos-supabase.js', import.meta.url)

test('stored variants address a sibling file, never the transform endpoint', () => {
  const master = `${BASE}/products/abc/1712.webp`

  assert.equal(buildStoredProductImageUrl(master, 'full'), master)
  assert.equal(buildStoredProductImageUrl(master, 'card'), `${BASE}/products/abc/1712-720.webp`)
  assert.equal(buildStoredProductImageUrl(master, 'thumb'), `${BASE}/products/abc/1712-160.webp`)

  for (const variant of Object.keys(STORED_IMAGE_VARIANTS)) {
    const url = buildStoredProductImageUrl(master, variant)
    assert.doesNotMatch(url, /render\/image/, `${variant} must not use the transform endpoint`)
    assert.doesNotMatch(url, /[?&](width|height|quality|resize)=/, `${variant} must not send transform params`)
  }
})

test('non-storage, empty and unknown inputs degrade to the original source', () => {
  assert.equal(buildStoredProductImageUrl('', 'card'), '')
  assert.equal(buildStoredProductImageUrl(null, 'card'), '')

  const external = 'https://images.example.com/photo.jpg'
  assert.equal(buildStoredProductImageUrl(external, 'card'), external)

  const notAUrl = 'products/abc/1712.webp'
  assert.equal(buildStoredProductImageUrl(notAUrl, 'card'), notAUrl)

  const master = `${BASE}/products/abc/1712.webp`
  assert.equal(buildStoredProductImageUrl(master, 'nope'), master)
  assert.equal(buildStoredProductImageUrl(master), master)

  // A path with no extension cannot take a suffix and must stay untouched.
  const noExt = `${BASE}/products/abc/1712`
  assert.equal(buildStoredProductImageUrl(noExt, 'card'), noExt)
})

test('a dot in the folder does not confuse the extension split', () => {
  const master = `${BASE}/products/v1.2/1712.webp`
  assert.equal(buildStoredProductImageUrl(master, 'card'), `${BASE}/products/v1.2/1712-720.webp`)
})

test('no source file references the Storage image transformation endpoint', async () => {
  for (const url of [srcUrl, processingUrl, uploadUrl]) {
    const source = await readFile(url, 'utf8')
    assert.doesNotMatch(source, /render\/image/, `${url.pathname} must not reference transformations`)
  }
})

test('every stored variant is rendered and uploaded', async () => {
  const processing = await readFile(processingUrl, 'utf8')
  assert.match(processing, /export const PRODUCT_IMAGE_VARIANTS/)
  assert.match(processing, /export async function optimizeProductImageSet/)
  // Suffixes in the renderer must match the ones the URL builder addresses.
  for (const suffix of Object.values(STORED_IMAGE_VARIANTS)) {
    if (!suffix) continue
    assert.ok(processing.includes(`suffix: '${suffix}'`), `renderer must produce ${suffix}`)
  }

  const upload = await readFile(uploadUrl, 'utf8')
  assert.match(upload, /Array\.isArray\(fileOrSet\?\.variants\)/)
  assert.match(upload, /for \(const item of uploads\)/)
})

test('upload paths keep the master addressable by its unsuffixed name', async () => {
  const upload = await readFile(uploadUrl, 'utf8')
  // getPublicUrl must point at the master, not the last uploaded derivative.
  assert.match(upload, /getPublicUrl\(`\$\{basePath\}\.\$\{ext\}`\)/)
})

test('image call sites request a stored variant', async () => {
  const sites = [
    ['../src/modules/pos/components/ProductGrid.jsx', "buildStoredProductImageUrl(product.image_url, 'card')"],
    ['../src/modules/pos/pages/POSProducts.jsx', "buildStoredProductImageUrl(form.image_url, 'card')"],
    ['../src/pages/storefront/Menu.jsx', "buildStoredProductImageUrl(imageUrl, 'thumb')"],
  ]
  for (const [relative, expected] of sites) {
    const source = await readFile(new URL(relative, import.meta.url), 'utf8')
    assert.ok(source.includes(expected), `${relative} should call ${expected}`)
    assert.doesNotMatch(source, /buildOptimizedProductImageUrl/, `${relative} must not use the transform builder`)
  }
})
