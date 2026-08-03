export function overtimeCostOf(item) {
  if (item.manual_overtime_hours === null || item.manual_overtime_hours === undefined) {
    return Number(item.overtime_lyd || 0)
  }
  const hours = item.manual_overtime_hours === '' ? 0 : Number(item.manual_overtime_hours)
  const hourlyRate = Number(item.source_rate_lyd || 0)
  if (!Number.isFinite(hours) || !Number.isFinite(hourlyRate)) return 0
  return Math.round(hours * hourlyRate * 1 * 100) / 100
}

// Client-side mirror of the generated net_lyd column so edits feel instant.
export function netOf(item) {
  return Number(item.base_lyd || 0) + overtimeCostOf(item) + Number(item.bonus_lyd || 0)
    + Number(item.other_lyd || 0) - Number(item.deduction_lyd || 0) - Number(item.loan_repayment_lyd || 0)
}
