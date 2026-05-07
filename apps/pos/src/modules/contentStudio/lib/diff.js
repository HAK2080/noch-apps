/**
 * Tiny line-level diff for capturing user edits.
 * Returns { added, removed, unchanged_count } — enough to display + classify.
 * Not for git-quality diffs; sufficient for short social copy.
 */
export function lineDiff(before = '', after = '') {
  const a = before.split(/\r?\n/)
  const b = after.split(/\r?\n/)
  const aSet = new Set(a)
  const bSet = new Set(b)
  const added = b.filter(line => !aSet.has(line))
  const removed = a.filter(line => !bSet.has(line))
  const unchanged_count = a.length - removed.length
  return { added, removed, unchanged_count, before_len: before.length, after_len: after.length }
}
