import test from 'node:test'
import assert from 'node:assert/strict'
import { toPOSProductWrite } from '../src/modules/pos/lib/pos-product-write.js'

test('product writes exclude joined and location-derived read metadata', () => {
  const write = toPOSProductWrite({
    id: 'product-1',
    name: 'Chocolate Croissant',
    price: 12,
    pos_categories: { name: 'Pastries' },
    pos_branches: { name: 'Main' },
    stock_location_id: 'location-1',
    stock_updated_at: '2026-08-02T09:00:00.000Z',
    stock_source: 'location_product_stock',
  })

  assert.deepEqual(write, {
    id: 'product-1',
    name: 'Chocolate Croissant',
    price: 12,
  })
})
