import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import vm from 'node:vm'
import test from 'node:test'

const source = await readFile(new URL('../../../supabase/functions/expense-snap/index.ts', import.meta.url), 'utf8')
const actor = { profileId: 'staff', internalTelegram: false }

function scanner() {
  let snap
  const expenses = []
  const context = vm.createContext({ Response, Request, console, crypto, atob, Uint8Array,
    Deno: { env: { get: key => key === 'SUPABASE_URL' ? 'https://example.test' : undefined }, serve: () => {} },
    fetch: async (url, options = {}) => {
      const path = new URL(url).pathname
      const payload = options.body ? JSON.parse(options.body instanceof Uint8Array ? '{}' : options.body) : null
      if (path.includes('/storage/')) return new Response('{}')
      if (path.endsWith('/cost_centers')) return Response.json([{id:'CC01',name:'City Walk',include_in_split:true}])
      if (path.endsWith('/expense_categories')) return Response.json([{id:'category',name:'Miscellaneous'}])
      if (path.endsWith('/cc_exchange_rates')) return Response.json([])
      if (path.endsWith('/expense_snaps')) {
        if (options.method === 'POST') snap = {id:'scan',...payload}
        if (options.method === 'PATCH') snap = {...snap,...payload}
        return Response.json([snap])
      }
      if (path.endsWith('/expenses') && options.method === 'POST') {
        expenses.push(...payload)
        return Response.json(payload)
      }
      throw new Error(`Unexpected request ${url}`)
    },
  })
  vm.runInContext(stripTypeScriptTypes(source),context)
  return { context, expenses, get snap() { return snap } }
}

async function photo(s, caption = '125') {
  return (await s.context.actionExtract({image_base64:'AA==',source:'pwa',caption},actor)).json()
}
async function finalize(s) {
  return s.context.actionFinalize({snap_id:'scan',allocation:{mode:'single',code:'CC01'}},actor)
}

test('a photo receipt defaults to paid cash without an extra payment selection', async () => {
  const s = scanner()
  const result = await photo(s)
  assert.equal(result.extracted.payment_defaulted,true)
  assert.equal(result.extracted.payment_status_reported,'paid')
  assert.equal((await finalize(s)).status,200)
  assert.equal(s.expenses[0].payment_status_reported,'paid')
  assert.equal(s.expenses[0].payment_method_reported,'cash')
})

test('unreadable receipt retains cash default after amount entry', async () => {
  const s = scanner()
  assert.equal((await photo(s,'')).needs_amount,true)
  const result = await (await s.context.actionSetAmount({snap_id:'scan',text:'٤٥٠'},actor)).json()
  assert.equal(result.extracted.amount,450)
  assert.equal(result.extracted.payment_defaulted,true)
  await finalize(s)
  assert.equal(s.expenses[0].payment_method_reported,'cash')
})

test('receipt scan does not silently book an AI-invented old year', async () => {
  const s = scanner()
  const reference = new Date('2026-09-20T23:30:00Z')
  assert.equal(s.context.resolveReceiptExpenseDate('2019-09-19', reference).date, '2026-09-21')
  assert.equal(s.context.resolveReceiptExpenseDate('2026-09-19', reference).needsReview, false)
  assert.equal(s.context.resolveReceiptExpenseDate('2026-02-30', reference).needsReview, true)
  await photo(s)
  s.snap.extracted.expense_date = '2019-09-19'
  await finalize(s)
  assert.notEqual(s.expenses[0].expense_date, '2019-09-19')
  assert.match(s.expenses[0].description, /تاريخ الفاتورة غير مؤكد/)
  assert.equal(s.expenses[0].payment_status_reported, 'paid')
})

test('manual unpaid and card overrides persist, including changing an earlier choice', async () => {
  for (const [status,method] of [['unpaid',null],['paid','card']]) {
    const s = scanner()
    await photo(s)
    await s.context.actionSetPayment({snap_id:'scan',status:'paid',method:'cash'},actor)
    const response = await s.context.actionSetPayment({snap_id:'scan',status,method},actor)
    assert.equal(response.status,200)
    await finalize(s)
    assert.equal(s.expenses[0].payment_status_reported,status)
    assert.equal(s.expenses[0].payment_method_reported,method)
    assert.equal((await s.context.actionSetPayment({snap_id:'scan',status:'unpaid'},actor)).status,409)
  }
})

test('typed expenses do not acquire the photo default and another staff member cannot override a snap', async () => {
  const s = scanner()
  const manual = await (await s.context.actionManual({text:'125 supplies',source:'pwa'},actor)).json()
  assert.equal(manual.extracted.payment_defaulted,undefined)
  assert.equal((await s.context.actionSetPayment({snap_id:'scan',status:'paid',method:'cash'},{profileId:'other',internalTelegram:false})).status,403)
  await finalize(s)
  assert.equal(s.expenses[0].payment_status_reported,'unpaid')
})

test('Telegram goes straight to branches for default-paid photos and retains payment overrides', async () => {
  const webhook = await readFile(new URL('../../../supabase/functions/telegram-webhook/index.ts',import.meta.url),'utf8')
  const requests = []
  const context = vm.createContext({ Response, Request, console,
    Deno: { env: { get: () => undefined }, serve: () => {} },
    fetch: async (url,options) => { requests.push(JSON.parse(options.body)); return Response.json({ok:true}) },
  })
  // Stock imports are unrelated to the message helpers exercised here.
  vm.runInContext(stripTypeScriptTypes(webhook.replace(/import \{[\s\S]*?\} from '\.\.\/_shared\/stock-command\.js'/,'')),context)
  await context.sendPaymentButtons('test','chat',{snap_id:'scan',extracted:{payment_defaulted:true,amount:125},cost_centers:[{code:'CC01',name:'City Walk'}]},'Read')
  assert.match(requests[0].text,/Paid cash by default/)
  const buttons = requests[0].reply_markup.inline_keyboard.flat()
  assert.ok(buttons.some(b=>b.callback_data==='esnap|scan|cc|CC01'))
  assert.ok(buttons.some(b=>b.callback_data==='epay|scan|unpaid'))
  assert.ok(buttons.some(b=>b.callback_data==='epay|scan|paid|card'))
  await context.sendPaymentButtons('test','chat',{snap_id:'manual',extracted:{amount:50}},'Typed')
  assert.match(requests[1].text,/Has this expense been paid/)
})
