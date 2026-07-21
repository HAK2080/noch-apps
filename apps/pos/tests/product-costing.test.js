import assert from 'node:assert/strict'
import test from 'node:test'

import {
  calculateProductCost,
  resolveCostComponent,
  serializeCostComponents,
} from '../src/modules/pos/lib/product-costing.js'

const milk = {
  id: 'milk',
  name: 'Milk',
  stock_base_unit: 'ml',
  stock_cost_per_base_unit: 0.004,
}

test('uses automatic inventory cost before manual ingredient cost', () => {
  const result = resolveCostComponent({
    inventory_product_id: 'milk',
    quantity: 180,
    unit: 'ml',
    manual_unit_cost_lyd: 99,
  }, milk)

  assert.equal(result.source, 'automatic')
  assert.equal(result.lineCost, 0.72)
})

test('falls back to manual unit cost when inventory cost is missing', () => {
  const result = resolveCostComponent({
    inventory_product_id: 'milk',
    quantity: 2,
    unit: 'l',
    manual_unit_cost_lyd: 4.5,
  }, { ...milk, stock_cost_per_base_unit: null })

  assert.equal(result.source, 'manual')
  assert.equal(result.lineCost, 9)
})

test('combines automatic coffee and ingredient costs', () => {
  const beans = { id: 'beans', name: 'Ghadamis', stock_cost_per_base_unit: 0.09347 }
  const result = calculateProductCost({
    components: [{ inventory_product_id: 'milk', quantity: 180, unit: 'ml', manual_unit_cost_lyd: '' }],
    inventoryProducts: [milk, beans],
    coffeeGrams: 27,
    coffeeBeanProductId: 'beans',
    manualProductCost: 3.2,
  })

  assert.equal(result.source, 'automatic')
  assert.equal(result.complete, true)
  assert.equal(result.calculatedCost, 27 * 0.09347 + 0.72)
})

test('uses product manual cost only when no composition exists', () => {
  const result = calculateProductCost({
    components: [],
    inventoryProducts: [],
    coffeeGrams: '',
    coffeeBeanProductId: '',
    manualProductCost: 3.2,
  })

  assert.equal(result.source, 'manual')
  assert.equal(result.effectiveCost, 3.2)
})

test('does not silently treat missing ingredient cost as zero', () => {
  const result = calculateProductCost({
    components: [{ custom_name: 'Ice', quantity: 1, unit: 'pc', manual_unit_cost_lyd: '' }],
    inventoryProducts: [],
    manualProductCost: 3.2,
  })

  assert.equal(result.source, 'incomplete')
  assert.equal(result.effectiveCost, null)
  assert.equal(result.incompleteLines.length, 1)
})

test('serializes manual zero as a valid explicit cost', () => {
  const [component] = serializeCostComponents([{
    inventory_product_id: '',
    custom_name: 'Water',
    quantity: '1',
    unit: 'l',
    manual_unit_cost_lyd: '0',
  }])

  assert.equal(component.manual_unit_cost_lyd, 0)
  assert.equal(component.custom_name, 'Water')
})
