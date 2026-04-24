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
}

const RECEIPT_WIDTH = 48
const PRINTER_PORT_KEY = 'noch_printer_connected'

// Module-level port reference
let _port = null
let _writer = null

function isSerialAvailable() {
  return typeof navigator !== 'undefined' && 'serial' in navigator
}

export async function connectPrinter(baudRate = 9600) {
  if (!isSerialAvailable()) {
    throw new Error('Web Serial API not available. Use HTTPS or Chrome/Edge.')
  }
  try {
    _port = await navigator.serial.requestPort()
    await _port.open({ baudRate })
    _writer = _port.writable.getWriter()
    localStorage.setItem(PRINTER_PORT_KEY, 'connected')
    return true
  } catch (err) {
    _port = null
    _writer = null
    throw err
  }
}

export async function disconnectPrinter() {
  try {
    if (_writer) {
      await _writer.releaseLock()
      _writer = null
    }
    if (_port) {
      await _port.close()
      _port = null
    }
  } catch { /* ignore */ }
  localStorage.removeItem(PRINTER_PORT_KEY)
}

export function isPrinterConnected() {
  return _port !== null && _writer !== null
}

async function writeBytes(bytes) {
  if (!_writer) throw new Error('Printer not connected')
  await _writer.write(new Uint8Array(bytes))
}

function textToBytes(text) {
  return Array.from(new TextEncoder().encode(text))
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

function centerText(text, width = RECEIPT_WIDTH) {
  const pad = Math.max(0, Math.floor((width - text.length) / 2))
  return ' '.repeat(pad) + text
}

export async function printReceipt(order, branch, items) {
  if (!isPrinterConnected()) throw new Error('Printer not connected')

  const bytes = []

  const pushCmd = (...cmds) => cmds.forEach(c => bytes.push(...c))
  const pushLine = (text = '') => bytes.push(...line(text))

  const now = new Date(order.created_at || Date.now())
  const dateStr = now.toLocaleDateString('en-GB')
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  // Init
  pushCmd(CMD.INIT)
  pushCmd(CMD.ALIGN_CENTER)
  pushCmd(CMD.BOLD_ON)
  pushLine(branch.receipt_header || branch.name)
  pushCmd(CMD.BOLD_OFF)
  pushLine()
  pushCmd(CMD.ALIGN_LEFT)
  bytes.push(...separator('='))

  pushLine(`Order: ${order.order_number}`)
  pushLine(padRight(dateStr, timeStr, RECEIPT_WIDTH))
  bytes.push(...separator('-'))

  // Items
  for (const item of items) {
    const name = item.product_name || item.name || 'Item'
    const qty = item.quantity || 1
    const price = parseFloat(item.unit_price).toFixed(2)
    const total = (parseFloat(item.unit_price) * qty).toFixed(2)
    pushLine(name.slice(0, RECEIPT_WIDTH))
    pushLine(padRight(`  ${qty} x ${price}`, total, RECEIPT_WIDTH))
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
  const method = order.payment_method?.toUpperCase() || 'CASH'
  pushLine(`Payment: ${method}`)
  if (order.payment_method === 'cash' && order.cash_tendered) {
    pushLine(padRight('Tendered:', parseFloat(order.cash_tendered).toFixed(2), RECEIPT_WIDTH))
    pushLine(padRight('Change:', parseFloat(order.change_due || 0).toFixed(2), RECEIPT_WIDTH))
  } else if (order.payment_method === 'split') {
    const cardAmt = parseFloat(order.card_amount || 0).toFixed(2)
    const cashAmt = (parseFloat(order.total) - parseFloat(order.card_amount || 0)).toFixed(2)
    pushLine(padRight('Card:', cardAmt, RECEIPT_WIDTH))
    pushLine(padRight('Cash:', cashAmt, RECEIPT_WIDTH))
  } else if (order.payment_method === 'presto') {
    pushLine(padRight('Presto Delivery:', parseFloat(order.total).toFixed(2), RECEIPT_WIDTH))
  }

  bytes.push(...separator('='))

  // Footer (Arabic greeting — may not render on all printers)
  pushCmd(CMD.ALIGN_CENTER)
  pushLine(branch.receipt_footer || 'Thank you for visiting!')
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
