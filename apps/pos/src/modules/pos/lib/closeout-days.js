import { businessYmd } from './business-time.js'

// A shift is a cash reconciliation period, not necessarily a trading day.
// Keep its ledger intact; use a separate authoritative daily report.
export function closeoutDays(shift, orders = [], now = new Date()) {
  const today = businessYmd(now)
  const dates = orders.map(order => businessYmd(order.created_at)).sort()
  const openedDay = businessYmd(shift.opened_at)
  const latestDay = dates.at(-1) || today
  return { openedDay, latestDay, multiDay: openedDay !== today || dates.some(day => day !== openedDay) }
}
