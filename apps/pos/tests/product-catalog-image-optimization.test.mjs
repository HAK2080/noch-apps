import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const productCatalogUrl = new URL('../src/pages/ProductCatalog.jsx', import.meta.url)

test('global product editor exposes one-click 4:5 WebP optimization', async () => {
  const source = await readFile(productCatalogUrl, 'utf8')

  assert.match(source, /Optimize Image/)
  assert.match(source, /onClick=\{handleOptimizeImage\}/)
  assert.match(source, /await downloadStoredProductImage\(form\.image_url\)/)
  assert.match(source, /await downloadProductImage\(form\.image_url\)/)
  assert.match(source, /await optimizeProductImage\(sourceFile\)/)
  assert.match(source, /await uploadProductImage\(product\.id, optimized\.file\)/)
  assert.match(source, /1200 × 1500 WebP without cropping/)
  assert.match(source, /aspect-\[4\/5\].*object-contain/s)
  assert.doesNotMatch(source, /product\.image_url[^\n]*object-cover/)
})
