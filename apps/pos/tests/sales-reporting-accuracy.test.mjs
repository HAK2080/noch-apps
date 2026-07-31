import assert from 'node:assert/strict'
import test from 'node:test'
import {
  addYmdDays,
  businessDayWindow,
  businessHour,
  businessYmd,
} from '../src/modules/pos/lib/business-time.js'
import {
  combineSalesSummaries,
  maskCustomerPhone,
  summarizeDailySales,
} from '../src/pages/sales/salesReporting.js'

test('sales summary reconciles every supported payment type and refunds', () => {
  const branch = summarizeDailySales([{
    gross: 1000,
    refunds: 75,
    discounts: 50,
    orders: 20,
    cash_sales: 300,
    card_sales: 250,
    split_sales: 200,
    presto_sales: 200,
  }])

  assert.deepEqual(branch, {
    completedSales: 1000,
    refunds: 75,
    netSales: 925,
    discounts: 50,
    orders: 20,
    cash: 300,
    card: 250,
    split: 200,
    presto: 200,
    unclassified: 50,
  })

  const combined = combineSalesSummaries([
    branch,
    summarizeDailySales([{ gross: 100, refunds: 5, orders: 2, cash_sales: 100 }]),
  ])
  assert.equal(combined.completedSales, 1100)
  assert.equal(combined.refunds, 80)
  assert.equal(combined.netSales, 1020)
  assert.equal(combined.orders, 22)
  assert.equal(
    combined.cash + combined.card + combined.split + combined.presto + combined.unclassified,
    combined.completedSales,
  )
})

test('business-day boundaries are fixed to Africa/Tripoli, not the viewer device zone', () => {
  assert.equal(
    businessYmd(new Date('2026-07-31T04:59:59+02:00')),
    '2026-07-30',
  )
  assert.equal(
    businessYmd(new Date('2026-07-31T05:00:00+02:00')),
    '2026-07-31',
  )
  assert.equal(businessHour(new Date('2026-07-31T23:30:00Z')), '01')
  assert.equal(addYmdDays('2026-07-31', 1), '2026-08-01')
  assert.deepEqual(businessDayWindow('2026-07-30', '2026-07-30'), {
    fromIso: '2026-07-30T03:00:00.000Z',
    toIso: '2026-07-31T02:59:59.999Z',
  })
})

test('sales evidence minimizes customer phone exposure', () => {
  assert.equal(maskCustomerPhone('+218 91 234 5678'), '••••5678')
  assert.equal(maskCustomerPhone(''), '')
})
