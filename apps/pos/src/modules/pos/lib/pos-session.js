// pos-session.js — PIN-verified barista for the current POS terminal.
//
// Storage: localStorage (was sessionStorage) so the session survives:
//   • page refreshes
//   • tab/browser close + reopen
//   • overnight tablet idle
//
// Expiry: SESSION_HOURS from the last successful PIN verification.
// After expiry the staff must re-verify.  Default = 12 hours (one shift).
//
// Grace period (fast staff-swap):
//   After a successful PIN, a 30-minute "trust window" is stored per profile.
//   If the same staff selects themselves again within that window, the
//   POSPinLogin screen can skip PIN re-entry — see checkPinGrace().

const KEY         = 'noch_pos_served_by'
const EXP_KEY     = 'noch_pos_served_by_exp'
const GRACE_KEY   = 'noch_pin_grace'

const SESSION_HOURS  = 12   // session lives for one full shift
const GRACE_MINUTES  = 30   // same-staff tap → skip PIN within this window

let listeners = new Set()
let cached = null

// ── Session ────────────────────────────────────────────────────────────────

function read() {
  try {
    const exp = localStorage.getItem(EXP_KEY)
    if (!exp || Date.now() > Number(exp)) {
      // Expired — clean up and force re-login
      localStorage.removeItem(KEY)
      localStorage.removeItem(EXP_KEY)
      return null
    }
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function getServedBy() {
  if (cached !== undefined && cached !== null) return cached
  cached = read()
  return cached
}

export function setServedBy(profile) {
  cached = profile || null
  try {
    if (profile) {
      localStorage.setItem(KEY, JSON.stringify(profile))
      localStorage.setItem(EXP_KEY, String(Date.now() + SESSION_HOURS * 3600 * 1000))
    } else {
      localStorage.removeItem(KEY)
      localStorage.removeItem(EXP_KEY)
    }
  } catch { /* ignore quota errors */ }
  listeners.forEach(fn => { try { fn(cached) } catch { /* listener error */ } })
}

export function clearServedBy() { setServedBy(null) }

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// ── Grace period (fast staff-swap) ─────────────────────────────────────────
// Call setPinGrace(profileId) after a successful PIN verification.
// Call checkPinGrace(profileId) before showing the PIN keypad — if true,
// the caller can skip PIN entry and call setServedBy() + onSuccess() directly.

export function setPinGrace(profileId) {
  try {
    localStorage.setItem(GRACE_KEY, JSON.stringify({
      profileId,
      until: Date.now() + GRACE_MINUTES * 60 * 1000,
    }))
  } catch { /* ignore */ }
}

export function checkPinGrace(profileId) {
  try {
    const raw = localStorage.getItem(GRACE_KEY)
    if (!raw) return false
    const { profileId: gId, until } = JSON.parse(raw)
    return gId === profileId && Date.now() < until
  } catch {
    return false
  }
}

export function clearPinGrace() {
  try { localStorage.removeItem(GRACE_KEY) } catch { /* ignore */ }
}
