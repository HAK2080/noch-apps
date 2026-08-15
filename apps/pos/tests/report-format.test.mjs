import assert from 'node:assert/strict'
import test from 'node:test'

import { formatReportQuantity } from '../src/modules/reports/lib/report-format.js'

test('nullable report quantities remain visibly unavailable', () => {
  assert.equal(formatReportQuantity(null), 'Unavailable')
  assert.equal(formatReportQuantity(undefined, 'غير متاح'), 'غير متاح')
  assert.equal(formatReportQuantity('not-a-number'), 'Unavailable')
})

test('available report quantities use readable number formatting', () => {
  assert.equal(formatReportQuantity(1234.5), '1,234.5')
  assert.equal(formatReportQuantity(0), '0')
})
