// Startup must always end, even when Supabase does not answer.
//
// index.html runs a watchdog before the app loads: an unhandled promise
// rejection, or nothing rendered within ten seconds, replaces the page with
// the "Noch could not open" recovery screen. An auth bootstrap that rejects
// or hangs therefore does not just delay the app, it takes it down — the staff
// never reach the login form they could have used.
//
// Eight seconds is deliberately inside the watchdog's ten, so a slow network
// resolves into a usable login screen instead of the recovery screen.
export const AUTH_BOOTSTRAP_TIMEOUT_MS = 8000

export class AuthBootstrapTimeout extends Error {
  constructor(ms) {
    super(`auth-bootstrap-timeout after ${ms}ms`)
    this.name = 'AuthBootstrapTimeout'
  }
}

/**
 * Resolve with the promise, or reject with AuthBootstrapTimeout once ms passes.
 * The timer is always cleared, so a settled bootstrap never holds the event
 * loop open on a café tablet.
 */
export function withAuthBootstrapTimeout(promise, ms = AUTH_BOOTSTRAP_TIMEOUT_MS) {
  let timer
  const expiry = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new AuthBootstrapTimeout(ms)), ms)
  })
  return Promise.race([promise, expiry]).finally(() => clearTimeout(timer))
}
