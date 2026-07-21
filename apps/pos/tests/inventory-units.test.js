import assert from 'node:assert/strict'
import test from 'node:test'

import {
  convertDisplayedQuantity,
  formatStockQuantity,
  fromBaseQuantity,
  getCompatibleStockUnits,
  getStockBaseUnit,
  toBaseQuantity,
} from '../src/modules/pos/lib/inventory-units.js'

test('converts weight and volume receipts into stable base units', () => {
  assert.equal(toBaseQuantity(3, 'kg'), 3000)
  assert.equal(toBaseQuantity(2.5, 'l'), 2500)
  assert.equal(toBaseQuantity(24, 'pc'), 24)
})

test('converts base stock back to the preferred display unit', () => {
  assert.equal(fromBaseQuantity(3000, 'kg'), 3)
  assert.equal(convertDisplayedQuantity(3000, 'g', 'kg'), 3)
  assert.equal(formatStockQuantity(3000, 'kg'), '3 kg')
  assert.equal(formatStockQuantity(1500, 'l'), '1.5 L')
})

test('only offers units compatible with the configured stock dimension', () => {
  assert.equal(getStockBaseUnit('kg'), 'g')
  assert.deepEqual(getCompatibleStockUnits('g').map(unit => unit.value), ['g', 'kg'])
  assert.deepEqual(getCompatibleStockUnits('ml').map(unit => unit.value), ['ml', 'l'])
  assert.deepEqual(getCompatibleStockUnits('pc').map(unit => unit.value), ['pc'])
})
