// Vestaboard API — supports both Local API (LAN) and cloud Subscription API
//
// Local API:  set VITE_VESTABOARD_HOST=vestaboard-c4208692.local
//             → sends to http://<host>:7000/local-api/message (no cloud account needed)
//
// Cloud API:  set VITE_VESTABOARD_API_KEY=<subscription-read-write-key>
//             → sends to https://rw.vestaboard.com/

const VB_HOST  = import.meta.env.VITE_VESTABOARD_HOST  || null
const VB_KEY   = import.meta.env.VITE_VESTABOARD_API_KEY || null

export async function sendVestaboard(message) {
  // ── Local LAN API ──────────────────────────────────────────────
  if (VB_HOST) {
    const url = `http://${VB_HOST}:7000/local-api/message`
    console.log('[Vestaboard] Sending via local API to', url)
    const headers = { 'Content-Type': 'application/json' }
    if (VB_KEY) headers['X-Vestaboard-Local-Api-Enable-Key'] = VB_KEY
    const resp = await fetch(url, {
      method:  'POST',
      headers,
      body: JSON.stringify({ text: message.substring(0, 132) }),
    })
    if (!resp.ok) {
      let errMsg = `Vestaboard local API error: ${resp.status}`
      try {
        const body = await resp.json()
        if (body?.message) errMsg = body.message
      } catch {}
      throw new Error(errMsg)
    }
    return { success: true }
  }

  // ── Cloud Subscription API ─────────────────────────────────────
  if (VB_KEY) {
    const resp = await fetch('https://rw.vestaboard.com/', {
      method: 'POST',
      headers: {
        'X-Vestaboard-Read-Write-Key': VB_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: message.substring(0, 132) }),
    })
    if (!resp.ok) {
      let errMsg = `Vestaboard API error: ${resp.status}`
      try {
        const body = await resp.json()
        if (body?.message) errMsg = body.message
      } catch {}
      throw new Error(errMsg)
    }
    return { success: true }
  }

  // ── No key configured — simulate ──────────────────────────────
  console.log('[Vestaboard] No host/key configured. Message (simulated):', message)
  return { success: true, simulated: true }
}

// Vestaboard character set — 6 rows × 22 columns = 132 chars
export const VB_ROWS = 6
export const VB_COLS = 22
export const VB_MAX_CHARS = VB_ROWS * VB_COLS
