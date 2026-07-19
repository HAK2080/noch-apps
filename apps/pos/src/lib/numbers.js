// Application-wide number display policy.
// Keep persistence and arithmetic numeric; use these helpers only at display seams.
export const NUMBER_LOCALE = 'en-US'

export function formatNumber(value, options = {}) {
  const number = Number(value)
  if (!Number.isFinite(number)) return options.fallback ?? '—'

  return number.toLocaleString(NUMBER_LOCALE, {
    useGrouping: true,
    ...options,
  })
}

export function formatFixed(value, fractionDigits = 2, fallback = '—') {
  return formatNumber(value, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
    fallback,
  })
}

export function formatCurrency(value, currency = 'LYD', fractionDigits = 2) {
  const formatted = formatFixed(value, fractionDigits)
  return formatted === '—' ? formatted : `${formatted} ${currency}`
}
