export function formatReportQuantity(value, unavailableLabel = 'Unavailable') {
  if (value == null || value === '') return unavailableLabel

  const numericValue = Number(value)
  return Number.isFinite(numericValue)
    ? numericValue.toLocaleString('en-GB')
    : unavailableLabel
}
