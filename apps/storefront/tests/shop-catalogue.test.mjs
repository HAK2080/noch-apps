import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
const scope = { window: {} }
vm.runInNewContext(readFileSync(new URL('../public/shop-catalogue.js', import.meta.url), 'utf8'), scope)
const retail = scope.window.NochRetail
test('departments separate beans and espresso dosing cups from drinking cups', () => {
  for (const [name, expected] of [['Ethiopia Sidama Bensa', 'coffee'], ['Coffee Dosing Cup', 'espresso'], ['Wright Glass Cup', 'cups'], ['Cup Rinser', 'care'], ['Milk Pitcher', 'milk'], ['TIMEMORE Coffee Filter Papers', 'brewing'], ['TIMEMORE Chestnut C3 Hand Grinder', 'grinders'], ['Matcha kit', 'tea']]) assert.equal(retail.department({ name }), expected)
  assert.equal(retail.department({ name: 'Our seasonal roast', is_coffee_bean: true }), 'coffee')
})
test('facets combine price, brand, multiword SKU search and availability', () => {
  const rows = [
    { id: 'a', name: 'TIMEMORE C3 Black', sku: 'C3-001', price: 350, track_inventory: false },
    { id: 'b', name: 'TIMEMORE C3 White', price: 350, track_inventory: true, stock_qty: 0 },
    { id: 'c', name: 'MHW-3BOMBER Cup', price: 40, is_available: false },
  ]
  assert.equal(retail.filter(rows, { brand: 'TIMEMORE', search: 'black c3', min: 300, max: 400, inStock: true })[0].id, 'a')
  assert.equal(retail.filter(rows, { search: 'C3-001' }).length, 1)
  assert.equal(retail.filter(rows, { min: '', max: '' }).length, 3)
  assert.equal(retail.filter(rows, { inStock: true }).length, 1)
  assert.equal(retail.inStock({ is_sold_out: true, track_inventory: false }), false)
})
