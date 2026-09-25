const REVIEW_AFTER_HOURS = 18

export function shiftNeedsReview(openedAt, now = Date.now()) {
  const opened = Date.parse(openedAt || '')
  return Number.isFinite(opened)
    && Number.isFinite(now)
    && now - opened >= REVIEW_AFTER_HOURS * 60 * 60 * 1000
}
