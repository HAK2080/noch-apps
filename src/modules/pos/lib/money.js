// money.js — single source of truth for POS money rounding.
//
// Policy (decided 2026-05-06): 2 decimal places everywhere. Libyan dinar
// pricing is rounded to 0.01 LYD for both display and persistence.
// Callers should pass any value through `round` before arithmetic and
// `format` for display/printing.

export const DP = 2

export function round(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return 0
  // Half-away-from-zero rounding to DP places. Avoids the float-edge
  // 0.005 → 0.00 issue that plain Math.round on `v * 100 / 100` produces.
  const factor = 10 ** DP
  return Math.sign(v) * Math.round(Math.abs(v) * factor + Number.EPSILON) / factor
}

export function format(n) {
  return round(n).toFixed(DP)
}

export function formatLYD(n) {
  return `${format(n)} LYD`
}

// Sum a list of numbers with a single rounding step at the end.
export function sum(arr) {
  return round(arr.reduce((s, v) => s + Number(v || 0), 0))
}

// Multiply price × qty. Both are floats; result is rounded to DP.
export function lineTotal(price, qty) {
  return round(Number(price) * Number(qty))
}
