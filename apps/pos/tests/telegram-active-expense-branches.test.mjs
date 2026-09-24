import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'

const snapSource = await readFile(new URL('../../../supabase/functions/expense-snap/index.ts', import.meta.url), 'utf8')
const webhookSource = await readFile(new URL('../../../supabase/functions/telegram-webhook/index.ts', import.meta.url), 'utf8')
const telegramActor = { profileId: null, internalTelegram: true }

function scanner() {
  let snap
  const expenses = []
  const context = vm.createContext({
    Response, Request, console, crypto, atob, Uint8Array,
    Deno: { env: { get: key => key === 'SUPABASE_URL' ? 'https://example.test' : undefined }, serve: () => {} },
    fetch: async (url, options = {}) => {
      const path = new URL(url).pathname
      if (path.includes('/storage/')) return new Response('{}')
      const payload = options.body ? JSON.parse(options.body) : null
      if (path.endsWith('/profiles')) return Response.json([{ id: 'staff' }])
      if (path.endsWith('/cost_centers')) return Response.json([
        { id: 'CC01', name: 'City Walk', pos_branch_id: 'city', include_in_split: true },
        { id: 'CC02', name: 'Closed branch', pos_branch_id: 'closed', include_in_split: true },
        { id: 'CC03', name: 'Coming soon', pos_branch_id: 'soon', include_in_split: true },
        { id: 'SHARED', name: 'Shared', pos_branch_id: null, include_in_split: false },
      ])
      if (path.endsWith('/pos_branches')) return Response.json([
        { id: 'city', name: 'City Walk', name_ar: 'نوتش - سيتي ووك', is_active: true, operational_status: 'operating' },
        { id: 'soon', name: 'Coming soon', is_active: true, operational_status: 'pre_opening' },
      ])
      if (path.endsWith('/expense_categories')) return Response.json([{ id: 'category', name: 'Miscellaneous' }])
      if (path.endsWith('/cc_exchange_rates')) return Response.json([])
      if (path.endsWith('/expense_snaps')) {
        if (options.method === 'POST') snap = { id: 'scan', ...payload }
        if (options.method === 'PATCH') snap = { ...snap, ...payload }
        return Response.json([snap])
      }
      if (path.endsWith('/expenses') && options.method === 'POST') {
        expenses.push(...payload)
        return Response.json(payload)
      }
      throw new Error(`Unexpected request ${url}`)
    },
  })
  vm.runInContext(stripTypeScriptTypes(snapSource), context)
  return { context, expenses }
}

test('Telegram asks only for mapped operating branches and rejects stale closed-branch buttons', async () => {
  const s = scanner()
  const draft = await (await s.context.actionManual({ text: '125 beans', source: 'telegram', telegram_chat_id: '123' }, telegramActor)).json()
  assert.deepEqual(Array.from(draft.cost_centers, center => center.code), ['CC01'])
  assert.equal(draft.cost_centers[0].name, 'نوتش - سيتي ووك')

  const closed = await s.context.actionFinalize({ snap_id: 'scan', allocation: { mode: 'single', code: 'CC02' } }, telegramActor)
  assert.equal(closed.status, 400)
  assert.equal((await closed.json()).error, 'bad_code')
  assert.equal(s.expenses.length, 0)

  const saved = await s.context.actionFinalize({ snap_id: 'scan', allocation: { mode: 'single', code: 'CC01' } }, telegramActor)
  assert.equal(saved.status, 200)
  assert.equal(s.expenses[0].cost_center_id, 'CC01')
})

test('scanned Telegram invoices return the active branch choice', async () => {
  const s = scanner()
  const draft = await (await s.context.actionExtract({
    image_base64: 'AA==', source: 'telegram', telegram_chat_id: '123', caption: '125',
  }, telegramActor)).json()
  assert.equal(draft.needs_amount, false)
  assert.deepEqual(Array.from(draft.cost_centers, center => center.code), ['CC01'])
})

test('Telegram branch prompt has one active branch and no misleading split option', async () => {
  const sent = []
  const context = vm.createContext({
    Response, Request, console,
    Deno: { env: { get: () => undefined }, serve: () => {} },
    fetch: async (_url, options) => {
      sent.push(JSON.parse(options.body))
      return Response.json({ ok: true })
    },
  })
  vm.runInContext(stripTypeScriptTypes(webhookSource.replace(/import \{[\s\S]*?\} from '\.\.\/_shared\/stock-command\.js'/, '')), context)
  await context.sendBranchButtons('bot', 'chat', {
    snap_id: 'scan', extracted: { amount: 125, payment_defaulted: true },
    cost_centers: [{ code: 'CC01', name: 'نوتش - سيتي ووك' }],
  }, 'Read')
  const buttons = sent[0].reply_markup.inline_keyboard.flat()
  assert.ok(buttons.some(button => button.callback_data === 'esnap|scan|cc|CC01'))
  assert.ok(!buttons.some(button => button.callback_data?.endsWith('|even')))
  assert.match(sent[0].text, /لأي فرع؟/)
})
