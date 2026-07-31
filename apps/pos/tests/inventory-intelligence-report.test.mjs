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
    },
    {
      ingredient_id: 'below',
      ingredient_name: 'Milk',
      counted_qty: 20,
      consumed_since_count: 12,
      theoretical_qty: 8,
      min_threshold: 10,
      count_is_stale: true,
    },
    {
      ingredient_id: 'near',
      ingredient_name: 'Matcha',
      counted_qty: 20,
      consumed_since_count: 6,
      theoretical_qty: 14,
      min_threshold: 10,
      count_is_stale: false,
    },
    {
      ingredient_id: 'healthy',
      ingredient_name: 'Sugar',
      counted_qty: 30,
      consumed_since_count: 5,
      theoretical_qty: 25,
      min_threshold: 10,
      count_is_stale: false,
    },
    {
      ingredient_id: 'unconfigured',
      ingredient_name: 'Napkins',
      counted_qty: 30,
      consumed_since_count: 0,
      theoretical_qty: 30,
      min_threshold: 0,
      count_is_stale: true,
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
