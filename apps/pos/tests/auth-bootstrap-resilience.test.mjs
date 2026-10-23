import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  AUTH_BOOTSTRAP_TIMEOUT_MS,
  AuthBootstrapTimeout,
  withAuthBootstrapTimeout,
} from '../src/lib/auth-bootstrap.js'

const authContextUrl = new URL('../src/contexts/AuthContext.jsx', import.meta.url)
const indexHtmlUrl = new URL('../index.html', import.meta.url)

test('a successful session resolves through untouched', async () => {
  const session = { data: { session: { user: { id: 'u1' } } } }
  assert.deepEqual(await withAuthBootstrapTimeout(Promise.resolve(session), 50), session)
})

test('a hanging bootstrap rejects instead of blocking startup forever', async () => {
  await assert.rejects(
    () => withAuthBootstrapTimeout(new Promise(() => {}), 20),
    AuthBootstrapTimeout,
  )
})

test('an underlying failure keeps its own error', async () => {
  const failure = new Error('gateway unavailable')
  await assert.rejects(() => withAuthBootstrapTimeout(Promise.reject(failure), 50), /gateway unavailable/)
})

test('the timer never outlives a settled bootstrap', async () => {
  // A leaked timer would hold the event loop open on a till left running all day.
  const before = process.getActiveResourcesInfo().filter(r => r === 'Timeout').length
  await withAuthBootstrapTimeout(Promise.resolve('ok'), 60_000)
  const after = process.getActiveResourcesInfo().filter(r => r === 'Timeout').length
  assert.equal(after, before, 'the timeout must be cleared once the race settles')
})

test('the bootstrap deadline sits inside the startup watchdog window', async () => {
  const html = await readFile(indexHtmlUrl, 'utf8')
  const watchdog = Number(html.match(/setTimeout\(showRecovery,\s*(\d+)\)\s*\n\s*\}\)\(\)/)?.[1]
    || html.match(/setTimeout\(showRecovery,\s*(10000)\)/)?.[1])

  assert.ok(watchdog > 0, 'index.html should still arm a startup watchdog')
  assert.ok(
    AUTH_BOOTSTRAP_TIMEOUT_MS < watchdog,
    `auth must give up (${AUTH_BOOTSTRAP_TIMEOUT_MS}ms) before the watchdog fires (${watchdog}ms), `
    + 'otherwise a slow network shows the recovery screen instead of the login form',
  )
})

test('getSession failure can no longer strand startup or raise an unhandled rejection', async () => {
  const source = await readFile(authContextUrl, 'utf8')

  assert.match(source, /withAuthBootstrapTimeout\(supabase\.auth\.getSession\(\)\)/)
  // The rejection path must exist and must end the loading state.
  const tail = source.slice(source.indexOf('withAuthBootstrapTimeout(supabase.auth.getSession())'))
  const catchBlock = tail.slice(tail.indexOf('.catch('), tail.indexOf('.catch(') + 400)
  assert.match(catchBlock, /setLoading\(false\)/, 'a failed bootstrap must still open the app')
})

test('a failed request is given a grace period before the recovery screen', async () => {
  const html = await readFile(indexHtmlUrl, 'utf8')

  assert.doesNotMatch(
    html,
    /setTimeout\(showRecovery,\s*0\)/,
    'an immediate verdict kills an app that was still mounting',
  )
  assert.match(html, /setTimeout\(showRecovery,\s*2500\)/)
  // The recovery screen must still refuse to replace a mounted app.
  assert.match(html, /if \(!root \|\| root\.childElementCount\) return/)
  // And startup failures must still be reported, or the cause stays invisible.
  assert.match(html, /noch_startup_error=/)
})
