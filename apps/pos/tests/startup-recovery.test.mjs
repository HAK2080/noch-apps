import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8')
const guard = html.match(/<script>([\s\S]*?)<\/script>/)[1]

test('a failed mobile boot offers recovery without deleting queued sales or login', async () => {
  const events = {}
  const timers = []
  const deleted = []
  const reports = []
  const root = { childElementCount: 0, innerHTML: '' }
  const button = {}
  let reload
  let unregistered = false
  const context = {
    document: { getElementById: id => id === 'root' ? root : button },
    navigator: { serviceWorker: { getRegistrations: async () => [
      { unregister: async () => { unregistered = true } },
    ] } },
    caches: {
      keys: async () => ['noch-pos-release', 'noch-pos-images-v1', 'other-app'],
      delete: async key => { deleted.push(key) },
    },
    location: { href: 'https://apps.noch.cloud/login', replace: url => { reload = url } },
    localStorage: { clear: () => assert.fail('must preserve login') },
    indexedDB: { deleteDatabase: () => assert.fail('must preserve queued sales') },
    setTimeout: callback => timers.push(callback),
    Image: class { set src(value) { reports.push(value) } },
    URL,
  }
  context.window = { addEventListener: (name, fn) => { events[name] = fn }, caches: context.caches }
  vm.runInNewContext(guard, context)
  events.error({ message: 'Failed to load https://example.com/file.js?token=secret' })
  timers.forEach(fn => fn())
  assert.match(root.innerHTML, /noch-startup-retry/)
  assert.equal(reports.length, 1)
  assert.ok(!reports[0].includes('secret'))
  button.onclick()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(unregistered, true)
  assert.deepEqual(deleted, ['noch-pos-release'])
  assert.match(reload, /login\?noch_reload=/)
})

test('a successfully rendered screen is never replaced by the startup watchdog', () => {
  const root = { childElementCount: 1, innerHTML: 'POS order in progress' }
  vm.runInNewContext(guard, {
    document: { getElementById: () => root },
    window: { addEventListener: () => {} },
    setTimeout: fn => fn(),
  })
  assert.equal(root.innerHTML, 'POS order in progress')
})
