// escpos-transport-serial.js — Web Serial (USB) transport for ESC/POS.
// Implements the Transport contract used by escpos.js façade:
//   connect(opts) → Promise<void>      (opts.baudRate)
//   disconnect()  → Promise<void>
//   isConnected() → boolean
//   write(bytes, timeoutMs) → Promise<void>
//   label         → 'USB Serial'

const DEFAULT_BAUD = 9600
const DEFAULT_TIMEOUT_MS = 8000

let _port = null
let _writer = null
let _baudRate = DEFAULT_BAUD

export const label = 'USB Serial'

export function isAvailable() {
  return typeof navigator !== 'undefined' && 'serial' in navigator
}

export function isConnected() {
  return _port !== null && _writer !== null
}

function readPortInfo(port = _port) {
  if (!port || typeof port.getInfo !== 'function') return {}
  try {
    const info = port.getInfo() || {}
    return {
      usbVendorId: info.usbVendorId ?? null,
      usbProductId: info.usbProductId ?? null,
    }
  } catch {
    return {}
  }
}

async function attachPort(port, baudRate) {
  await port.open({ baudRate })
  if (!port.writable) {
    try { await port.close() } catch { /* noop */ }
    throw new Error('Selected USB serial device is not writable.')
  }

  const writer = port.writable.getWriter()
  _port = port
  _writer = writer
  _baudRate = baudRate
  return true
}

export async function connect({ baudRate = DEFAULT_BAUD } = {}) {
  if (!isAvailable()) {
    throw new Error('Web Serial API not available. Use HTTPS + Chrome/Edge.')
  }
  const port = await navigator.serial.requestPort()
  return attachPort(port, baudRate)
}

export async function disconnect() {
  try {
    if (_writer) {
      try { await _writer.releaseLock() } catch { /* noop */ }
      _writer = null
    }
    if (_port) {
      try { await _port.close() } catch { /* noop */ }
      _port = null
    }
  } catch { /* ignore */ }
}

// autoConnect — silently reconnect to a previously-granted serial port on
// page load without showing the port picker.  Uses getPorts() (Chrome 89+).
export async function autoConnect({ baudRate = DEFAULT_BAUD } = {}) {
  if (!isAvailable()) return false
  if (isConnected()) return true
  try {
    const ports = await navigator.serial.getPorts()
    if (!ports.length) return false
    return attachPort(ports[0], baudRate)
  } catch {
    _port = null
    _writer = null
    return false
  }
}

export function getConnectionInfo() {
  if (!_port) return null
  return {
    baudRate: _baudRate,
    ...readPortInfo(_port),
  }
}

export async function write(bytes, timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (!_writer) throw new Error('Printer not connected')
  await Promise.race([
    _writer.write(new Uint8Array(bytes)),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error('Print timed out — check USB cable / power')),
        timeoutMs
      )
    ),
  ])
}
