import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { NEW_PRODUCT_VISIBILITY } from '../src/modules/pos/lib/product-visibility.js'

const migrationUrl = new URL(
  '../../../supabase/migrations/20260724093000_new_products_default_to_pos_only.sql',
  import.meta.url,
)

test('new products default to POS only', () => {
  assert.deepEqual(NEW_PRODUCT_VISIBILITY, {
    visible_on_menu: true,
    visible_on_customer_menu: false,
    visible_on_website: false,
  })
})

test('database defaults match the POS-only application default', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /visible_on_menu set default true/)
  assert.match(sql, /visible_on_customer_menu set default false/)
  assert.match(sql, /visible_on_website set default false/)
})
