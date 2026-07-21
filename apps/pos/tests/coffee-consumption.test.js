import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  COFFEE_GRAM_PRESETS,
  calculateCoffeeStockCost,
  calculateRetailCoffeeCost,
  normalizeCoffeeGrams,
} from '../src/modules/pos/lib/coffee-consumption.js'

const testDirectory = path.dirname(fileURLToPath(import.meta.url))
const migration = fs.readFileSync(
  path.resolve(testDirectory, '../../../supabase/migrations/20260721180000_coffee_bean_consumption.sql'),
  'utf8',
)

test('offers shot presets plus the V60 starting quantity', () => {
  assert.deepEqual(COFFEE_GRAM_PRESETS.map(option => option.value), [9, 18, 27, 20])
})

test('accepts positive manual grams and disables consumption for empty values', () => {
  assert.equal(normalizeCoffeeGrams('27'), 27)
  assert.equal(normalizeCoffeeGrams('20.5'), 20.5)
  assert.equal(normalizeCoffeeGrams(''), null)
  assert.equal(normalizeCoffeeGrams(0), null)
  assert.equal(normalizeCoffeeGrams(-9), null)
})

test('coffee sales consume branch bean stock and reversals restore it', () => {
  assert.match(migration, /coffee_grams_per_sale/)
  assert.match(migration, /location_product_stock/)
  assert.match(migration, /sale_consumption/)
  assert.match(migration, /refund_reversal/)
  assert.match(migration, /void_reversal/)
})

test('seeds the agreed shot standards while keeping V60 configurable', () => {
  assert.match(migration, /extra coffee shot' then 9/i)
  assert.match(migration, /like '%v60%' then 20/i)
  assert.match(migration, /else 27/)
})

test('values Ghadamis in grams without treating monthly roasting as stock', () => {
  assert.equal(calculateCoffeeStockCost(0.09347, 100_000), 9347)
  assert.equal(calculateCoffeeStockCost(0.09347, 150_000), 14020.5)
  assert.equal(calculateRetailCoffeeCost(0.09347, 250), 23.37)
  assert.match(migration, /Green\/roasted planning quantities are deliberately not loaded as stock/)
})

test('loads the seven coffee origins with base-unit cost and retail price', () => {
  for (const name of [
    'Ethiopia Guji Uraga',
    'Colombia Huila - Finca El Corozal',
    'Colombia Antioquia - Giraldo Community',
    'Costa Rica Cinnamon',
    'Brazil Mogiana Gold',
    'Ghadamis Coffee Beans',
    'Ethiopia Sidama Bensa',
  ]) assert.match(migration, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(migration, /stock_cost_per_base_unit/)
  assert.match(migration, /retail_pack_size_base_units/)
})
