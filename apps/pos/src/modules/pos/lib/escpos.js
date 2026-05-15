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

// ──────────────────────────────────────────────────────────────────
// Bitmap (raster) rendering — for Arabic receipts.
// ESC/POS thermal printers have no RTL/shaping engine, so Arabic text
// mode prints letters in logical order (visually reversed) and without
// contextual letter forms. The fix: render the receipt with HTML5
// Canvas (which DOES handle Arabic correctly via the browser's native
// text engine), then send the resulting monochrome image to the printer
// using GS v 0 raster-bitmap command.
//
// Printer width: 58mm at 203 DPI ≈ 384 dots. We render the canvas at
// that width, threshold to 1-bit black/white, and ship.
// ──────────────────────────────────────────────────────────────────

const PRINT_WIDTH_PX = 384  // 58mm @ 203 DPI effective area

// Convert RGBA canvas image data to ESC/POS GS v 0 raster bitmap bytes.
// Each output byte encodes 8 horizontal pixels, MSB first; 1 = black.
function imageDataToRasterBytes(imgData, width, height) {
  const bytesPerRow = Math.ceil(width / 8)
  const out = []
  // Header: GS v 0 m xL xH yL yH  (m=0 normal mode)
  out.push(GS, 0x76, 0x30, 0,
           bytesPerRow & 0xFF, (bytesPerRow >> 8) & 0xFF,
           height & 0xFF, (height >> 8) & 0xFF)
  const data = imgData.data
  for (let y = 0; y < height; y++) {
    for (let xByte = 0; xByte < bytesPerRow; xByte++) {
      let byte = 0
      for (let b = 0; b < 8; b++) {
        const x = xByte * 8 + b
        if (x >= width) continue
        const i = (y * width + x) * 4
        const lum = (data[i] + data[i + 1] + data[i + 2]) / 3
        // Pixel dark enough → set bit (= black ink)
        if (lum < 128) byte |= (1 << (7 - b))
      }
      out.push(byte)
    }
  }
  return out
}

// Build a canvas, run a render callback that draws content and returns
// the final Y position, then convert the trimmed image to ESC/POS bytes.
function renderToRaster(renderFn) {
  const canvas = document.createElement('canvas')
  canvas.width = PRINT_WIDTH_PX
  canvas.height = 2400  // tall enough for any receipt; we'll trim
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#000000'
  ctx.textBaseline = 'top'
  // Use Arabic-capable system fonts (Segoe UI / Noto Sans Arabic / etc.)
  // — these handle BiDi + contextual shaping automatically when
  // ctx.direction = 'rtl'.
  ctx.imageSmoothingEnabled = false

  const finalY = renderFn(ctx, PRINT_WIDTH_PX) || 0
  // Round up to nearest 8 pixels — printer rasters in 8-pixel rows.
  const height = Math.max(8, Math.ceil((finalY + 8) / 8) * 8)
  const img = ctx.getImageData(0, 0, PRINT_WIDTH_PX, height)
  return imageDataToRasterBytes(img, PRINT_WIDTH_PX, height)
}

// Drawing helpers used by both receipt and drink-ticket renderers.
const FONT_AR = `'Segoe UI', 'Noto Sans Arabic', 'Tahoma', sans-serif`
const FONT_EN = `'Segoe UI', 'Tahoma', sans-serif`

// Draw a dashed/dotted horizontal separator across the page.
function drawDashedLine(ctx, y, width, dash = 4, gap = 3) {
  ctx.beginPath()
  ctx.setLineDash([dash, gap])
  ctx.lineWidth = 1.5
  ctx.moveTo(8, y)
  ctx.lineTo(width - 8, y)
  ctx.strokeStyle = '#000'
  ctx.stroke()
  ctx.setLineDash([])
}

// Centered title line (English by default — keeps numerics readable).
function drawCenter(ctx, text, y, fontSize = 18, bold = false, font = FONT_EN) {
  ctx.font = `${bold ? 'bold ' : ''}${fontSize}px ${font}`
  ctx.direction = 'ltr'
  ctx.textAlign = 'center'
  ctx.fillText(String(text), PRINT_WIDTH_PX / 2, y)
}

// One row with an Arabic label on the right and a value (number / Latin)
// on the left. Returns the next y.
function drawArabicRow(ctx, label, value, y, fontSize = 18, bold = false) {
  ctx.font = `${bold ? 'bold ' : ''}${fontSize}px ${FONT_AR}`
  ctx.direction = 'rtl'
  ctx.textAlign = 'right'
  ctx.fillText(String(label), PRINT_WIDTH_PX - 10, y)
  ctx.direction = 'ltr'
  ctx.textAlign = 'left'
  ctx.fillText(String(value), 10, y)
  return y + fontSize + 6
}

// A right-aligned Arabic line (no value column).
function drawArabicLine(ctx, text, y, fontSize = 18, bold = false) {
  ctx.font = `${bold ? 'bold ' : ''}${fontSize}px ${FONT_AR}`
  ctx.direction = 'rtl'
  ctx.textAlign = 'right'
  ctx.fillText(String(text), PRINT_WIDTH_PX - 10, y)
  return y + fontSize + 4
}

// A centered Arabic line (used for footers).
function drawArabicCenter(ctx, text, y, fontSize = 18, bold = false) {
  ctx.font = `${bold ? 'bold ' : ''}${fontSize}px ${FONT_AR}`
  ctx.direction = 'rtl'
  ctx.textAlign = 'center'
  ctx.fillText(String(text), PRINT_WIDTH_PX / 2, y)
  return y + fontSize + 4
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

// ──────────────────────────────────────────────────────────────────
// Customer receipt — rendered as bitmap image so Arabic text shapes
// and reads right-to-left correctly. Layout:
//
//   [Branch name — bold, centered]
//   ============================================
//   Order: NHA-…                    13/05 22:28
//   --------------------------------------------
//   اسم المنتج (Arabic, RTL)              28.00
//      ×1 × 28.00
//      + شوفان
//   --------------------------------------------
//   المجموع الفرعي:                       66.00
//   الإجمالي:                       66.00 LYD
//   ============================================
//   طريقة الدفع: نقداً
//   المبلغ المدفوع:                       66.00
//   الباقي:                                0.00
//   ============================================
//   [Footer Arabic, centered]
//   [Passport QR if loyalty customer]
// ──────────────────────────────────────────────────────────────────
export async function printReceipt(order, branch, items, loyaltyCustomer = null) {
  if (!isPrinterConnected()) throw new Error('Printer not connected')

  const now = new Date(order.created_at || Date.now())
  const dateStr = now.toLocaleDateString('en-GB')
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const headerText = branch?.receipt_header || branch?.name || 'Noch Cafe'
  const footerArDefault = 'شكراً لزيارتكم — نوتشي يستناك المرة الجاية'
  const footerText = branch?.receipt_footer || footerArDefault

  const rasterBytes = renderToRaster((ctx, w) => {
    let y = 10

    // Branch name — English / Latin, bold, centered, double-line for emphasis
    drawCenter(ctx, headerText, y, 22, true, FONT_EN)
    y += 30
    drawDashedLine(ctx, y, w)
    y += 10

    // Order # and date — Arabic label, value left
    y = drawArabicRow(ctx, `الطلب:`, order.order_number, y, 16, false)
    y = drawArabicRow(ctx, `التاريخ:`, `${dateStr}  ${timeStr}`, y, 16, false)

    drawDashedLine(ctx, y, w)
    y += 10

    // Items — Arabic name right, qty×price + line total left
    for (const item of items) {
      const nameAr = item.product_name_ar || item.product_name || 'منتج'
      const qty = item.quantity || 1
      const price = parseFloat(item.unit_price).toFixed(2)
      const lineTotal = (parseFloat(item.unit_price) * qty).toFixed(2)

      y = drawArabicRow(ctx, nameAr, lineTotal, y, 18, true)
      y = drawArabicLine(ctx, `${qty} × ${price}`, y, 14, false)

      if (Array.isArray(item.modifiers) && item.modifiers.length) {
        for (const m of item.modifiers) {
          const arMod = m.modifier_name_ar || m.modifier_name || ''
          y = drawArabicLine(ctx, `+ ${arMod}`, y, 14, false)
        }
      }
      if (item.notes) {
        y = drawArabicLine(ctx, `* ${item.notes}`, y, 14, false)
      }
      y += 4
    }

    drawDashedLine(ctx, y, w)
    y += 10

    // Totals
    const subtotal = parseFloat(order.subtotal).toFixed(2)
    const total = parseFloat(order.total).toFixed(2)
    y = drawArabicRow(ctx, 'المجموع الفرعي:', subtotal, y, 16)
    if (parseFloat(order.discount_amount) > 0) {
      y = drawArabicRow(ctx, 'خصم:', `-${parseFloat(order.discount_amount).toFixed(2)}`, y, 16)
    }
    y += 4
    y = drawArabicRow(ctx, 'الإجمالي:', `${total} LYD`, y, 26, true)
    y += 4
    drawDashedLine(ctx, y, w)
    y += 10

    // Payment info
    const methodAr = { cash: 'نقداً', card: 'بطاقة', split: 'مختلط', presto: 'بريستو' }
    const methodLabel = methodAr[order.payment_method] || (order.payment_method?.toUpperCase() || 'CASH')
    y = drawArabicRow(ctx, 'طريقة الدفع:', methodLabel, y, 16)
    if (order.payment_method === 'cash' && order.cash_tendered) {
      y = drawArabicRow(ctx, 'المبلغ المدفوع:', parseFloat(order.cash_tendered).toFixed(2), y, 16)
      y = drawArabicRow(ctx, 'الباقي:', parseFloat(order.change_due || 0).toFixed(2), y, 16)
    } else if (order.payment_method === 'split') {
      const cardAmt = parseFloat(order.card_amount || 0).toFixed(2)
      const cashAmt = (parseFloat(order.total) - parseFloat(order.card_amount || 0)).toFixed(2)
      y = drawArabicRow(ctx, 'بطاقة:', cardAmt, y, 16)
      y = drawArabicRow(ctx, 'نقداً:', cashAmt, y, 16)
    } else if (order.payment_method === 'presto') {
      y = drawArabicRow(ctx, 'توصيل بريستو:', parseFloat(order.total).toFixed(2), y, 16)
    }
    y += 4
    drawDashedLine(ctx, y, w)
    y += 10

    // Loyalty stamps
    if (order.loyalty_stamps_awarded > 0) {
      const stamps = order.loyalty_stamps_awarded
      y = drawArabicCenter(ctx, `★ تم منح ${stamps} طابع ولاء ★`, y, 16, true)
      y += 4
    }

    // Footer
    y = drawArabicCenter(ctx, footerText, y, 16, false)
    y += 8

    return y
  })

  const bytes = [
    ...CMD.INIT,
    ...CMD.ALIGN_CENTER,
    ...rasterBytes,
  ]

  // Passport QR — printed in standard ESC/POS QR mode (it's not Arabic
  // and works in text mode fine).
  const passportToken = loyaltyCustomer?.passport_token
  if (passportToken) {
    const passportUrl = `https://noch.cloud/passport/?t=${passportToken}`
    bytes.push(LF)
    bytes.push(...textToBytes('Scan for your Nochi Pass'))
    bytes.push(LF)
    bytes.push(...qrCodeBytes(passportUrl, 4))
    bytes.push(LF)
    bytes.push(...textToBytes('noch.cloud/passport'))
    bytes.push(LF)
  }

  bytes.push(LF, LF, LF)
  bytes.push(...CMD.CUT)

  await writeBytes(bytes)
}

// ──────────────────────────────────────────────────────────────────
// Drink ticket — bar-facing slip rendered as bitmap so Arabic product
// names + modifiers shape and read RTL correctly. Designed for fast
// bar reading: huge order #, huge customer name, drinks stacked with
// modifiers indented underneath.
// ──────────────────────────────────────────────────────────────────
export async function printDrinkTicket(order, items, branch, opts = {}) {
  if (!isPrinterConnected()) throw new Error('Printer not connected')

  const now = new Date(order.created_at || Date.now())
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const headerText = branch?.receipt_header || branch?.name || 'Noch Cafe'

  // Extract trailing digits so "#0042" reads clearly even if order # is
  // "NHA-20260515-0042". Falls back to full order_number.
  const orderNumStr = String(order.order_number || '')
  const shortNum = (orderNumStr.match(/(\d+)\s*$/) || [, orderNumStr])[1] || orderNumStr

  const customerName = (order.customer_name || '').trim() || 'بدون اسم'
  const paymentMethod = (order.payment_method || '').toUpperCase()

  const rasterBytes = renderToRaster((ctx, w) => {
    let y = 10

    // Branch (English, small, centered)
    drawCenter(ctx, headerText, y, 16, false, FONT_EN)
    y += 24

    // ORDER NUMBER — huge, bold, centered, English so digits are crisp
    ctx.font = `bold 72px ${FONT_EN}`
    ctx.direction = 'ltr'
    ctx.textAlign = 'center'
    ctx.fillText(`#${shortNum}`, w / 2, y)
    y += 80

    // Customer name — huge, bold, centered (auto Arabic-shaped if Arabic
    // characters, otherwise just rendered as Latin)
    const hasArabic = /[؀-ۿ]/.test(customerName)
    ctx.font = `bold 44px ${hasArabic ? FONT_AR : FONT_EN}`
    ctx.direction = hasArabic ? 'rtl' : 'ltr'
    ctx.textAlign = 'center'
    ctx.fillText(hasArabic ? customerName : customerName.toUpperCase(), w / 2, y)
    y += 60

    // Meta — time + payment + table
    const meta = [timeStr, paymentMethod, order.table_number ? `T${order.table_number}` : null]
      .filter(Boolean).join(' · ')
    drawCenter(ctx, meta, y, 14, false, FONT_EN)
    y += 22

    drawDashedLine(ctx, y, w)
    y += 10

    // Items — Arabic name (right-aligned, bold), modifiers indented
    for (const item of items) {
      const nameAr = item.product_name_ar || item.product_name || 'منتج'
      const qty = item.quantity || 1
      y = drawArabicLine(ctx, `${qty}× ${nameAr}`, y, 24, true)

      if (Array.isArray(item.modifiers) && item.modifiers.length) {
        for (const m of item.modifiers) {
          const arMod = m.modifier_name_ar || m.modifier_name || ''
          y = drawArabicLine(ctx, `+ ${arMod}`, y, 18, false)
        }
      }
      if (item.notes) {
        y = drawArabicLine(ctx, `* ${item.notes}`, y, 16, false)
      }
      y += 10
    }

    drawDashedLine(ctx, y, w)
    y += 8
    y = drawArabicCenter(ctx, '— تذكرة المشروب —', y, 14, false)
    return y
  })

  const bytes = [
    ...CMD.INIT,
    ...CMD.ALIGN_CENTER,
    ...rasterBytes,
    LF, LF, LF,
    ...CMD.CUT,
  ]

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
