import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  changeProductPrimaryCategory,
  getProductCategoryIds,
  normalizeProductCategorySelection,
  productBelongsToCategory,
} from '../src/lib/product-categories.js'

const productGridUrl = new URL('../src/modules/pos/components/ProductGrid.jsx', import.meta.url)
const productManagerUrl = new URL('../src/modules/pos/pages/POSProducts.jsx', import.meta.url)
const productCatalogUrl = new URL('../src/pages/ProductCatalog.jsx', import.meta.url)
const customerMenuUrl = new URL('../src/pages/storefront/Menu.jsx', import.meta.url)
const migrationUrl = new URL('../../../supabase/migrations/20260529010000_product_secondary_categories.sql', import.meta.url)

test('category membership contains one primary plus unique additional categories', () => {
  const product = {
    category_id: 'hot-coffee',
    secondary_category_ids: ['best-sellers', 'hot-coffee', '', 'best-sellers', 'seasonal'],
  }

  assert.deepEqual(getProductCategoryIds(product), ['hot-coffee', 'best-sellers', 'seasonal'])
  assert.equal(productBelongsToCategory(product, 'hot-coffee'), true)
  assert.equal(productBelongsToCategory(product, 'best-sellers'), true)
  assert.equal(productBelongsToCategory(product, 'iced-tea'), false)
})

test('changing the main category preserves every previous category membership', () => {
  assert.deepEqual(changeProductPrimaryCategory({
    category_id: 'hot-coffee',
    secondary_category_ids: ['best-sellers', 'seasonal'],
  }, 'best-sellers'), {
    category_id: 'best-sellers',
    secondary_category_ids: ['hot-coffee', 'seasonal'],
  })

  assert.deepEqual(changeProductPrimaryCategory({
    category_id: 'hot-coffee',
    secondary_category_ids: ['best-sellers'],
  }, 'iced-coffee'), {
    category_id: 'iced-coffee',
    secondary_category_ids: ['hot-coffee', 'best-sellers'],
  })
})

test('choosing no categories clears both primary and additional membership', () => {
  assert.deepEqual(changeProductPrimaryCategory({
    category_id: 'hot-coffee',
    secondary_category_ids: ['best-sellers'],
  }, ''), {
    category_id: '',
    secondary_category_ids: [],
  })

  assert.deepEqual(normalizeProductCategorySelection('', ['best-sellers']), {
    category_id: '',
    secondary_category_ids: ['best-sellers'],
  })
})

test('POS, product management, and customer menu use the shared membership rule', async () => {
  const [grid, manager, catalog, menu, migration] = await Promise.all([
    readFile(productGridUrl, 'utf8'),
    readFile(productManagerUrl, 'utf8'),
    readFile(productCatalogUrl, 'utf8'),
    readFile(customerMenuUrl, 'utf8'),
    readFile(migrationUrl, 'utf8'),
  ])

  assert.match(grid, /productBelongsToCategory\(p, activeCategory\)/)
  assert.match(grid, /productBelongsToCategory\(product, cat\.id\)/)
  assert.match(manager, /productBelongsToCategory\(p, filterCat\)/)
  assert.match(manager, /function ProductCategoryBadges/)
  assert.match(manager, /getProductCategoryIds\(product\)/)
  assert.match(manager, /Additional category/)
  assert.match(manager, /normalizeProductCategorySelection\(\s*form\.category_id,\s*form\.secondary_category_ids/s)
  assert.match(manager, /Every selected category is used in the POS and customer menu/)
  assert.match(catalog, /changeProductPrimaryCategory/)
  assert.match(catalog, /secondary_category_ids: categorySelection\.secondary_category_ids/)
  assert.match(catalog, /productBelongsToCategory\(p, categoryFilter\)/)
  assert.match(catalog, /Every selected category is used in the POS and customer menu/)
  assert.match(menu, /products\.filter\(p => productBelongsToCategory\(p, cat\.id\)\)/)
  assert.match(migration, /secondary_category_ids uuid\[\]/)
  assert.match(migration, /using gin \(secondary_category_ids\)/)
})
