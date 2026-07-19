// escpos-transport-windows-agent.js — raw ESC/POS through the local Noch
// Print Agent. The agent writes to the Windows printer spooler, allowing a
// standard USB printer driver to coexist with the browser-based POS.

const AGENT_URL = 'http://127.0.0.1:18181'
const DEFAULT_TIMEOUT_MS = 8000

let connected = false

export const label = 'Windows USB Agent'
export const columns = 48

function isWindows() {
  if (typeof navigator === 'undefined') return false
  const platform = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || ''
  return /windows|win32|win64/i.test(platform)
}

export function isAvailable() {
  return isWindows() && typeof fetch === 'function'
}

export function isConnected() {
  return connected
}

function request(path, init = {}) {
  return fetch(`${AGENT_URL}${path}`, {
    ...init,
    mode: 'cors',
    cache: 'no-store',
    targetAddressSpace: 'loopback',
    headers: {
      'X-Noch-Print-Agent': '1',
      ...(init.headers || {}),
    },
  })
}

async function readAgentError(response) {
  try {
    const body = await response.json()
    return body?.error || `Print agent returned ${response.status}`
  } catch {
    return `Print agent returned ${response.status}`
  }
}

export async function connect() {
  if (!isAvailable()) throw new Error('Windows USB Agent is only available on a Windows PC')
  let response
  try {
    response = await request('/health')
  } catch {
    connected = false
    throw new Error('Noch Print Agent is not running. Install or start it on this Windows PC.')
  }
  if (!response.ok) throw new Error(await readAgentError(response))
  const status = await response.json()
  if (!status.printer_available) {
    connected = false
    throw new Error(`Windows printer not found: ${status.printer || 'not configured'}`)
  }
  connected = true
  return true
}

export async function autoConnect() {
  try {
    return await connect()
  } catch {
    connected = false
    return false
  }
}

export async function disconnect() {
  connected = false
}

function bytesToBase64(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let binary = ''
  for (let offset = 0; offset < view.length; offset += 0x8000) {
    binary += String.fromCharCode(...view.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}

export async function write(bytes, timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (!connected) throw new Error('Windows USB printer not connected')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await request('/print', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data_base64: bytesToBase64(bytes) }),
    })
    if (!response.ok) throw new Error(await readAgentError(response))
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Print timed out — check the XP-N200L USB connection')
    throw error
  } finally {
    clearTimeout(timeout)
  }
}
