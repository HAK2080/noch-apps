// escpos.js — ESC/POS printer driver via Web Serial API
// Target: XPrinter NP-N200L, 48 char width

const ESC = 0x1b
const GS = 0x1d
const LF = 0x0a

export const CMD = {
  INIT: [ESC, 0x40],
  ALIGN_LEFT: [ESC, 0x61, 0x00],
  ALIGN_CENTER: [ESC, 0x61, 0x01],
  ALIGN_RIGHT: [ESC, 0x61, 0x02],
  BOLD_ON: [ESC, 0x45, 0x01],
  BOLD_OFF: [ESC, 0x45, 0x00],
  DOUBLE_SIZE: [GS, 0x21, 0x11],
  NORMAL_SIZE: [GS, 0x21, 0x00],
  CUT: [GS, 0x56, 0x00],
  CASH_DRAWER: [ESC, 0x70, 0x00, 0x19, 0xfa],
  LINE_FEED: [LF],
  // Code-page selection. ESC t n. XPrinter NP-N200L supports several
  // Arabic pages; CP864 (n=22) is the most widely-supported value across
  // the NP-N200L firmware revisions in the field. If the operator has
  // already verified CP1256 (n=23) works on their unit, switch the value
  // here. The right page is the one whose glyphs match the bytes we send.
  CODEPAGE_CP437: [ESC, 0x74, 0x00],
  CODEPAGE_CP864: [ESC, 0x74, 0x16],   // Arabic
  CODEPAGE_CP1256: [ESC, 0x74, 0x17],  // Arabic Windows
}

// CP864 + CP1256 maps for the Arabic glyphs we actually use on receipts:
// the static Arabic phrase("شكراً لزيارتكم") in receipt_footer, plus
// product_name_ar values. We render via a runtime byte-encoder so the
// printer doesn't see UTF-8 multibyte sequences for Arabic chars.
//
// Strategy: encode ASCII as-is; encode Arabic by mapping Unicode codepoints
// to CP1256 byte values (single-byte). Anything outside the table falls
// back to a '?' so we don't blow up the layout. CP1256 is chosen because
// most XPrinter NP-N200L units in the field default to it and it covers
// Arabic + Latin in one page.
const CP1256_MAP = (() => {
  const m = new Map()
  // Latin/extended punctuation we care about
  for (let i = 0; i < 128; i++) m.set(i, i)
  // Arabic letters (Unicode U+0600–U+06FF range → CP1256)
  const arabic = {
    0x060C: 0xA1, 0x061B: 0xBA, 0x061F: 0xBF,
    0x0621: 0xC1, 0x0622: 0xC2, 0x0623: 0xC3, 0x0624: 0xC4, 0x0625: 0xC5,
    0x0626: 0xC6, 0x0627: 0xC7, 0x0628: 0xC8, 0x0629: 0xC9, 0x062A: 0xCA,
    0x062B: 0xCB, 0x062C: 0xCC, 0x062D: 0xCD, 0x062E: 0xCE, 0x062F: 0xCF,
    0x0630: 0xD0, 0x0631: 0xD1, 0x0632: 0xD2, 0x0633: 0xD3, 0x0634: 0xD4,
    0x0635: 0xD5, 0x0636: 0xD6, 0x0637: 0xD8, 0x0638: 0xD9, 0x0639: 0xDA,
    0x063A: 0xDB, 0x0640: 0xDC, 0x0641: 0xDD, 0x0642: 0xDE, 0x0643: 0xDF,
    0x0644: 0xE1, 0x0645: 0xE3, 0x0646: 0xE4, 0x0647: 0xE5, 0x0648: 0xE6,
    0x0649: 0xEC, 0x064A: 0xED,
    0x064B: 0xF0, 0x064C: 0xF1, 0x064D: 0xF2, 0x064E: 0xF3, 0x064F: 0xF5,
    0x0650: 0xF6, 0x0651: 0xF8, 0x0652: 0xFA,
  }
  Object.entries(arabic).forEach(([cp, b]) => m.set(parseInt(cp, 10), b))
  return m
})()

function encodeForPrinter(text) {
  const out = []
  for (const ch of String(text)) {
    const cp = ch.codePointAt(0)
    if (cp < 128) { out.push(cp); continue }
    const mapped = CP1256_MAP.get(cp)
    out.push(mapped != null ? mapped : 0x3F)
  }
  return out
}

// XPrinter XP-58IIH is a 58mm thermal printer → 32 chars per line.
// (The previous value 48 targeted an 80mm printer and would truncate
// totals and double up the separator bar on a 58mm unit.)
const RECEIPT_WIDTH = 32
const TRANSPORT_KEY = 'noch_printer_transport'

// ──────────────────────────────────────────────────────────────────
// Transport façade. Two implementations live in sibling modules and
// expose the same { isAvailable, isConnected, connect, disconnect,
// write, label } interface. The user picks one in POS Settings.
// ──────────────────────────────────────────────────────────────────
import * as serialTransport from './escpos-transport-serial'
import * as bluetoothTransport from './escpos-transport-bluetooth'

const TRANSPORTS = {
  serial: serialTransport,
  bluetooth: bluetoothTransport,
}

function readSavedTransport() {
  try {
    const v = localStorage.getItem(TRANSPORT_KEY)
    if (v === 'serial' || v === 'bluetooth') return v
  } catch { /* ignore */ }
  return null
}

function defaultTransportKind() {
  // Prefer Bluetooth on Android (production setup); fall back to serial
  // when only Web Serial is exposed (most desktops).
  if (bluetoothTransport.isAvailable()) return 'bluetooth'
  if (serialTransport.isAvailable()) return 'serial'
  return 'bluetooth'
}

let _kind = readSavedTransport() || defaultTransportKind()

export function getTransport() {
  return _kind
}

export function getTransportLabel() {
  return TRANSPORTS[_kind]?.label || _kind
}

export function isTransportAvailable(kind = _kind) {
  return TRANSPORTS[kind]?.isAvailable?.() === true
}

export function setTransport(kind) {
  if (!TRANSPORTS[kind]) throw new Error(`Unknown transport: ${kind}`)
  if (kind === _kind) return
  // Switching transports while one is connected: disconnect cleanly first.
  if (TRANSPORTS[_kind].isConnected()) {
    // Fire-and-forget; the user will tap Connect again on the new transport.
    TRANSPORTS[_kind].disconnect().catch(() => {})
  }
  _kind = kind
  try { localStorage.setItem(TRANSPORT_KEY, kind) } catch { /* ignore */ }
}

// connectPrinter signature kept for compatibility — opts.baudRate only
// applies to the serial transport. Older callers pass a number directly;
// support that for one release.
export async function connectPrinter(opts = {}) {
  const t = TRANSPORTS[_kind]
  if (!t) throw new Error('No transport selected')
  const connectOpts = typeof opts === 'number' ? { baudRate: opts } : (opts || {})
  return t.connect(connectOpts)
}

export async function disconnectPrinter() {
  const t = TRANSPORTS[_kind]
  if (!t) return
  await t.disconnect()
}

export function isPrinterConnected() {
  return TRANSPORTS[_kind]?.isConnected?.() === true
}

// autoConnectPrinter — called on page load to silently restore the printer
// connection without user interaction.  Relies on getDevices() / getPorts()
// which only return devices the browser has already been granted access to.
// Returns true if reconnected, false if nothing to reconnect (printer off,
// never connected before, or API not supported).
export async function autoConnectPrinter(opts = {}) {
  if (isPrinterConnected()) return true
  const t = TRANSPORTS[_kind]
  if (typeof t?.autoConnect !== 'function') return false
  try {
    return await t.autoConnect(opts)
  } catch {
    return false
  }
}

async function writeBytes(bytes, timeoutMs = 8000) {
  const t = TRANSPORTS[_kind]
  if (!t || !t.isConnected()) throw new Error('Printer not connected')
  await t.write(bytes, timeoutMs)
}

function textToBytes(text) {
  // Use the CP1256-aware encoder for Arabic compatibility on the
  // XPrinter NP-N200L. ASCII passes through unchanged.
  return encodeForPrinter(text)
}

function line(text = '') {
  return [...textToBytes(text), LF]
}

function padRight(left, right, width) {
  const spaces = width - left.length - right.length
  return left + ' '.repeat(Math.max(1, spaces)) + right
}

function separator(char = '-', width = RECEIPT_WIDTH) {
  return line(char.repeat(width))
}

// Strip accented Latin characters (> 0x7F but not Arabic) from the branch
// name so "Noch Café" prints as "Noch Cafe" instead of "NOCH CAF?".
// Arabic characters are left alone — they go through encodeForPrinter().
function sanitiseHeader(str) {
  return String(str || '')
    .normalize('NFD')                       // decompose é → e + combining accent
    .replace(/[̀-ͯ]/g, '')        // drop combining diacritics (accents)
    .replace(/[^\x00-\x7F؀-ۿ]/g, '') // keep ASCII + Arabic block
    .trim()
}

// Build the ESC/POS byte sequence to print a QR code (model 2).
// data: string to encode. size: module pixel size 3–6 (3 = small, 5 = medium).
function qrCodeBytes(data, size = 4) {
  const GS28k = [GS, 0x28, 0x6B]
  const dataBytes = data.split('').map(c => c.charCodeAt(0))
  const storeLen = dataBytes.length + 3          // +3 for the fn/m/k prefix
  const pL = storeLen & 0xFF
  const pH = (storeLen >> 8) & 0xFF
  return [
    // Select model 2
    ...GS28k, 4, 0, 49, 65, 50, 0,
    // Module size
    ...GS28k, 3, 0, 49, 67, size,
    // Error correction level M (49 = level M)
    ...GS28k, 3, 0, 49, 69, 49,
    // Store data
    ...GS28k, pL, pH, 49, 80, 48, ...dataBytes,
    // Print
    ...GS28k, 3, 0, 49, 81, 48,
  ]
}

export async function printReceipt(order, branch, items, loyaltyCustomer = null) {
  if (!isPrinterConnected()) throw new Error('Printer not connected')

  const bytes = []

  const pushCmd = (...cmds) => cmds.forEach(c => bytes.push(...c))
  const pushLine = (text = '') => bytes.push(...line(text))

  const now = new Date(order.created_at || Date.now())
  const dateStr = now.toLocaleDateString('en-GB')
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  // English-only receipt — thermal printers have no RTL engine so Arabic
  // characters print in logical (reversed) order and are unreadable.
  const headerText = sanitiseHeader(branch.receipt_header || branch.name) || 'Noch Cafe'
  const footerText = sanitiseHeader(branch.receipt_footer) || 'Thank you! See you soon.'

  pushCmd(CMD.INIT)
  pushCmd(CMD.CODEPAGE_CP437)   // standard ASCII page — no Arabic needed
  pushCmd(CMD.ALIGN_CENTER)
  pushCmd(CMD.BOLD_ON)
  pushLine(headerText)
  pushCmd(CMD.BOLD_OFF)
  pushLine()
  pushCmd(CMD.ALIGN_LEFT)
  bytes.push(...separator('='))

  pushLine(`Order: ${order.order_number}`)
  pushLine(padRight(dateStr, timeStr, RECEIPT_WIDTH))
  bytes.push(...separator('-'))

  // Items — English name only
  for (const item of items) {
    const name = (item.product_name || item.name || 'Item').slice(0, RECEIPT_WIDTH)
    const qty = item.quantity || 1
    const price = parseFloat(item.unit_price).toFixed(2)
    const total = (parseFloat(item.unit_price) * qty).toFixed(2)
    pushLine(name)
    pushLine(padRight(`  ${qty} x ${price}`, total, RECEIPT_WIDTH))
    if (Array.isArray(item.modifiers) && item.modifiers.length) {
      for (const m of item.modifiers) {
        const label = `   + ${m.modifier_name || ''}`.slice(0, RECEIPT_WIDTH)
        pushLine(label)
      }
    }
  }

  bytes.push(...separator('-'))

  // Totals
  const subtotal = parseFloat(order.subtotal).toFixed(2)
  const total = parseFloat(order.total).toFixed(2)
  pushLine(padRight('Subtotal:', subtotal, RECEIPT_WIDTH))

  if (parseFloat(order.discount_amount) > 0) {
    pushLine(padRight('Discount:', `-${parseFloat(order.discount_amount).toFixed(2)}`, RECEIPT_WIDTH))
  }

  pushCmd(CMD.BOLD_ON)
  pushCmd(CMD.DOUBLE_SIZE)
  pushLine(padRight('TOTAL:', total + ' LYD', RECEIPT_WIDTH - 4))
  pushCmd(CMD.NORMAL_SIZE)
  pushCmd(CMD.BOLD_OFF)

  bytes.push(...separator('='))

  // Payment info
  const methodEn = { cash: 'Cash', card: 'Card', split: 'Split', presto: 'Presto' }
  const methodLabel = methodEn[order.payment_method] || (order.payment_method?.toUpperCase() || 'CASH')
  pushLine(`Payment: ${methodLabel}`)
  if (order.payment_method === 'cash' && order.cash_tendered) {
    pushLine(padRight('Tendered:', parseFloat(order.cash_tendered).toFixed(2), RECEIPT_WIDTH))
    pushLine(padRight('Change:', parseFloat(order.change_due || 0).toFixed(2), RECEIPT_WIDTH))
  } else if (order.payment_method === 'split') {
    const cardAmt = parseFloat(order.card_amount || 0).toFixed(2)
    const cashAmt = (parseFloat(order.total) - parseFloat(order.card_amount || 0)).toFixed(2)
    pushLine(padRight('Card:', cardAmt, RECEIPT_WIDTH))
    pushLine(padRight('Cash:', cashAmt, RECEIPT_WIDTH))
  } else if (order.payment_method === 'presto') {
    pushLine(padRight('Presto delivery:', parseFloat(order.total).toFixed(2), RECEIPT_WIDTH))
  }

  bytes.push(...separator('='))

  // Loyalty awarded
  if (order.loyalty_stamps_awarded > 0) {
    pushCmd(CMD.ALIGN_CENTER)
    pushLine(`* ${order.loyalty_stamps_awarded} loyalty stamp${order.loyalty_stamps_awarded > 1 ? 's' : ''} awarded *`)
    pushCmd(CMD.ALIGN_LEFT)
  }

  // Footer
  pushCmd(CMD.ALIGN_CENTER)
  pushLine(footerText)

  // Passport QR — print only when order has a linked loyalty customer with a token
  const passportToken = loyaltyCustomer?.passport_token
  if (passportToken) {
    const passportUrl = `https://noch.cloud/passport/?t=${passportToken}`
    pushLine()
    bytes.push(...separator('-'))
    pushLine('Scan for your Nochi Pass')
    bytes.push(...qrCodeBytes(passportUrl, 4))
    pushLine()
    pushLine(`noch.cloud/passport`)
  }

  pushLine()
  pushLine()
  pushLine()

  // Cut
  pushCmd(CMD.CUT)

  await writeBytes(bytes)
}

export async function openCashDrawer() {
  if (!isPrinterConnected()) throw new Error('Printer not connected')
  await writeBytes(CMD.CASH_DRAWER)
}

export async function printTestPage() {
  if (!isPrinterConnected()) throw new Error('Printer not connected')
  const bytes = [
    ...CMD.INIT,
    ...CMD.ALIGN_CENTER,
    ...CMD.BOLD_ON,
    ...textToBytes('NOCH POS - TEST PAGE'),
    LF,
    ...CMD.BOLD_OFF,
    ...textToBytes('Printer connected OK'),
    LF,
    ...textToBytes(new Date().toLocaleString()),
    LF,
    ...textToBytes('48 chars: ' + '-'.repeat(38)),
    LF,
    LF,
    LF,
    ...CMD.CUT,
  ]
  await writeBytes(bytes)
}
