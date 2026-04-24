/**
 * Heuristic classifier for user edits — returns matching tag list.
 * Tags: tone_fix | clarity_fix | dialect_fix | brand_mismatch
 *     | wording_simplification | humor_removal | cta_change
 */
const CTA_RE = /\b(buy|shop|visit|click|order|book|try|get|sign up|join|tap|swipe|link in bio)\b/i
const HUMOR_RE = /(😂|🤣|lol|haha|jk|joke)/i

export function classifyEdit(before = '', after = '') {
  const tags = []
  const beforeWords = before.split(/\s+/).filter(Boolean).length
  const afterWords  = after.split(/\s+/).filter(Boolean).length

  if (afterWords < beforeWords * 0.7) tags.push('wording_simplification', 'clarity_fix')
  if (HUMOR_RE.test(before) && !HUMOR_RE.test(after)) tags.push('humor_removal')
  const beforeCta = CTA_RE.test(before), afterCta = CTA_RE.test(after)
  if (beforeCta !== afterCta) tags.push('cta_change')
  // Detect tone shift via punctuation density (rough)
  const exMark = (s) => (s.match(/!/g) || []).length
  if (Math.abs(exMark(before) - exMark(after)) >= 2) tags.push('tone_fix')

  return Array.from(new Set(tags))
}
