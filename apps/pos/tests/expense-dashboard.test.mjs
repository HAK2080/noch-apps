import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  buildExpenseDashboard,
  getExpenseDateRange,
} from '../src/pages/expenses/lib/expenseDashboard.js'

test('preset ranges include both the first and last date of the selected period', () => {
  const now = new Date('2026-07-26T12:00:00+03:00')

  assert.deepEqual(getExpenseDateRange('month', now), {
    startDate: '2026-07-01',
    endDate: '2026-07-31',
  })
  assert.deepEqual(getExpenseDateRange('quarter', now), {
    startDate: '2026-07-01',
    endDate: '2026-09-30',
  })
  assert.deepEqual(getExpenseDateRange('year', now), {
    startDate: '2026-01-01',
    endDate: '2026-12-31',
  })
})

test('dashboard totals reconcile statuses, cost centers, and fallback currency values', () => {
  const expenses = [
    { status: 'paid', amount_lyd: 100, cost_center_id: 'CC01', expense_categories: { name: 'Food' } },
    { status: 'approved', amount_lyd: 20, cost_center_id: 'CC02', expense_categories: { name: 'Repairs' } },
    { status: 'pending', amount_lyd: 5, cost_center_id: 'CC01', expense_categories: { name: 'Food' } },
    { status: 'paid', amount: 10, exchange_rate_to_lyd: 1.5, cost_center_id: 'CC01', expense_categories: null },
    { status: 'rejected', amount_lyd: 999, cost_center_id: 'CC01', expense_categories: { name: 'Food' } },
  ]
  const costCenters = [
    { id: 'CC01', name: 'City Walk' },
    { id: 'CC02', name: 'Gallery Mall' },
  ]

  const dashboard = buildExpenseDashboard(expenses, costCenters)

  assert.deepEqual(
    {
      total: dashboard.total,
      pending: dashboard.pending,
      approved: dashboard.approved,
      paid: dashboard.paid,
    },
    { total: 140, pending: 5, approved: 20, paid: 115 },
  )
  assert.deepEqual(
    dashboard.byCostCenter.map(({ id, total, count }) => ({ id, total, count })),
    [
      { id: 'CC01', total: 120, count: 3 },
      { id: 'CC02', total: 20, count: 1 },
    ],
  )
  assert.deepEqual(
    dashboard.byCategory.map(({ name, total, count }) => ({ name, total, count })),
    [
      { name: 'Food', total: 105, count: 2 },
      { name: 'Repairs', total: 20, count: 1 },
      { name: 'Other', total: 15, count: 1 },
    ],
  )
})

test('dashboard sends both date boundaries to the expense query', async () => {
  const [dashboardSource, dataSource] = await Promise.all([
    readFile(
      new URL('../src/pages/expenses/DashboardTab.jsx', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL('../src/pages/expenses/lib/expensesData.js', import.meta.url),
      'utf8',
    ),
  ])

  assert.match(dashboardSource, /loadExpenses\(\{\s*startDate:/)
  assert.match(dashboardSource, /endDate:\s*dateRange\.endDate/)
  assert.match(dataSource, /\.gte\('expense_date', filter\.startDate\)/)
  assert.match(dataSource, /\.lte\('expense_date', filter\.endDate\)/)
})
