// escpos-transport-bluetooth.js — Web Bluetooth (GATT) transport for ESC/POS.
//
// Same contract as escpos-transport-serial.js. Designed for the typical
// thermal-printer BLE / SPP-like profile used by XPrinter, GoojPrt,
// RongTa, Zjiang and most generic Chinese receipt printers.
//
// Strategy on connect():
//   1. requestDevice() with optionalServices listing the SPP-like UUIDs
//      we know about. Show all devices so the user can pick by name.
//   2. After GATT connect, query primary services and pick the first one
//      that has a write characteristic — works whether the printer
//      advertises 18F0, FFE0, or the Microchip ISSC service.
//   3. Cache the writable characteristic; route every write() through it.
//
// Strategy on write():
//   - Chunk the buffer into small packets so cheap printer firmwares
//     don't drop bytes. ATT default MTU is 23 → 20 byte payload.
//   - Prefer writeValueWithoutResponse (faster, no ack per packet).
//     Fall back to writeValue when the characteristic doesn't support it.
//   - Sleep a few ms between chunks; some BLE-to-UART bridges have very
//     small RX buffers and will drop bytes if hammered.

const DEFAULT_TIMEOUT_MS = 8000
// Start with a larger chunk size — modern Chrome/Android BT negotiates
// MTU up to 247 bytes. If a write fails (printer firmware can't accept
// the bigger payload), we drop back to the conservative 20-byte default
// and remember it for subsequent writes in this session.
let _chunkSize = 180
const CHUNK_SIZE_FALLBACK = 20
const INTER_CHUNK_DELAY_MS = 1

// Common GATT services exposed by ESC/POS BT printers. Probed in order.
const KNOWN_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb', // generic SPP-like (XPrinter, GoojPrt)
  '0000ffe0-0000-1000-8000-00805f9b34fb', // HC-05 / HC-06 modules
  '49535343-fe7d-4ae5-8fa9-9fab0c9183eb', // Microchip ISSC BLE (older XPrinter BT)
]

let _device = null
let _server = null
let _characteristic = null
let _useWithoutResponse = true

export const label = 'Bluetooth'

export function isAvailable() {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator
}

export function isConnected() {
  return _characteristic !== null && (_server?.connected ?? false)
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function findWritableCharacteristic(server) {
  // Try each known service in order. For each, scan its characteristics
  // for one that supports write or writeWithoutResponse.
  for (const svcUuid of KNOWN_SERVICES) {
    let service
    try {
      service = await server.getPrimaryService(svcUuid)
    } catch {
      continue
    }
    let chars
    try {
      chars = await service.getCharacteristics()
    } catch {
      continue
    }
    for (const c of chars) {
      const p = c.properties || {}
      if (p.writeWithoutResponse || p.write) {
        _useWithoutResponse = !!p.writeWithoutResponse
        return c
      }
    }
  }
  // Last resort: ask server for all primary services and brute-force scan.
  try {
    const all = await server.getPrimaryServices()
    for (const svc of all) {
      const chars = await svc.getCharacteristics().catch(() => [])
      for (const c of chars) {
        const p = c.properties || {}
        if (p.writeWithoutResponse || p.write) {
          _useWithoutResponse = !!p.writeWithoutResponse
          return c
        }
      }
    }
  } catch { /* ignore */ }
  return null
}

function handleDisconnected() {
  _characteristic = null
  _server = null
  // Don't null _device — we keep it so a subsequent connect() can call
  // gatt.connect() again without re-prompting the user (Chrome only
  // remembers the device for the lifetime of the BluetoothDevice object).
}

export async function connect() {
  if (!isAvailable()) {
    throw new Error('Web Bluetooth not available. Use Chrome on Android/desktop with BT enabled.')
  }
  // If we still have a device handle from a previous session, try to
  // reconnect to it without prompting; otherwise prompt for a new one.
  if (!_device) {
    _device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: KNOWN_SERVICES,
    })
    _device.addEventListener('gattserverdisconnected', handleDisconnected)
  }

  _server = await _device.gatt.connect()
  _characteristic = await findWritableCharacteristic(_server)
  if (!_characteristic) {
    try { _server.disconnect() } catch { /* ignore */ }
    _characteristic = null
    _server = null
    throw new Error(
      'Could not find a writable characteristic on this device. ' +
      'Make sure it is an ESC/POS Bluetooth printer.'
    )
  }
  return true
}

export async function disconnect() {
  try {
    if (_server?.connected) _server.disconnect()
  } catch { /* ignore */ }
  _characteristic = null
  _server = null
  // Drop _device too on explicit disconnect so the next connect()
  // prompts again — user wanted to switch printer.
  _device = null
}

// autoConnect — silently reconnect to a previously-granted device on page
// load without showing the Bluetooth picker.  Uses getDevices() (Chrome 85+)
// which returns devices the origin has already been granted access to.
// Returns true if reconnected, false if nothing to reconnect to.
export async function autoConnect() {
  if (!isAvailable()) return false
  if (isConnected()) return true
  try {
    const devices = await navigator.bluetooth.getDevices()
    if (!devices.length) return false
    const device = devices[0]
    device.addEventListener('gattserverdisconnected', handleDisconnected)
    _device = device
    _server = await device.gatt.connect()
    _characteristic = await findWritableCharacteristic(_server)
    if (!_characteristic) {
      _server = null
      _device = null
      return false
    }
    return true
  } catch {
    // Printer may be off or out of range — fail silently
    _characteristic = null
    _server = null
    return false
  }
}

async function writeChunk(chunk) {
  // Prefer writeValue (with response) over writeValueWithoutResponse.
  // The latter can be silently buffered by Chrome's BLE stack until
  // the page receives a fresh user gesture, which causes the receipt
  // modal to sit there until staff tap anywhere in the app. writeValue
  // completes synchronously per chunk and bypasses that gating.
  const props = _characteristic.properties || {}
  if (props.write && _characteristic.writeValue) {
    await _characteristic.writeValue(chunk)
  } else if (props.writeWithoutResponse && _characteristic.writeValueWithoutResponse) {
    await _characteristic.writeValueWithoutResponse(chunk)
  } else if (_characteristic.writeValue) {
    await _characteristic.writeValue(chunk)
  } else {
    throw new Error('Characteristic supports neither write nor writeWithoutResponse')
  }
}

export async function write(bytes, timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (!isConnected()) throw new Error('Printer not connected')

  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)

  // Send the whole buffer in chunks of _chunkSize bytes. If a write
  // fails with a payload-too-large signal (common phrases: "exceeds
  // ATT", "GATT operation not permitted", "value is too long"), drop
  // _chunkSize to the conservative fallback and retry from the same
  // offset. This adapts once per session — subsequent writes use the
  // smaller size automatically.
  const sendAll = (async () => {
    let offset = 0
    while (offset < buf.length) {
      const chunk = buf.slice(offset, offset + _chunkSize)
      try {
        await writeChunk(chunk)
      } catch (err) {
        const msg = String(err?.message || err)
        const tooLarge = /exceeds|too long|ATT|GATT operation not permitted/i.test(msg)
        if (tooLarge && _chunkSize > CHUNK_SIZE_FALLBACK) {
          console.warn(`[escpos-bt] chunk ${_chunkSize} rejected, falling back to ${CHUNK_SIZE_FALLBACK}`)
          _chunkSize = CHUNK_SIZE_FALLBACK
          continue // retry from same offset with smaller chunks
        }
        throw err
      }
      offset += chunk.byteLength
      if (offset < buf.length && INTER_CHUNK_DELAY_MS > 0) {
        await sleep(INTER_CHUNK_DELAY_MS)
      }
    }
  })()

  await Promise.race([
    sendAll,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error('Print timed out — check Bluetooth printer / pairing')),
        timeoutMs
      )
    ),
  ])
}
