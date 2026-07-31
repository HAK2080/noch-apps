import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { reconcileExecutiveSummary } from '../src/modules/finance/lib/finance-reporting.js'
import { buildManagementReport } from '../src/modules/reports/lib/management-report-model.js'
import {
  completedExecutivePeriod,
  rollingBusinessPeriod,
} from '../src/modules/reports/lib/reporting-periods.js'

const testDirectory = fileURLToPath(new URL('.', import.meta.url))
const migrationUrl = new URL(
  '../../../supabase/migrations/20260731100000_enterprise_finance_reporting.sql',
  import.meta.url,
)

function completeSource(id, rows = []) {
  const definitions = {
    payments: ['Payment reconciliation', 'Selected report scope'],
    inventory: ['Inventory control', 'All inventory locations'],
    expenses: ['Expense details', 'Selected report scope'],
    loyalty: ['Loyalty membership', 'All branches'],
    messaging: ['WhatsApp delivery', 'All branches'],
  }
  return {
    id,
    label: definitions[id][0],
    scope: definitions[id][1],
    status: 'complete',
    rows,
    error: null,
  }
}

const period = {
  days: 7,
  from: '2026-07-24',
  to: '2026-07-30',
  previousFrom: '2026-07-17',
  previousTo: '2026-07-23',
  timeZone: 'Africa/Tripoli',
  cutoffHour: 5,
}

test('reporting periods use the Tripoli business date before the 05:00 cutoff', () => {
  const now = new Date('2026-07-31T01:30:00.000Z')

  assert.deepEqual(rollingBusinessPeriod(7, now), period)
  assert.deepEqual(completedExecutivePeriod('7d', now), {
    preset: '7d',
    from: '2026-07-20',
    to: '2026-07-26',
  })
  assert.deepEqual(completedExecutivePeriod('30d', now), {
    preset: '30d',
    from: '2026-06-01',
    to: '2026-06-30',
  })
  assert.deepEqual(completedExecutivePeriod('90d', now), {
    preset: '90d',
    from: '2026-05-01',
    to: '2026-07-29',
  })
})

test('management report exposes a reconciled operating-profit model', () => {
  const report = buildManagementReport({
    period,
    generatedAt: '2026-07-31T03:00:00.000Z',
    branches: [{ id: 'branch-1', name: 'Hay Alandlous' }],
    currentPnl: {
      revenue_net: 1000,
      refunds: 50,
      discounts: 100,
      orders: 20,
      cogs: 250,
      labor: 250,
      labor_direct: 200,
      labor_shared_allocated: 50,
      opex: 300,
      opex_direct: 250,
      opex_shared_allocated: 50,
      shared_costs_allocated: 100,
      net_contribution_before_shared: 300,
      net_contribution: 200,
      capex: 25,
      data_quality: {
        latest_sale_at: '2026-07-30T20:00:00.000Z',
        missing_product_cost_count: 0,
        unallocated_expense_count: 0,
      },
    },
    previousPnl: {
      revenue_net: 800,
      net_contribution_before_shared: 250,
      net_contribution: 180,
      shared_costs_allocated: 70,
    },
    branchPnls: [{
      branch: { id: 'branch-1', name: 'Hay Alandlous' },
      pnl: {
        revenue_net: 1000,
        refunds: 50,
        orders: 20,
        cogs: 250,
        labor: 250,
        opex: 300,
        shared_costs_allocated: 100,
        net_contribution_before_shared: 300,
        net_contribution: 200,
      },
    }],
    optionalSources: [
      completeSource('payments', [{
        order_count: 20,
        completed_sales: 1050,
        cash_collected: 400,
        card_collected: 500,
        presto_collected: 150,
        other_collected: 0,
        refunds: 50,
        net_sales: 1000,
        latest_order_at: '2026-07-30T20:00:00.000Z',
      }]),
      completeSource('inventory', [{
        ingredient_id: 'ingredient-1',
        ingredient_name: 'Milk',
        theoretical_qty: 2,
        min_threshold: 5,
        last_counted_at: '2026-07-29T10:00:00.000Z',
        count_is_stale: false,
        unit: 'L',
      }]),
      completeSource('expenses'),
      completeSource('loyalty'),
      completeSource('messaging'),
    ],
  })

  assert.equal(report.completeness.status, 'complete')
  assert.equal(report.metrics.netSales, 1000)
  assert.equal(report.metrics.completedSalesAfterDiscounts, 1050)
  assert.equal(report.metrics.averageOrder, 50)
  assert.equal(report.metrics.directOperatingProfit, 300)
  assert.equal(report.metrics.sharedOperatingCosts, 100)
  assert.equal(report.metrics.fullyLoadedOperatingProfit, 200)
  assert.equal(report.metrics.revenueChangePct, 25)
  assert.equal(report.payments.reconciliationStatus, 'reconciled')
  assert.equal(report.payments.cashCollected, 400)
  assert.equal(report.branchPerformance.reconciliation.status, 'reconciled')
  assert.equal(report.metrics.lowStockCount, 1)
  assert.equal(report.stockRisk[0].theoreticalQty, 2)
  assert.match(report.insights.map(item => item.title).join(' '), /Theoretical stock risk/)
})

test('unavailable optional sources stay unavailable instead of becoming zero', () => {
  const unavailableLoyalty = {
    id: 'loyalty',
    label: 'Loyalty membership',
    scope: 'All branches',
    status: 'unavailable',
    rows: null,
    error: 'permission denied',
  }
  const report = buildManagementReport({
    period,
    currentPnl: {
      shared_costs_allocated: 0,
      net_contribution_before_shared: 0,
      data_quality: {},
    },
    previousPnl: {
      shared_costs_allocated: 0,
      net_contribution_before_shared: 0,
    },
    optionalSources: [
      completeSource('payments'),
      completeSource('inventory'),
      completeSource('expenses'),
      unavailableLoyalty,
      completeSource('messaging'),
    ],
  })

  assert.equal(report.completeness.status, 'warning')
  assert.equal(report.metrics.loyaltyCustomers, null)
  assert.equal(report.metrics.loyaltyActive, null)
  assert.match(
    report.completeness.issues.map(issue => issue.id).join(' '),
    /loyalty_unavailable/,
  )
})

test('executive summary reconciliation identifies material branch differences', () => {
  const total = {
    revenue: 300,
    cogs: 90,
    laborTotal: 80,
    opexTotal: 70,
    sharedCosts: 30,
    net: 60,
  }
  const branches = [
    { revenue: 100, cogs: 30, laborTotal: 30, opexTotal: 20, sharedCosts: 10, net: 20 },
    { revenue: 200, cogs: 60, laborTotal: 50, opexTotal: 50, sharedCosts: 20, net: 40 },
  ]

  assert.equal(reconcileExecutiveSummary(total, branches).status, 'reconciled')

  const warning = reconcileExecutiveSummary(
    { ...total, net: 65 },
    branches,
  )
  assert.equal(warning.status, 'warning')
  assert.deepEqual(warning.material.map(row => row.id), ['fullyLoadedOperatingProfit'])
  assert.equal(warning.material[0].delta, 5)
})

test('enterprise finance migration restores shared costs and Tripoli boundaries', async () => {
  assert.ok(testDirectory.endsWith('tests\\') || testDirectory.endsWith('tests/'))
  const source = await readFile(migrationUrl, 'utf8')

  assert.match(source, /at time zone 'Africa\/Tripoli'/)
  assert.match(source, /interval '5 hours'/)
  assert.doesNotMatch(source, /created_at >= p_from::timestamptz/)
  assert.match(source, /'shared_costs_allocated'/)
  assert.match(source, /'net_contribution_before_shared'/)
  assert.match(source, /'labor_direct'/)
  assert.match(source, /'opex_direct'/)
  assert.match(source, /'missing_product_cost_count'/)
  assert.match(source, /'unallocated_expense_count'/)
  assert.match(source, /case run\.status when 'completed' then 0 else 1 end/)
  assert.match(source, /finance_payment_reconciliation/)
  assert.match(source, /when payment_method = 'split' then total - split_card_amount/)
  assert.match(source, /when payment_method = 'split' then split_card_amount/)
})
