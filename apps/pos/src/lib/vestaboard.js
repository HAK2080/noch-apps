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

// ────────────────────────────────────────────────────────────────────
// Customer greeting — fires when an order is placed with a name.
// Six cheeky Nochi templates rotate randomly so regulars don't see
// the same line twice in a row. Format is plain text; Vestaboard's
// "text" API auto-lays the message into the 6×22 grid. Each template
// is hand-shaped to fit under 132 chars when name is up to ~12 chars.
//
// Vestaboard subscription content (Plus quotes/news) naturally
// resumes after a short while, so we do NOT need to clear.
// ────────────────────────────────────────────────────────────────────

// Sanitize a name for the Vestaboard charset: ASCII Latin only,
// uppercase, strip diacritics, drop unsupported chars, trim to 16.
function sanitizeName(raw) {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')          // drop accents
    .replace(/[^A-Za-z0-9 ]/g, '')            // ASCII letters/digits/spaces only
    .trim()
    .toUpperCase()
    .slice(0, 16)
}

// Center a string within a row width by padding both sides.
function pad(line, width = VB_COLS) {
  const t = (line || '').slice(0, width)
  const total = width - t.length
  const left = Math.floor(total / 2)
  const right = total - left
  return ' '.repeat(left) + t + ' '.repeat(right)
}

// Build a 6×22 frame from variable-length lines. Pads top/bottom with
// blanks so the visual centre lands roughly on row 3.
function frame(lines) {
  const padded = lines.map(l => pad(l))
  while (padded.length < VB_ROWS) {
    // Pad to 6 rows, vertically centring the existing block
    if (padded.length < VB_ROWS - (VB_ROWS - padded.length)) padded.unshift(pad(''))
    else padded.push(pad(''))
  }
  return padded.slice(0, VB_ROWS).join('\n')
}

// Each template is a fn(name) → 3-line string array. Kept to ≤ 3 visible
// lines so a long name doesn't push content off the board.
const GREETING_TEMPLATES = [
  (n) => ['WELL WELL WELL...', n, 'NOCHI APPROVES'],
  (n) => ["GUESS WHO'S BACK", n, '<3 NOCHI'],
  (n) => [`${n} + COFFEE`, '= TRUE LOVE', '- NOCHI'],
  (n) => ["DON'T BLINK", 'COFFEE INCOMING', n],
  (n) => [`${n}'S HERE -`, 'NOCHI DOES', 'A LITTLE DANCE'],
  (n) => [`OH, ${n}`, "DIDN'T SEE YOU", '(TOTALLY DID)'],
]

// Deterministic-ish pick from order_number so reprints / re-fires of
// the SAME order land on the same greeting. Falls back to Math.random.
function pickTemplate(seed) {
  if (!seed) return GREETING_TEMPLATES[Math.floor(Math.random() * GREETING_TEMPLATES.length)]
  let h = 0
  const s = String(seed)
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return GREETING_TEMPLATES[Math.abs(h) % GREETING_TEMPLATES.length]
}

// Public — fire a cheeky greeting to the board for an order.
// Non-blocking caller pattern: .catch the rejection at call site so
// POS workflow never breaks on board outages.
export async function sendCustomerGreeting(customerName, opts = {}) {
  const name = sanitizeName(customerName)
  if (!name) return { skipped: true, reason: 'no_name' }
  const tpl = pickTemplate(opts.seed)
  const lines = tpl(name).map(l => l.slice(0, VB_COLS))
  return sendVestaboard(frame(lines))
}
