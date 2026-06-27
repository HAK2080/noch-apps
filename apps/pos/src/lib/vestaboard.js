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
export const VB_MIN_SEND_INTERVAL_SECONDS = 15
export const VESTABOARD_OPERATING_HOURS = {
  regular: { open: '09:00', close: '00:00' },
  friday: { open: '16:00', close: '00:30' },
}

function minutesFromTime(time) {
  const [hours, minutes] = String(time).split(':').map(Number)
  return (hours * 60) + minutes
}

function formatHoursRange(hours) {
  return `${hours.open}-${hours.close}`
}

export function getVestaboardOperatingStatus(now = new Date()) {
  const day = now.getDay()
  const minutes = (now.getHours() * 60) + now.getMinutes()
  const regularOpen = minutesFromTime(VESTABOARD_OPERATING_HOURS.regular.open)
  const fridayOpen = minutesFromTime(VESTABOARD_OPERATING_HOURS.friday.open)
  const fridayCloseNextDay = minutesFromTime(VESTABOARD_OPERATING_HOURS.friday.close)

  const isFridayWindow = day === 5 && minutes >= fridayOpen
  const isFridayLateWindow = day === 6 && minutes < fridayCloseNextDay
  const isRegularWindow = day !== 5 && minutes >= regularOpen

  const isOpen = isFridayWindow || isFridayLateWindow || isRegularWindow
  const todayHours = day === 5
    ? VESTABOARD_OPERATING_HOURS.friday
    : VESTABOARD_OPERATING_HOURS.regular

  return {
    isOpen,
    label: isOpen ? 'Open' : 'Closed',
    todayLabel: day === 5 ? 'Friday 16:00-00:30' : 'Daily 09:00-00:00',
    summary: `Daily ${formatHoursRange(VESTABOARD_OPERATING_HOURS.regular)}, Friday ${formatHoursRange(VESTABOARD_OPERATING_HOURS.friday)}`,
    open: todayHours.open,
    close: todayHours.close,
  }
}

export function getVestaboardConfigStatus() {
  return {
    provider: VB_HOST ? 'local' : (VB_KEY ? 'cloud' : 'simulation'),
    hasHost: Boolean(VB_HOST),
    hasKey: Boolean(VB_KEY),
    host: VB_HOST || '',
    endpoint: VB_HOST ? `http://${VB_HOST}:7000/local-api/message` : 'https://rw.vestaboard.com/',
    modeLabel: VB_HOST ? 'Local API' : (VB_KEY ? 'Cloud Read/Write API' : 'Simulation'),
  }
}

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
  { top: COLOR.ORANGE, bot: COLOR.YELLOW },  // 0: ATTENTION EVERYONE
  { top: COLOR.BLUE,   bot: COLOR.VIOLET },  // 1: LOOK WHO DECIDED
  { top: COLOR.RED,    bot: COLOR.YELLOW },  // 2: NOCHI SPOTTED
  { top: COLOR.GREEN,  bot: COLOR.YELLOW },  // 3: FEELS LIKE
  { top: COLOR.YELLOW, bot: COLOR.RED    },  // 4: QUICK HIDE THE CAKES
  { top: COLOR.VIOLET, bot: COLOR.YELLOW },  // 5: JUST ARRIVED / NOCHI HIDING
  { top: COLOR.ORANGE, bot: COLOR.RED    },  // 6: IS HERE / CAKES GONE
  { top: COLOR.GREEN,  bot: COLOR.BLUE   },  // 7: BREAKING NEWS
  { top: COLOR.YELLOW, bot: COLOR.VIOLET },  // 8: WALKED IN LIKE DESTINY
  { top: COLOR.VIOLET, bot: COLOR.GREEN  },  // 9: NOCHI WHISPERED
  { top: COLOR.ORANGE, bot: COLOR.YELLOW },  // 10: WELL WELL WELL
  { top: COLOR.GREEN,  bot: COLOR.ORANGE },  // 11: OH, X — DIDN'T SEE YOU
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
  // 0 — ATTENTION EVERYONE
  (n) => ['ATTENTION EVERYONE', `${n} IS HERE`, 'ACT BUSY NOW!'],
  // 1 — LOOK WHO DECIDED
  (n) => ['LOOK WHO DECIDED', 'TO SHOW UP', n],
  // 2 — NOCHI SPOTTED
  (n) => ['NOCHI SPOTTED', n, 'AND GOT EXCITED'],
  // 3 — FEELS LIKE
  (n) => ['FEELS LIKE', `${n} DAY`, 'FOR SOME REASON'],
  // 4 — QUICK HIDE THE CAKES
  (n) => ['QUICK HIDE THE CAKES!', n, 'IS HERE'],
  // 5 — JUST ARRIVED / NOCHI HIDING
  (n) => [n, 'JUST ARRIVED', 'NOCHI IS HIDING'],
  // 6 — IS HERE / CAKES GONE
  (n) => [n, 'IS HERE', 'THE CAKES ARE GONE'],
  // 7 — BREAKING NEWS
  (n) => ['BREAKING NEWS', n, 'RETURNED AGAIN'],
  // 8 — WALKED IN LIKE DESTINY
  (n) => [n, 'WALKED IN LIKE', 'THIS WAS DESTINY'],
  // 9 — NOCHI WHISPERED
  (n) => ['NOCHI WHISPERED', '"OH NO..." IT\'S', n],
  // 10 — WELL WELL WELL
  (n) => ['WELL WELL WELL', n, 'IS HERE'],
  // 11 — OH, X — DIDN'T SEE YOU
  (n) => [`OH, ${n}`, "DIDN'T SEE YOU", '(TOTALLY DID)'],
]

export const VESTABOARD_AUTOMATIONS = [
  {
    id: 'order_greeting',
    title: 'Order greeting',
    audience: 'In-store customers',
    trigger: 'Completed POS order with customer name',
    cadence: 'Every named order',
    goal: 'Make the guest feel noticed while their drink is being prepared.',
    status: 'live',
  },
  {
    id: 'pickup_ready',
    title: 'Pickup ready',
    audience: 'Waiting customers',
    trigger: 'Kitchen/bar marks order ready',
    cadence: 'Per ready order',
    goal: 'Reduce counter questions and make pickup feel theatrical.',
    status: 'planned',
  },
  {
    id: 'loyalty_milestone',
    title: 'Loyalty milestone',
    audience: 'Regulars',
    trigger: 'Stamp, reward, birthday, leaderboard, or badge event',
    cadence: 'High-signal events only',
    goal: 'Turn loyalty into a public celebration without exposing private data.',
    status: 'ready',
  },
  {
    id: 'campaign_drop',
    title: 'Campaign drop',
    audience: 'Walk-ins and social viewers',
    trigger: 'Approved marketing campaign or limited menu item',
    cadence: 'Time-boxed service windows',
    goal: 'Make the board sell the current offer while staff stay focused.',
    status: 'ready',
  },
  {
    id: 'social_proof',
    title: 'Social proof',
    audience: 'Guests deciding what to order',
    trigger: 'Review, UGC post, or best-seller threshold',
    cadence: 'Rotated, not spammed',
    goal: 'Surface reviews, fan posts, and best sellers at the point of purchase.',
    status: 'ready',
  },
  {
    id: 'ops_signal',
    title: 'Ops signal',
    audience: 'Staff',
    trigger: 'Low stock, shift note, or rush mode',
    cadence: 'Owner/staff controlled',
    goal: 'Use the board as a lightweight back-of-house signal when needed.',
    status: 'ready',
  },
  {
    id: 'world_cup_score',
    title: 'World Cup score',
    audience: 'Football fans',
    trigger: 'Manual now; live feed once a sports API is connected',
    cadence: 'Only during open hours and active matches',
    goal: 'Give guests a reason to look up, talk, and stay for another drink.',
    status: 'ready',
  },
  {
    id: 'news_flash',
    title: 'News flash',
    audience: 'Guests in line',
    trigger: 'Manual now; live feed once a curated news source is connected',
    cadence: 'Low frequency, high signal',
    goal: 'Make waiting feel current without turning the board into noise.',
    status: 'ready',
  },
  {
    id: 'joke_break',
    title: 'Joke break',
    audience: 'Everyone',
    trigger: 'Staff quick-send or scheduled quiet moments',
    cadence: 'Occasional',
    goal: 'Add personality during slower moments and make the board worth watching.',
    status: 'ready',
  },
  {
    id: 'quote_break',
    title: 'Deep quote',
    audience: 'Guests pausing between conversations',
    trigger: 'Automatic rotation during quieter windows',
    cadence: 'Occasional',
    goal: 'Make the board feel thoughtful, memorable, and worth photographing.',
    status: 'ready',
  },
]

const MARKETING_TEMPLATES = {
  campaign_drop: {
    label: 'Campaign drop',
    palette: { top: COLOR.ORANGE, bot: COLOR.YELLOW },
    lines: ({ headline = 'TODAY ONLY', detail = 'ASK FOR THE DROP', cta = 'LIMITED BATCH' } = {}) => [
      headline,
      detail,
      cta,
    ],
  },
  pickup_ready: {
    label: 'Pickup ready',
    palette: { top: COLOR.GREEN, bot: COLOR.BLUE },
    lines: ({ name = 'GUEST', order = 'ORDER' } = {}) => [
      sanitizeName(name) || 'GUEST',
      `${String(order).toUpperCase()} READY`,
      'COME CLAIM IT',
    ],
  },
  loyalty_milestone: {
    label: 'Loyalty milestone',
    palette: { top: COLOR.VIOLET, bot: COLOR.YELLOW },
    lines: ({ name = 'REGULAR', detail = 'UNLOCKED A REWARD' } = {}) => [
      sanitizeName(name) || 'REGULAR',
      detail,
      'NOCHI APPROVES',
    ],
  },
  social_proof: {
    label: 'Social proof',
    palette: { top: COLOR.BLUE, bot: COLOR.WHITE },
    lines: ({ headline = 'FAN FAVORITE', detail = 'MOST ORDERED TODAY', cta = 'TRY IT NEXT' } = {}) => [
      headline,
      detail,
      cta,
    ],
  },
  ops_signal: {
    label: 'Ops signal',
    palette: { top: COLOR.RED, bot: COLOR.ORANGE },
    lines: ({ headline = 'STAFF NOTE', detail = 'LOW STOCK CHECK', cta = 'TELL LEAD' } = {}) => [
      headline,
      detail,
      cta,
    ],
  },
  world_cup_score: {
    label: 'World Cup score',
    palette: { top: COLOR.GREEN, bot: COLOR.WHITE },
    lines: ({ match = 'WORLD CUP', score = 'LIVE SCORE', status = 'ASK STAFF' } = {}) => [
      match,
      score,
      status,
    ],
  },
  news_flash: {
    label: 'News flash',
    palette: { top: COLOR.BLUE, bot: COLOR.WHITE },
    lines: ({ headline = 'NEWS FLASH', detail = 'CHECK THE COUNTER', source = 'NOCH UPDATE' } = {}) => [
      headline,
      detail,
      source,
    ],
  },
  joke_break: {
    label: 'Joke break',
    palette: { top: COLOR.YELLOW, bot: COLOR.VIOLET },
    lines: ({ setup = 'WHY DID COFFEE', punchline = 'FILE A POLICE REPORT?', cta = 'IT GOT MUGGED' } = {}) => [
      setup,
      punchline,
      cta,
    ],
  },
  quote_break: {
    label: 'Deep quote',
    palette: { top: COLOR.VIOLET, bot: COLOR.BLUE },
    lines: ({ author = 'MARCUS AURELIUS', quote = 'THE MOMENT IS YOURS', cta = 'USE IT WELL' } = {}) => [
      author,
      quote,
      cta,
    ],
  },
}

export const VESTABOARD_JOKE_LIBRARY = [
  { setup: 'WHY DID COFFEE', punchline: 'FILE A REPORT?', cta: 'IT GOT MUGGED' },
  { setup: 'ESPRESSO YOURSELF', punchline: 'BUT PLEASE', cta: 'ORDER FIRST' },
  { setup: 'DECAF EXISTS', punchline: 'FOR PEOPLE WHO', cta: 'ENJOY RISK' },
  { setup: 'NOCHI SAYS', punchline: 'ONE MORE DRINK', cta: 'IS RESEARCH' },
  { setup: 'MATCHA LATTE', punchline: 'IS JUST GREEN', cta: 'CONFIDENCE' },
]

export function getRandomVestaboardJoke(seed = Date.now()) {
  const idx = pickTemplateIndex(seed) % VESTABOARD_JOKE_LIBRARY.length
  return VESTABOARD_JOKE_LIBRARY[idx]
}

export const VESTABOARD_QUOTE_LIBRARY = [
  { author: 'SENECA', quote: 'LUCK FAVORS', cta: 'THE PREPARED MIND' },
  { author: 'MAYA ANGELOU', quote: 'COURAGE MAKES', cta: 'EVERYTHING POSSIBLE' },
  { author: 'RUMI', quote: 'WHAT YOU SEEK', cta: 'IS SEEKING YOU' },
  { author: 'SOCRATES', quote: 'KNOW THYSELF', cta: 'BEGIN THERE' },
  { author: 'JAMES BALDWIN', quote: 'NOT EVERYTHING FACED', cta: 'CAN BE CHANGED' },
  { author: 'MARY OLIVER', quote: 'PAY ATTENTION', cta: 'BE ASTONISHED' },
  { author: 'CONFUCIUS', quote: 'WHEREVER YOU GO', cta: 'GO WITH ALL HEART' },
  { author: 'MARCUS AURELIUS', quote: 'MEET THE MOMENT', cta: 'WITHOUT COMPLAINT' },
]

export function getRandomVestaboardQuote(seed = Date.now()) {
  const idx = pickTemplateIndex(seed) % VESTABOARD_QUOTE_LIBRARY.length
  return VESTABOARD_QUOTE_LIBRARY[idx]
}

function sanitizeBoardLine(line) {
  return String(line || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 !@#$()+\-&=;:'"%.,/?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .slice(0, VB_COLS)
}

export function buildVestaboardAutomationGrid(templateId, context = {}) {
  const template = MARKETING_TEMPLATES[templateId] || MARKETING_TEMPLATES.campaign_drop
  const lines = template.lines(context).map(sanitizeBoardLine)
  return buildColorfulFrame(lines, template.palette)
}

export function previewVestaboardAutomationText(templateId, context = {}) {
  const grid = buildVestaboardAutomationGrid(templateId, context)
  return grid.map(row => row.map(code => {
    if (code === 0 || code >= 63) return ' '
    if (code >= 1 && code <= 26) return String.fromCharCode(64 + code)
    if (code >= 27 && code <= 35) return String(code - 26)
    if (code === 36) return '0'
    return {
      37: '!', 38: '@', 39: '#', 40: '$', 41: '(', 42: ')', 43: '-',
      44: '+', 45: '&', 46: '=', 47: ';', 48: ':', 49: "'", 50: '"',
      51: '%', 52: ',', 53: '.', 54: '/', 55: '?',
    }[code] || ' '
  }).join('')).join('\n').trimEnd()
}

export async function sendVestaboardAutomation(templateId, context = {}, options = {}) {
  if (options.respectOperatingHours !== false) {
    const status = getVestaboardOperatingStatus()
    if (!status.isOpen) return { skipped: true, reason: 'outside_operating_hours', status }
  }
  const grid = buildVestaboardAutomationGrid(templateId, context)
  return sendVestaboardCharacters(grid)
}

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

// Refresh timer — re-sends the same greeting after 30s so the
// Vestaboard subscription content can't overwrite within the
// first 60 seconds after an order is placed. Cleared and replaced
// every time a new greeting fires, so the latest customer wins.
let _greetingRefreshTimerId = null

// Public — fire a cheeky greeting to the board for an order.
// Non-blocking caller pattern: .catch the rejection at call site so
// POS workflow never breaks on board outages.
//
// Builds a colourful 6×22 grid (text in the middle, an alternating
// colour stripe top and bottom) and sends via the character-grid API
// so the stripes actually render in colour. The plain-text API used
// previously stripped all colour codes.
export async function sendCustomerGreeting(customerName, opts = {}) {
  if (opts.respectOperatingHours !== false) {
    const status = getVestaboardOperatingStatus()
    if (!status.isOpen) return { skipped: true, reason: 'outside_operating_hours', status }
  }
  const name = sanitizeName(customerName)
  if (!name) return { skipped: true, reason: 'no_name' }
  const idx = pickTemplateIndex(opts.seed)
  const tpl = GREETING_TEMPLATES[idx]
  const palette = PALETTES[idx % PALETTES.length]
  const lines = tpl(name).map(l => l.slice(0, VB_COLS))
  const grid = buildColorfulFrame(lines, palette)

  const result = await sendVestaboardCharacters(grid)

  // 60-second hold: cancel any previous refresh, schedule a single
  // re-send at T+30s. Combined with the board's ~30s flap-flip
  // animation this keeps the greeting visible for ~60s before the
  // Vestaboard subscription content takes over again.
  if (_greetingRefreshTimerId) clearTimeout(_greetingRefreshTimerId)
  _greetingRefreshTimerId = setTimeout(() => {
    sendVestaboardCharacters(grid).catch(err =>
      console.warn('[Vestaboard] refresh failed:', err?.message))
    _greetingRefreshTimerId = null
  }, 30000)

  return result
}
