// Kiosk-mode flag.
//
// When the device opens /kiosk, we set a sessionStorage flag so the rest of
// the POS flow (POSHome, POSTerminal back button) can render in chromeless
// kiosk style — no app sidebar, no escape hatch back to the dashboard.
//
// sessionStorage scope is per-tab, which matches "this is a kiosk session"
// well: closing the tab clears it; the PWA shortcut always opens /kiosk
// fresh and re-sets the flag.

const KEY = 'pos-kiosk-mode'

export function enableKioskMode() {
  try { sessionStorage.setItem(KEY, '1') } catch { /* private mode etc. */ }
}

export function isKioskMode() {
  try { return sessionStorage.getItem(KEY) === '1' } catch { return false }
}

export function disableKioskMode() {
  try { sessionStorage.removeItem(KEY) } catch { /* */ }
}
