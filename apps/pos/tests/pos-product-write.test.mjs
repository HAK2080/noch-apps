import test from 'node:test'
import assert from 'node:assert/strict'
import { toPOSProductWrite } from '../src/modules/pos/lib/pos-product-write.js'

test('product writes exclude joined and location-derived read metadata', () => {
  const write = toPOSProductWrite({
    id: 'product-1',
    name: 'Chocolate Croissant',
    price: 12,
    category_id: 'pastries',
    secondary_category_ids: ['best-sellers', 'breakfast'],
    pos_categories: { name: 'Pastries' },
    pos_branches: { name: 'Main' },
    stock_location_id: 'location-1',
    stock_updated_at: '2026-08-02T09:00:00.000Z',
    stock_source: 'location_product_stock',
    created_at: '2026-07-01T09:00:00.000Z',
    updated_at: '2026-08-02T09:00:00.000Z',
  })

  assert.deepEqual(write, {
    name: 'Chocolate Croissant',
    price: 12,
    category_id: 'pastries',
    secondary_category_ids: ['best-sellers', 'breakfast'],
  })
})
