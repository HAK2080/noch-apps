import test from 'node:test'
import assert from 'node:assert/strict'

test('Windows USB adapter checks the agent and sends raw ESC/POS bytes', async () => {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { platform: 'Win32' },
  })

  const requests = []
  globalThis.fetch = async (url, init = {}) => {
    requests.push({ url, init })
    if (url.endsWith('/health')) {
      return new Response(JSON.stringify({ ok: true, printer: 'XP-N200L', printer_available: true }))
    }
    return new Response(JSON.stringify({ ok: true }))
  }

  const transport = await import('../src/modules/pos/lib/escpos-transport-windows-agent.js')
  assert.equal(transport.columns, 48)
  assert.equal(await transport.connect(), true)
  await transport.write(new Uint8Array([0x1b, 0x40, 0x0a]))

  assert.equal(requests[0].url, 'http://127.0.0.1:18181/health')
  assert.equal(requests[1].url, 'http://127.0.0.1:18181/print')
  assert.equal(JSON.parse(requests[1].init.body).data_base64, 'G0AK')
  assert.equal(requests[1].init.headers['Content-Type'], 'application/json')
})
