export const STANDARD_HOURS_PER_DAY = 9
export const STANDARD_WORK_DAYS_PER_MONTH = 26
export const STANDARD_MONTHLY_HOURS = STANDARD_HOURS_PER_DAY * STANDARD_WORK_DAYS_PER_MONTH

// Owner policy: overtime is paid at the plain hourly rate, with no premium.
export const OVERTIME_MULTIPLIER = 1

function num(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * The hourly rate to price a manual overtime edit at.
 *
 * The run stores the rate it actually used, so an edit re-prices exactly as the
 * run did. Older rows have no stored rate, so they fall back to the previous
 * derivation. Hourly staff resolve to 0: their attendance pay already covers
 * every hour worked, and a x1 premium adds nothing on top.
 */
export function overtimeRateOf(item) {
  if (item.overtime_rate_lyd !== null && item.overtime_rate_lyd !== undefined) {
    return num(item.overtime_rate_lyd)
  }
  if (item.pay_basis === 'hourly') return 0
  if (item.pay_basis === 'salary') {
    const base = num(item.base_lyd)
    if (base > 0) return base / STANDARD_MONTHLY_HOURS
  }
  return num(item.source_rate_lyd)
}

/** Hours worked beyond the standard day across the days actually attended. */
export function derivedOvertimeHoursOf(item) {
  const standard = item.standard_hours !== null && item.standard_hours !== undefined
    ? num(item.standard_hours)
    : num(item.worked_days) * STANDARD_HOURS_PER_DAY
  return Math.max(0, Math.round((num(item.source_hours) - standard) * 100) / 100)
}

export function overtimeCostOf(item) {
  if (item.manual_overtime_hours === null || item.manual_overtime_hours === undefined) {
    return num(item.overtime_lyd)
  }
  const hours = item.manual_overtime_hours === '' ? 0 : Number(item.manual_overtime_hours)
  const hourlyRate = overtimeRateOf(item)
  if (!Number.isFinite(hours) || !Number.isFinite(hourlyRate)) return 0
  return Math.round(hours * hourlyRate * OVERTIME_MULTIPLIER * 100) / 100
}

/**
 * What the employee was scheduled to work but did not, and what it cost them.
 * Absence is only meaningful where a published schedule exists to measure it
 * against; with no schedule the run deducts nothing and flags the gap instead.
 */
export function absenceOf(item) {
  const scheduledDays = num(item.scheduled_days)
  return {
    measurable: scheduledDays > 0,
    scheduledDays,
    workedDays: num(item.worked_days),
    absenceDays: num(item.absence_days),
    deduction: num(item.absence_deduction_lyd),
  }
}

// Client-side mirror of the generated net_lyd column so edits feel instant.
// absence_deduction_lyd is NOT subtracted here: it is already reflected in
// base_lyd and is carried separately only so the editor can show the reason.
export function netOf(item) {
  const net = num(item.base_lyd) + overtimeCostOf(item) + num(item.bonus_lyd)
    + num(item.other_lyd) - num(item.deduction_lyd) - num(item.loan_repayment_lyd)
  return Math.round(net * 100) / 100
}
