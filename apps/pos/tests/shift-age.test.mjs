import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { shiftNeedsReview } from '../src/modules/pos/lib/shift-age.js'

const openedAt = '2026-09-24T07:06:33.892Z'

test('shift review warning begins at 18 hours, not during a normal shift', () => {
  const opened = Date.parse(openedAt)
  assert.equal(shiftNeedsReview(openedAt, opened + 17 * 60 * 60 * 1000), false)
  assert.equal(shiftNeedsReview(openedAt, opened + 18 * 60 * 60 * 1000), true)
  assert.equal(shiftNeedsReview(openedAt, opened + 24 * 60 * 60 * 1000), true)
  assert.equal(shiftNeedsReview('invalid', opened), false)
})

test('POS branch tile displays the opening date and an Arabic reconciliation warning', async () => {
  const source = await readFile(new URL('../src/modules/pos/pages/POSHome.jsx', import.meta.url), 'utf8')
  assert.match(source, /shiftNeedsReview\(shift\.opened_at\)/)
  assert.match(source, /day: '2-digit', month: 'short'/)
  assert.match(source, /أقفلها وطابق المبيعات/)
})
