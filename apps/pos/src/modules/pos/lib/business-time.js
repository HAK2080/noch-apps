export const BUSINESS_DAY_CUTOFF_H = 5
export const BUSINESS_TIME_ZONE = 'Africa/Tripoli'

const pad2 = value => String(value).padStart(2, '0')

function ymdInBusinessTimeZone(value) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value)
  const part = type => parts.find(item => item.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function addYmdDays(ymd, days) {
  const [year, month, day] = String(ymd).slice(0, 10).split('-').map(Number)
  const result = new Date(Date.UTC(year, month - 1, day + Number(days || 0)))
  return `${result.getUTCFullYear()}-${pad2(result.getUTCMonth() + 1)}-${pad2(result.getUTCDate())}`
}

export function businessYmd(value = new Date()) {
  const instant = value instanceof Date ? value : new Date(value)
  return ymdInBusinessTimeZone(
    new Date(instant.getTime() - BUSINESS_DAY_CUTOFF_H * 3600e3),
  )
}

export function businessHour(value) {
  const instant = value instanceof Date ? value : new Date(value)
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS_TIME_ZONE,
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(instant)
}

function zonedBusinessCutoffUtc(ymd) {
  const [year, month, day] = String(ymd).slice(0, 10).split('-').map(Number)
  const wallClockAsUtc = Date.UTC(year, month - 1, day, BUSINESS_DAY_CUTOFF_H)
  let result = wallClockAsUtc

  // Convert a Tripoli wall-clock time to its UTC instant. Two passes cover
  // offset changes without depending on the viewer's device time zone.
  for (let pass = 0; pass < 2; pass += 1) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: BUSINESS_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(result))
    const part = type => Number(parts.find(item => item.type === type)?.value)
    const representedWallClock = Date.UTC(
      part('year'),
      part('month') - 1,
      part('day'),
      part('hour'),
      part('minute'),
      part('second'),
    )
    result -= representedWallClock - wallClockAsUtc
  }

  return new Date(result)
}

export function businessDayWindow(fromYmd, toYmd) {
  const from = zonedBusinessCutoffUtc(fromYmd)
  const toExclusive = zonedBusinessCutoffUtc(addYmdDays(toYmd, 1))
  return {
    fromIso: from.toISOString(),
    toIso: new Date(toExclusive.getTime() - 1).toISOString(),
  }
}
