import test from 'node:test'
import assert from 'node:assert/strict'
import { closeoutDays } from '../src/modules/pos/lib/closeout-days.js'

test('unclosed 17–20 October shift defaults daily view to last trading day, not cumulative sales', () => {
  const shift = { opened_at: '2026-10-17T07:16:00Z' }
  const orders = [17, 18, 19, 20].map(day => ({ created_at: `2026-10-${day}T20:00:00Z` }))
  assert.deepEqual(closeoutDays(shift, orders, new Date('2026-10-21T04:00:00Z')), {
    openedDay: '2026-10-17', latestDay: '2026-10-20', multiDay: true,
  })
})

test('post-midnight orders stay with their Tripoli trading day regardless of device timezone', () => {
  const shift = { opened_at: '2026-10-20T08:00:00Z' }
  assert.deepEqual(closeoutDays(shift, [{ created_at: '2026-10-21T01:59:00Z' }], new Date('2026-10-21T02:00:00Z')), {
    openedDay: '2026-10-20', latestDay: '2026-10-20', multiDay: false,
  })
})

test('empty shift uses current business day and never fabricates sales', () => {
  assert.deepEqual(closeoutDays({ opened_at: '2026-10-21T08:00:00Z' }, [], new Date('2026-10-21T09:00:00Z')), {
    openedDay: '2026-10-21', latestDay: '2026-10-21', multiDay: false,
  })
})
