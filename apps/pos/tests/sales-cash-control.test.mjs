import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  combineShiftControls,
  normalizeSalesControl,
  normalizeShiftControl,
  refundTenderOptions,
} from '../src/modules/pos/lib/sales-control.js'

const migrationUrl = new URL(
  '../../../supabase/migrations/20260731170000_sales_cash_control.sql',
  import.meta.url,
)
const ordersUrl = new URL('../src/modules/pos/pages/POSOrders.jsx', import.meta.url)
const sessionsUrl = new URL('../src/modules/pos/pages/POSSessions.jsx', import.meta.url)
const endOfDayUrl = new URL('../src/modules/pos/pages/POSEndOfDay.jsx', import.meta.url)
const salesUrl = new URL('../src/pages/Sales.jsx', import.meta.url)
const appUrl = new URL('../src/App.jsx', import.meta.url)

test('sales control keeps gross order tenders separate from period tender movement', () => {
  const control = normalizeSalesControl({
    order_count: '4',
    completed_sales: '100',
    linked_refunds: '10',
    net_sales: '90',
    gross_cash_tender: '30',
    gross_card_tender: '50',
    gross_presto_tender: '20',
    gross_other_tender: '0',
    period_cash_movement: '25',
    period_card_movement: '45',
    period_presto_movement: '20',
    period_other_movement: '0',
    period_refunds: '10',
    period_void_reversals: '0',
    period_net_tender_movement: '90',
    payment_reconciliation_variance: '0',
    period_event_variance: '0',
    timing_variance: '0',
    reconstructed_event_count: '0',
    untracked_order_count: '0',
    card_settlement_status: 'unavailable',
  })

  assert.equal(control.grossTenderTotal, 100)
  assert.equal(control.periodTenderTotal, 90)
  assert.equal(control.paymentStatus, 'reconciled')
  assert.equal(control.eventStatus, 'reconciled')
  assert.equal(control.dataStatus, 'complete')
  assert.equal(control.settlementStatus, 'unavailable')
})

test('closed shifts without a physical count remain missing instead of becoming zero', () => {
  const shift = normalizeShiftControl({
    status: 'closed',
    opening_cash: '100',
    expected_drawer_cash: '250',
    counted_drawer_cash: null,
    cash_counted: false,
    cash_variance: null,
    net_sales: '150',
    net_cash_tender: '150',
    net_card_tender: '0',
    net_presto_tender: '0',
    net_other_tender: '0',
    payment_reconciliation_variance: '0',
    stored_expected_variance: '0',
    stored_sales_variance: '0',
  })

  assert.equal(shift.counted_drawer_cash, null)
  assert.equal(shift.cash_variance, null)
  assert.equal(shift.closeStatus, 'missing_count')
})

test('shift totals reconcile refunds to the recorded tender instead of assuming cash', () => {
  const totals = combineShiftControls([
    {
      status: 'closed',
      cash_counted: true,
      cash_variance: '-2',
      net_sales: '90',
      order_count: '2',
      net_cash_tender: '40',
      net_card_tender: '50',
      net_presto_tender: '0',
      net_other_tender: '0',
      refunds: '10',
      void_reversals: '0',
      payment_reconciliation_variance: '0',
    },
    {
      status: 'closed',
      cash_counted: false,
      cash_variance: null,
      net_sales: '25',
      order_count: '1',
      net_cash_tender: '0',
      net_card_tender: '0',
      net_presto_tender: '25',
      net_other_tender: '0',
      refunds: '5',
      void_reversals: '0',
      payment_reconciliation_variance: '0',
    },
  ])

  assert.equal(totals.netSales, 115)
  assert.equal(totals.cash, 40)
  assert.equal(totals.card, 50)
  assert.equal(totals.presto, 25)
  assert.equal(totals.refunds, 15)
  assert.equal(totals.missingCounts, 1)
  assert.equal(totals.cashVariance, -2)
})

test('refund options keep original tender primary while permitting recorded exceptions', () => {
  assert.deepEqual(refundTenderOptions('cash'), ['original', 'card'])
  assert.deepEqual(refundTenderOptions('split'), ['original', 'cash', 'card'])
  assert.deepEqual(refundTenderOptions('presto'), ['original', 'cash', 'card', 'presto'])
})

test('migration records split legs and only cash refunds change expected drawer cash', async () => {
  const source = await readFile(migrationUrl, 'utf8')

  assert.match(source, /create table if not exists public\.pos_tender_events/)
  assert.match(source, /v_card := round\(/)
  assert.match(source, /v_cash := v_amount - v_card/)
  assert.match(source, /expected_cash = coalesce\(expected_cash, 0\) - v_cash_refund/)
  assert.doesNotMatch(source, /expected_cash = expected_cash - v_refund_total/)
  assert.match(source, /cash refund requires an open shift/)
  assert.match(source, /closed shifts are immutable/)
  assert.match(source, /cash_counted/)
  assert.match(source, /at time zone 'Africa\/Tripoli'/)
})

test('critical sales and cash-control journeys use the authoritative interfaces', async () => {
  const [orders, sessions, endOfDay, sales, app] = await Promise.all([
    readFile(ordersUrl, 'utf8'),
    readFile(sessionsUrl, 'utf8'),
    readFile(endOfDayUrl, 'utf8'),
    readFile(salesUrl, 'utf8'),
    readFile(appUrl, 'utf8'),
  ])

  assert.match(orders, /businessDayWindow\(fromDate, toDate\)/)
  assert.match(orders, /refundMethod/)
  assert.match(orders, /activeShift\?\.id \|\| null/)
  assert.doesNotMatch(orders, /excludeLateNight/)
  assert.match(sessions, /getShiftControls/)
  assert.match(sessions, /normalizeShiftControl/)
  assert.match(sessions, /<span>\{shifts\.length\}<\/span>/)
  assert.doesNotMatch(sessions, /getShiftRefundTotals/)
  assert.match(endOfDay, /getShiftControl/)
  assert.match(endOfDay, /cash_counted: !cashCloseState\.isMissing/)
  assert.match(sales, /getSalesControlSummary/)
  assert.match(sales, /Card settlement evidence is unavailable/)
  assert.match(app, /Navigate to="\/sales" replace/)
})

test('owner sales, refund, shift, and closeout controls have explicit Arabic copy', async () => {
  const [orders, sessions, endOfDay, sales] = await Promise.all([
    readFile(ordersUrl, 'utf8'),
    readFile(sessionsUrl, 'utf8'),
    readFile(endOfDayUrl, 'utf8'),
    readFile(salesUrl, 'utf8'),
  ])

  assert.match(orders, /إرجاع المبلغ عبر/)
  assert.match(sessions, /رقابة النقدية والورديات/)
  assert.match(sales, /رقابة المبيعات والمدفوعات/)
  assert.match(sales, /صف واحد في ملف CSV لكل صنف مباع/)
  assert.match(sales, /أُعيد بناء/)
  assert.match(sales, /بريستو غير المحصل/)
  assert.match(endOfDay, /useLanguage/)
})
