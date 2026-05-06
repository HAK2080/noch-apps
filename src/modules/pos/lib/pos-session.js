// pos-session.js — small in-memory store for the PIN-verified barista
// associated with the current terminal tab. Persisted to sessionStorage
// so a refresh inside the same tab keeps the same operator without
// re-prompting; cleared on tab close.

const KEY = 'noch_pos_served_by'

let listeners = new Set()
let cached = null

function read() {
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function getServedBy() {
  if (cached) return cached
  cached = read()
  return cached
}

export function setServedBy(profile) {
  cached = profile || null
  try {
    if (profile) sessionStorage.setItem(KEY, JSON.stringify(profile))
    else sessionStorage.removeItem(KEY)
  } catch { /* ignore quota */ }
  listeners.forEach(fn => { try { fn(cached) } catch { /* listener error */ } })
}

export function clearServedBy() { setServedBy(null) }

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
