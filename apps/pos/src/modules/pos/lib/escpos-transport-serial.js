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

export const label = 'USB Serial'

export function isAvailable() {
  return typeof navigator !== 'undefined' && 'serial' in navigator
}

export function isConnected() {
  return _port !== null && _writer !== null
}

export async function connect({ baudRate = DEFAULT_BAUD } = {}) {
  if (!isAvailable()) {
    throw new Error('Web Serial API not available. Use HTTPS + Chrome/Edge.')
  }
  _port = await navigator.serial.requestPort()
  await _port.open({ baudRate })
  _writer = _port.writable.getWriter()
  return true
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
