import { addYmdDays, businessYmd } from '../../pos/lib/business-time.js'

const SUPPORTED_EXECUTIVE_PRESETS = new Set(['7d', '30d', '90d'])

function positiveInteger(value, fallback) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function ymdDayOfWeek(value) {
  return new Date(`${value}T00:00:00Z`).getUTCDay()
}

function previousMonthRange(currentBusinessDate) {
  const currentMonthStart = `${currentBusinessDate.slice(0, 7)}-01`
  const to = addYmdDays(currentMonthStart, -1)
  return {
    from: `${to.slice(0, 7)}-01`,
    to,
  }
}

export function rollingBusinessPeriod(days = 7, now = new Date()) {
  const periodDays = positiveInteger(days, 7)
  const to = businessYmd(now)
  const from = addYmdDays(to, -(periodDays - 1))
  const previousTo = addYmdDays(from, -1)
  const previousFrom = addYmdDays(previousTo, -(periodDays - 1))

  return {
    days: periodDays,
    from,
    to,
    previousFrom,
    previousTo,
    timeZone: 'Africa/Tripoli',
    cutoffHour: 5,
  }
}

export function completedExecutivePeriod(preset = '7d', now = new Date()) {
  const selectedPreset = SUPPORTED_EXECUTIVE_PRESETS.has(preset) ? preset : '7d'
  const currentBusinessDate = businessYmd(now)

  if (selectedPreset === '30d') {
    return { preset: selectedPreset, ...previousMonthRange(currentBusinessDate) }
  }

  const completedTo = addYmdDays(currentBusinessDate, -1)
  if (selectedPreset === '90d') {
    return {
      preset: selectedPreset,
      from: addYmdDays(completedTo, -89),
      to: completedTo,
    }
  }

  const daysSinceSunday = ymdDayOfWeek(currentBusinessDate) || 7
  const to = addYmdDays(currentBusinessDate, -daysSinceSunday)
  return {
    preset: selectedPreset,
    from: addYmdDays(to, -6),
    to,
  }
}
