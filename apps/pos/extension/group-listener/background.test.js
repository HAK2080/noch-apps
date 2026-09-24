const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

function startBackground(deliver) {
  const state = { matches: [] }
  let receive
  const chrome = {
    storage: { local: {
      async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, state[key]])) },
      async set(values) { Object.assign(state, values) },
    } },
    runtime: { onMessage: { addListener(listener) { receive = listener } } },
    notifications: { async create() {}, onClicked: { addListener() {} } },
    action: { async setBadgeText() {}, async setBadgeBackgroundColor() {} },
    tabs: { async query() { return [{ id: 1, url: 'https://apps.noch.cloud/content-studio/groups' }] }, sendMessage: deliver, create() {} },
  }
  vm.runInNewContext(fs.readFileSync('background.js', 'utf8'), { chrome, Date, console, Math, Promise })
  return { state, receive, sync: () => new Promise(resolve => receive({ type: 'SYNC_PENDING' }, {}, resolve)) }
}

const post = { url: 'https://www.facebook.com/groups/test/posts/123', groupUrl: 'https://www.facebook.com/groups/test', groupName: 'Test', text: 'Looking for a local plumber this week.', keywords: ['plumber'], areas: [] }

test('sends a match to the NOCH Groups inbox once', async () => {
  const sent = []
  const app = startBackground(async (_id, message) => { sent.push(message.match); return { ok: true } })
  app.receive({ type: 'MATCH_FOUND', post }, {}, () => {})
  await app.sync()
  assert.equal(sent.length, 1)
  assert.equal(sent[0].text, post.text)
  assert.equal(app.state.matches[0].synced, true)
  app.receive({ type: 'MATCH_FOUND', post }, {}, () => {})
  await app.sync()
  assert.equal(sent.length, 1)
})

test('keeps a match pending until the inbox confirms it', async () => {
  let ready = false
  const app = startBackground(async () => ready ? { ok: true } : { ok: false, error: 'Not ready' })
  app.receive({ type: 'MATCH_FOUND', post }, {}, () => {})
  const first = await app.sync()
  assert.equal(first.ok, false)
  assert.equal(app.state.matches[0].synced, undefined)
  ready = true
  const second = await app.sync()
  assert.equal(second.ok, true)
  assert.equal(app.state.matches[0].synced, true)
})
