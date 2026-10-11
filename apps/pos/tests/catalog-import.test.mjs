import test from 'node:test'
import assert from 'node:assert/strict'
import { validateCatalogImport, planCatalogImport, catalogImportPayload } from '../src/modules/pos/lib/catalog-import.js'
const raw = { sku: 'P5001S', available: true, name: 'Pitcher', name_ar: 'إبريق', description_en: '400 ml', description_ar: '400 مل', sheet_sale_lyd: 137.5, wholesale_usd: 13, photo_data: 'data:image/jpeg;base64,AA==', source_urls: ['https://manufacturer.example/product'] }
test('source-price floor is finite, higher price wins and rounds upward', () => {
  assert.equal(validateCatalogImport([raw])[0].price, 140)
  assert.equal(validateCatalogImport([{ ...raw, wholesale_usd: 20 }])[0].price, 200)
  assert.throws(() => validateCatalogImport([{ ...raw, wholesale_usd: Infinity }]))
  assert.throws(() => validateCatalogImport([{ ...raw, photo_data: 'javascript:alert(1)' }]))
  assert.throws(() => validateCatalogImport([{ ...raw, description_ar: '' }]))
})
test('retries match SKU, reject ambiguous aliases and two rows writing same product', () => {
  const rows = validateCatalogImport([raw])
  assert.equal(planCatalogImport(rows, [{ id: 'a', sku: raw.sku, name: 'Old' }])[0].action, 'Update')
  assert.throws(() => planCatalogImport(rows, [{ id: 'a', name: 'Pitcher' }, { id: 'b', name: 'Pitcher' }]))
  assert.throws(() => planCatalogImport(validateCatalogImport([raw, { ...raw, sku: 'OTHER' }]), [{ id: 'a', name: 'Pitcher' }]))
  assert.throws(() => validateCatalogImport([raw, { ...raw, sku: 'p5001s' }]))
})
test('update preserves counted stock and costs; unavailable only hides customer visibility', () => {
  const row = validateCatalogImport([{ ...raw, stock_qty: 999, cost_price: 999 }])[0]
  const patch = catalogImportPayload(row, { id: 'a' }, 'branch', 'category')
  assert.equal('stock_qty' in patch, false)
  assert.equal('cost_price' in patch, false)
  assert.equal('branch_id' in patch, false)
  assert.equal(patch.track_inventory, false)
  assert.equal(patch.visible_on_website, true)
  assert.equal(patch.visible_on_customer_menu, false)
  assert.deepEqual(catalogImportPayload({ available: false }, {}, '', ''), { visible_on_website: false, visible_on_customer_menu: false })
  assert.equal(planCatalogImport(validateCatalogImport([{ sku: 'X', available: false }]), [])[0].action, 'Skip')
})
test('verified product ID resolves duplicate names and rejects stale IDs', () => {
  const id = '11111111-1111-4111-8111-111111111111'
  const rows = validateCatalogImport([{ ...raw, match_product_id: id }])
  assert.equal(planCatalogImport(rows, [{ id, name: 'Pitcher' }, { id: 'other', name: 'Pitcher' }])[0].existing.id, id)
  assert.throws(() => planCatalogImport(rows, [{ id: 'other', name: 'Pitcher' }]))
  assert.throws(() => validateCatalogImport([{ ...raw, match_product_id: 'invalid' }]))
})
test('corrections require an existing ID and cannot change inventory, cost, price or POS visibility', () => {
  const id = '11111111-1111-4111-8111-111111111111'
  const rawPatch = { sku: 'review-1', match_product_id: id, patch: { name: 'Filter 01', visible_on_website: true } }
  const row = validateCatalogImport([rawPatch])[0]
  assert.equal(planCatalogImport([row], [{ id, name: 'Old' }])[0].action, 'Correct')
  assert.deepEqual(catalogImportPayload(row, { id }, 'branch', 'category'), rawPatch.patch)
  for (const key of ['price', 'stock_qty', 'cost_price', 'track_inventory', 'is_active', 'visible_on_customer_menu']) {
    assert.throws(() => validateCatalogImport([{ ...rawPatch, patch: { [key]: 5 } }]))
  }
  assert.throws(() => validateCatalogImport([{ ...rawPatch, match_product_id: undefined }]))
  assert.throws(() => planCatalogImport([row], []))
  assert.throws(() => validateCatalogImport([{ ...rawPatch, photo_data: 'data:image/jpeg;base64,AA==' }]))
})
