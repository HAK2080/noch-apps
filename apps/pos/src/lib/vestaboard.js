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
    const url = 'https://rw.vestaboard.com/'
    const payload = message.substring(0, 132)
    console.log('[Vestaboard] sending →', url, '| chars:', payload.length, '| preview:', payload.replace(/\n/g, '⏎'))
    let resp
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: {
          'X-Vestaboard-Read-Write-Key': VB_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: payload }),
      })
    } catch (netErr) {
      // Network-level (DNS, CORS, offline) — fetch never got a response.
      console.error('[Vestaboard] network error:', netErr)
      throw new Error(`Vestaboard network: ${netErr?.message || netErr}`)
    }
    console.log('[Vestaboard] response status:', resp.status, resp.statusText)
    if (!resp.ok) {
      let errMsg = `Vestaboard API ${resp.status}`
      try {
        const text = await resp.text()
        console.error('[Vestaboard] error body:', text)
        try {
          const body = JSON.parse(text)
          if (body?.message) errMsg = `${resp.status}: ${body.message}`
        } catch {
          if (text) errMsg = `${resp.status}: ${text.slice(0, 120)}`
        }
      } catch {}
      throw new Error(errMsg)
    }
    try {
      const body = await resp.json()
      console.log('[Vestaboard] success body:', body)
    } catch {}
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
// Character-grid mode — required for colored squares.
// The plain text API renders messages in white only and ignores color
// codes. To paint colors we have to send a 6×22 grid of numeric codes
// instead. Codes 1-26 = A-Z, 27-36 = 1-9 + 0, 37-55 = punctuation,
// 63-70 = colored squares (red, orange, yellow, green, blue, violet,
// white, black).
// ────────────────────────────────────────────────────────────────────

const COLOR = {
  RED: 63, ORANGE: 64, YELLOW: 65, GREEN: 66,
  BLUE: 67, VIOLET: 68, WHITE: 69, BLACK: 70,
}

function charToVbCode(ch) {
  if (!ch || ch === ' ') return 0
  const c = ch.toUpperCase()
  const a = c.charCodeAt(0)
  if (a >= 65 && a <= 90) return a - 64          // A-Z
  if (c >= '1' && c <= '9') return 27 + (a - 49) // 1-9
  if (c === '0') return 36
  const punct = {
    '!': 37, '@': 38, '#': 39, '$': 40, '(': 41, ')': 42, '-': 43, '+': 44,
    '&': 45, '=': 46, ';': 47, ':': 48, "'": 49, '"': 50, '%': 51, ',': 52,
    '.': 53, '/': 54, '?': 55,
  }
  return punct[c] ?? 0
}

function textToCodeRow(text, width = VB_COLS) {
  const codes = [...String(text)].map(charToVbCode)
  if (codes.length >= width) return codes.slice(0, width)
  // Centre the text within the row
  const padLeft = Math.floor((width - codes.length) / 2)
  const padRight = width - codes.length - padLeft
  return [...Array(padLeft).fill(0), ...codes, ...Array(padRight).fill(0)]
}

function alternatingRow(c1, c2, width = VB_COLS) {
  return Array.from({ length: width }, (_, i) => (i % 2 === 0 ? c1 : c2))
}

// Centre text inside a 20-cell inner window, with a single coloured
// "bookend" cell on col 0 and col 21 — looks like ❤ NAME ❤ on the board.
// Long lines that don't fit in 20 cells fall back to full-width with no
// bookends so they don't get truncated.
function textRowWithBookends(text, palette) {
  const codes = [...String(text || '')].map(charToVbCode)
  if (codes.length > VB_COLS - 2) {
    return textToCodeRow(text)   // too long — drop bookends, use full width
  }
  const innerWidth = VB_COLS - 2
  const padLeft = 1 + Math.floor((innerWidth - codes.length) / 2)
  const row = Array(VB_COLS).fill(0)
  row[0] = palette.top
  row[VB_COLS - 1] = palette.top
  for (let i = 0; i < codes.length; i++) row[padLeft + i] = codes[i]
  return row
}

// "Polka dot" row — single colour every other cell, gives a floating
// row of hearts/stars/coffee-beans look depending on palette colour.
function polkaRow(color, width = VB_COLS) {
  return Array.from({ length: width }, (_, i) => (i % 2 === 0 ? color : 0))
}

// One palette per template — picked by the same seed so the same order
// always lands on the same template + palette combo.
const PALETTES = [
  { top: COLOR.ORANGE, bot: COLOR.YELLOW },  // 0: WELL WELL WELL — warm welcome
  { top: COLOR.GREEN,  bot: COLOR.YELLOW },  // 1: GUESS WHO'S BACK — friendly
  { top: COLOR.RED,    bot: COLOR.YELLOW },  // 2: + COFFEE = TRUE LOVE — love
  { top: COLOR.BLUE,   bot: COLOR.VIOLET },  // 3: DON'T BLINK — cool/action
  { top: COLOR.VIOLET, bot: COLOR.YELLOW },  // 4: A LITTLE DANCE — party
  { top: COLOR.GREEN,  bot: COLOR.ORANGE },  // 5: TOTALLY DID — sly
]

// Build a 6×22 character grid:
//   row 0: alternating stripe top (palette.top / palette.bot)
//   rows 1-3: text lines with palette-coloured "bookends" on each end
//     so the name looks like ❤  HAITHEM  ❤ on a love palette,
//     ⭐  HAITHEM  ⭐ on a dance palette, etc.
//   row 4: polka-dot row in palette.top — floating hearts/stars between
//     the text and the bottom stripe
//   row 5: alternating stripe bottom (mirrored)
function buildColorfulFrame(lines, palette) {
  const [l1 = '', l2 = '', l3 = ''] = lines
  return [
    alternatingRow(palette.top, palette.bot),
    textRowWithBookends(l1, palette),
    textRowWithBookends(l2, palette),
    textRowWithBookends(l3, palette),
    polkaRow(palette.top),
    alternatingRow(palette.bot, palette.top),
  ]
}

// Direct character-grid send (replaces the text API for colored output).
export async function sendVestaboardCharacters(grid) {
  // Local LAN — same shape; local printers accept either text or
  // characters payload. Cloud is the common path.
  const url = VB_HOST ? `http://${VB_HOST}:7000/local-api/message` : 'https://rw.vestaboard.com/'

  // No key OR no host configured → simulate
  if (!VB_HOST && !VB_KEY) {
    console.log('[Vestaboard] No host/key configured. Grid (simulated):', grid)
    return { success: true, simulated: true }
  }

  console.log('[Vestaboard] sending characters →', url)
  const headers = { 'Content-Type': 'application/json' }
  if (VB_HOST && VB_KEY) headers['X-Vestaboard-Local-Api-Enable-Key'] = VB_KEY
  else if (VB_KEY) headers['X-Vestaboard-Read-Write-Key'] = VB_KEY

  let resp
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ characters: grid }),
    })
  } catch (netErr) {
    console.error('[Vestaboard] network error:', netErr)
    throw new Error(`Vestaboard network: ${netErr?.message || netErr}`)
  }
  console.log('[Vestaboard] response status:', resp.status, resp.statusText)
  if (!resp.ok) {
    let errMsg = `Vestaboard API ${resp.status}`
    try {
      const text = await resp.text()
      console.error('[Vestaboard] error body:', text)
      try {
        const body = JSON.parse(text)
        if (body?.message) errMsg = `${resp.status}: ${body.message}`
      } catch {
        if (text) errMsg = `${resp.status}: ${text.slice(0, 120)}`
      }
    } catch {}
    throw new Error(errMsg)
  }
  return { success: true }
}

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
// the SAME order land on the same greeting + palette. Returns the
// template's index so we can pair it with a matching colour palette.
function pickTemplateIndex(seed) {
  if (!seed) return Math.floor(Math.random() * GREETING_TEMPLATES.length)
  let h = 0
  const s = String(seed)
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h) % GREETING_TEMPLATES.length
}

// Public — fire a cheeky greeting to the board for an order.
// Non-blocking caller pattern: .catch the rejection at call site so
// POS workflow never breaks on board outages.
//
// Builds a colourful 6×22 grid (text in the middle, an alternating
// colour stripe top and bottom) and sends via the character-grid API
// so the stripes actually render in colour. The plain-text API used
// previously stripped all colour codes.
export async function sendCustomerGreeting(customerName, opts = {}) {
  const name = sanitizeName(customerName)
  if (!name) return { skipped: true, reason: 'no_name' }
  const idx = pickTemplateIndex(opts.seed)
  const tpl = GREETING_TEMPLATES[idx]
  const palette = PALETTES[idx % PALETTES.length]
  const lines = tpl(name).map(l => l.slice(0, VB_COLS))
  const grid = buildColorfulFrame(lines, palette)
  return sendVestaboardCharacters(grid)
}
