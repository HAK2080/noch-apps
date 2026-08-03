export const STANDARD_HOURS_PER_DAY = 9
export const STANDARD_WORK_DAYS_PER_MONTH = 26
export const STANDARD_MONTHLY_HOURS = STANDARD_HOURS_PER_DAY * STANDARD_WORK_DAYS_PER_MONTH

export function overtimeRateOf(item) {
  if (item.pay_basis === 'salary') {
    const base = Number(item.base_lyd || 0)
    if (Number.isFinite(base) && base > 0) return base / STANDARD_MONTHLY_HOURS
  }
  return Number(item.source_rate_lyd || 0)
}

export function overtimeCostOf(item) {
  if (item.manual_overtime_hours === null || item.manual_overtime_hours === undefined) {
    return Number(item.overtime_lyd || 0)
  }
  const hours = item.manual_overtime_hours === '' ? 0 : Number(item.manual_overtime_hours)
  const hourlyRate = overtimeRateOf(item)
  if (!Number.isFinite(hours) || !Number.isFinite(hourlyRate)) return 0
  return Math.round(hours * hourlyRate * 1 * 100) / 100
}

// Client-side mirror of the generated net_lyd column so edits feel instant.
export function netOf(item) {
  const net = Number(item.base_lyd || 0) + overtimeCostOf(item) + Number(item.bonus_lyd || 0)
    + Number(item.other_lyd || 0) - Number(item.deduction_lyd || 0) - Number(item.loan_repayment_lyd || 0)
  return Math.round(net * 100) / 100
}
