import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildInventoryControlReport,
  inventoryControlExportRows,
} from '../src/pages/inventory/lib/inventoryIntelligence.js'

test('inventory control statuses are based on evidence, not invented runout days', () => {
  const report = buildInventoryControlReport([
    {
      ingredient_id: 'out',
      ingredient_name: 'Coffee',
      counted_qty: 10,
      consumed_since_count: 12,
      theoretical_qty: 0,
      min_threshold: 5,
      count_is_stale: false,
      recipe_usage_status: 'available',
    },
    {
      ingredient_id: 'below',
      ingredient_name: 'Milk',
      counted_qty: 20,
      consumed_since_count: 12,
      theoretical_qty: 8,
      min_threshold: 10,
      count_is_stale: true,
      recipe_usage_status: 'available',
    },
    {
      ingredient_id: 'near',
      ingredient_name: 'Matcha',
      counted_qty: 20,
      consumed_since_count: 6,
      theoretical_qty: 14,
      min_threshold: 10,
      count_is_stale: false,
      recipe_usage_status: 'available',
    },
    {
      ingredient_id: 'healthy',
      ingredient_name: 'Sugar',
      counted_qty: 30,
      consumed_since_count: 5,
      theoretical_qty: 25,
      min_threshold: 10,
      count_is_stale: false,
      recipe_usage_status: 'available',
    },
    {
      ingredient_id: 'unconfigured',
      ingredient_name: 'Napkins',
      counted_qty: 30,
      consumed_since_count: 0,
      theoretical_qty: 30,
      min_threshold: 0,
      count_is_stale: true,
      recipe_usage_status: 'available',
    },
  ])

  assert.equal(report.total, 5)
  assert.deepEqual(report.statusCounts, {
    out: 1,
    below_minimum: 1,
    near_minimum: 1,
    unconfigured: 1,
    healthy: 1,
  })
  assert.equal(report.configuredCount, 4)
  assert.equal(report.thresholdCoveragePct, 80)
  assert.equal(report.healthyConfiguredPct, 25)
  assert.equal(report.staleCount, 2)
  assert.deepEqual(
    report.rows.map(row => row.ingredientId),
    ['out', 'below', 'near', 'unconfigured', 'healthy'],
  )
})

test('inventory control report sanitizes malformed quantities and reconciles export rows', () => {
  const report = buildInventoryControlReport([
    {
      ingredient_id: 'one',
      ingredient_name: 'Cups',
      counted_qty: 'bad',
      consumed_since_count: -4,
      theoretical_qty: null,
      min_threshold: -1,
      count_is_stale: null,
      recipe_usage_status: 'available',
    },
  ])

  const [row] = report.rows
  assert.equal(row.countedQty, 0)
  assert.equal(row.consumedSinceCount, 0)
  assert.equal(row.theoreticalQty, 0)
  assert.equal(row.minThreshold, 0)
  assert.equal(row.status, 'out')
  assert.equal(row.countIsStale, true)
  assert.equal(inventoryControlExportRows(report.rows).length, report.total)
})

test('missing recipes remain visibly unavailable and never invent consumption', () => {
  const report = buildInventoryControlReport([
    {
      ingredient_id: 'milk',
      ingredient_name: 'Milk',
      counted_qty: 25,
      consumed_since_count: 9000,
      theoretical_qty: -8975,
      min_threshold: 10,
      count_is_stale: true,
      recipe_usage_status: 'unavailable',
      recipe_count: 0,
      location_count: 0,
    },
  ])

  const [row] = report.rows
  assert.equal(row.recipeUsageAvailable, false)
  assert.equal(row.consumedSinceCount, null)
  assert.equal(row.theoreticalQty, null)
  assert.equal(row.decisionQty, 25)
  assert.equal(row.status, 'healthy')
  assert.equal(report.recipeUsageUnavailableCount, 1)
  assert.equal(report.missingLocationCount, 1)
  assert.equal(inventoryControlExportRows(report.rows)[0][3], '')
})

test('location reconciliation variance is counted without changing the physical balance', () => {
  const report = buildInventoryControlReport([
    {
      ingredient_id: 'cups',
      ingredient_name: 'Cups',
      counted_qty: 100,
      min_threshold: 20,
      count_is_stale: false,
      recipe_usage_status: 'unavailable',
      location_count: 2,
      location_qty: 95,
      location_variance: -5,
    },
  ])

  assert.equal(report.locationVarianceCount, 1)
  assert.equal(report.rows[0].countedQty, 100)
  assert.equal(report.rows[0].locationQty, 95)
})
