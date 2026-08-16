import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { buildOptimizedProductImageUrl } from '../src/lib/product-images.js'
import {
  PRODUCT_IMAGE_HEIGHT,
  PRODUCT_IMAGE_WIDTH,
  calculateContainedImageRect,
  generatedImageFileFromBase64,
} from '../src/modules/pos/lib/product-image-processing.js'

const menuCssUrl = new URL('../src/pages/storefront/styles/Menu.css', import.meta.url)
const posSupabaseUrl = new URL('../src/modules/pos/lib/pos-supabase.js', import.meta.url)

test('public Supabase product images use a contained optimized derivative', () => {
  const source = 'https://example.supabase.co/storage/v1/object/public/product-images/products/item/photo.png'
  const optimized = new URL(buildOptimizedProductImageUrl(source))

  assert.equal(optimized.pathname, '/storage/v1/render/image/public/product-images/products/item/photo.png')
  assert.equal(optimized.searchParams.get('width'), '400')
  assert.equal(optimized.searchParams.get('height'), '500')
  assert.equal(optimized.searchParams.get('resize'), 'contain')
  assert.equal(optimized.searchParams.get('quality'), '80')
})

test('non-Supabase and malformed product image URLs remain unchanged', () => {
  assert.equal(
    buildOptimizedProductImageUrl('https://images.example.com/drink.jpg'),
    'https://images.example.com/drink.jpg',
  )
  assert.equal(buildOptimizedProductImageUrl('not a url'), 'not a url')
})

test('portrait and square originals fit the 4:5 canvas without cropping', () => {
  assert.deepEqual(calculateContainedImageRect(1000, 1500), {
    x: 148,
    y: 72,
    width: 904,
    height: 1356,
  })
  assert.deepEqual(calculateContainedImageRect(1000, 1000), {
    x: 72,
    y: 222,
    width: 1056,
    height: 1056,
  })
  assert.equal(PRODUCT_IMAGE_WIDTH / PRODUCT_IMAGE_HEIGHT, 4 / 5)
})

test('generated image bytes become a browser file for the standard optimizer', () => {
  const encoded = Buffer.from([82, 73, 70, 70]).toString('base64')
  const file = generatedImageFileFromBase64(encoded, 'image/webp', 'matcha-ai.webp')

  assert.equal(file.name, 'matcha-ai.webp')
  assert.equal(file.type, 'image/webp')
  assert.equal(file.size, 4)
  assert.throws(() => generatedImageFileFromBase64('not base64!'), /invalid product image/)
})

test('menu presentation and uploads preserve the optimization contract', async () => {
  const [css, uploadSource] = await Promise.all([
    readFile(menuCssUrl, 'utf8'),
    readFile(posSupabaseUrl, 'utf8'),
  ])

  assert.match(css, /\.scroll-card-img\s*\{[^}]*aspect-ratio:\s*4\s*\/\s*5/s)
  assert.match(css, /\.grid-card-img\s*\{[^}]*aspect-ratio:\s*4\s*\/\s*5/s)
  assert.match(css, /\.menu-product-image-media\s*\{[^}]*object-fit:\s*contain/s)
  assert.match(css, /\.scroll-card-img \.menu-product-image-media,[\s\S]*\.grid-card-img \.menu-product-image-media\s*\{[^}]*object-fit:\s*cover;[^}]*transform:\s*scale\(1\.12\)/)
  assert.match(css, /\.scroll-row\s*\{[^}]*align-items:\s*flex-start/s)
  assert.match(css, /\.grid-2col\s*\{[^}]*align-items:\s*start/s)
  assert.match(css, /\.grid-card-body-text\s*\{[^}]*min-height:\s*40px;[^}]*padding:\s*8px 10px 2px/s)
  assert.match(css, /\.grid-card \.grid-card-footer\s*\{[^}]*min-height:\s*42px;[^}]*padding:\s*2px 10px 8px/s)
  assert.match(css, /\.menu-product-image-skeleton/)
  assert.match(uploadSource, /cacheControl:\s*'31536000'/)
  assert.match(uploadSource, /contentType:\s*file\.type/)
})
