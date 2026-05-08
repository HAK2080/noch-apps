// thresholds.js — colour-band logic for Finance KPI cards.
// A ratio (0–1) sits inside, on the edge of, or outside the band.

export const STATUS = {
  GOOD:   'good',     // green — inside the band
  EDGE:   'edge',     // amber — within 5% of an edge (tunable)
  BAD:    'bad',      // red — outside the band
  NEUTRAL:'neutral',  // grey — no band defined
}

export function statusForRatio(ratio, min, max) {
  if (ratio == null || !Number.isFinite(ratio)) return STATUS.NEUTRAL
  if (min == null && max == null) return STATUS.NEUTRAL
  const lo = (min ?? 0) / 100
  const hi = (max ?? 100) / 100
  if (ratio < lo || ratio > hi) return STATUS.BAD
  // edge band = 10% of the band width on each side
  const margin = (hi - lo) * 0.10
  if (ratio < lo + margin || ratio > hi - margin) return STATUS.EDGE
  return STATUS.GOOD
}

export const STATUS_CLASS = {
  good:    'text-noch-green',
  edge:    'text-yellow-400',
  bad:     'text-red-400',
  neutral: 'text-noch-muted',
}

export const STATUS_BG = {
  good:    'bg-noch-green/10 border-noch-green/30',
  edge:    'bg-yellow-500/10 border-yellow-500/30',
  bad:     'bg-red-500/10 border-red-500/30',
  neutral: 'bg-noch-card border-noch-border',
}

// Format a ratio as %. ratio = 0.34 → "34%".
export function pct(ratio, dp = 1) {
  if (ratio == null || !Number.isFinite(ratio)) return '—'
  return `${(ratio * 100).toFixed(dp)}%`
}

export function lyd(amount, dp = 2) {
  const n = Number(amount)
  if (!Number.isFinite(n)) return '—'
  return `${n.toFixed(dp)} LYD`
}
