// Vestaboard API stub — wire the real API key when supplied
const VESTABOARD_API_KEY = import.meta.env.VITE_VESTABOARD_API_KEY || null

export async function sendVestaboard(message) {
  if (!VESTABOARD_API_KEY) {
    console.log('[Vestaboard] API key not configured. Message:', message)
    return { success: true, simulated: true }
  }
  // Real API call — Vestaboard Subscription API
  const resp = await fetch('https://rw.vestaboard.com/', {
    method: 'POST',
    headers: {
      'X-Vestaboard-Read-Write-Key': VESTABOARD_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: message.substring(0, 132) }),
  })
  if (!resp.ok) throw new Error('Vestaboard API error: ' + resp.status)
  return { success: true }
}

// Vestaboard character set — 6 rows × 22 columns = 132 chars
export const VB_ROWS = 6
export const VB_COLS = 22
export const VB_MAX_CHARS = VB_ROWS * VB_COLS
