// ── Business day (trading day) helpers ──────────────────────────────
// The cafes trade 9 AM → ~1 AM next day. A "business day" runs 5 AM → 5 AM
// local (Africa/Tripoli), so post-midnight sales belong to the evening's
// trading day. MUST stay in sync with the pos_sales_daily view
// (migration 20260717120000_business_day_sales.sql).
export const BUSINESS_DAY_CUTOFF_H = 5
const pad2 = n => String(n).padStart(2, '0')
export function localYmd(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
// "Today" as a business day: before 5 AM this returns yesterday's date,
// because the previous evening's trading is still the current business day.
export function businessToday() {
  return new Date(Date.now() - BUSINESS_DAY_CUTOFF_H * 3600e3)
}
// Timestamp window covering business days fromYmd..toYmd inclusive:
// [from 05:00 local → to+1day 04:59:59.999 local], as UTC ISO strings.
// Use for created_at/opened_at filters so they match the daily view's buckets.
export function businessDayWindow(fromYmd, toYmd) {
  const from = new Date(`${fromYmd}T00:00:00`)
  from.setHours(BUSINESS_DAY_CUTOFF_H, 0, 0, 0)
  const to = new Date(`${toYmd}T00:00:00`)
  to.setDate(to.getDate() + 1)
  to.setHours(BUSINESS_DAY_CUTOFF_H, 0, 0, 0)
  return { fromIso: from.toISOString(), toIso: new Date(to.getTime() - 1).toISOString() }
}
