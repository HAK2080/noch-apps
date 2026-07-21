import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

import { getProductLongPressAction } from '../src/modules/pos/lib/product-long-press.js'

test('long press restores sold-out products and opens stock for available products', () => {
  assert.equal(getProductLongPressAction({ is_sold_out: true }), 'restore_availability')
  assert.equal(getProductLongPressAction({ is_sold_out: false }), 'open_stock')
  assert.equal(getProductLongPressAction({}), 'open_stock')
})

test('POS terminal uses the reversible product long-press handler', () => {
  const source = fs.readFileSync(
    new URL('../src/modules/pos/pages/POSTerminal.jsx', import.meta.url),
    'utf8',
  )

  assert.match(source, /onLongPress=\{handleProductLongPress\}/)
})
