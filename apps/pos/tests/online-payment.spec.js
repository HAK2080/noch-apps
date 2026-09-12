import { test, expect } from '@playwright/test'

const review = async page => {
  await page.goto('/tests/fixtures/pos-arabic.html?view=online')
  await page.getByRole('button', { name: 'مراجعة وتحصيل الدفع' }).click()
}
async function isolated(context, { failure = false, replay = false } = {}) {
  const calls = []
  await context.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin === 'http://127.0.0.1:4193') return route.continue()
    calls.push({ path: url.pathname, body: route.request().postData() })
    if (url.pathname.endsWith('/complete_online_order_payment')) {
      return route.fulfill({ status: failure ? 400 : 200, contentType: 'application/json', body: JSON.stringify(failure
        ? { message: 'STOCK_BLOCKED: private backend error' }
        : { success: true, already_completed: replay, order: { id: 'test-order', order_number: 'ONL-TEST-1', total: 23, status: 'completed' } }) })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  return calls
}

test('cash: exact review, insufficient payment blocked, confirmation required; pay once', async ({ page, context }, info) => {
  const calls = await isolated(context)
  await review(page)
  await expect(page.getByRole('dialog')).toHaveAttribute('dir','rtl')
  const pay = page.getByRole('button', { name: 'تأكيد الدفع وبدء التحضير' })
  await expect(pay).toBeDisabled()
  await page.getByLabel('المبلغ النقدي المستلم').fill('20')
  await page.getByRole('checkbox').check()
  await expect(pay).toBeDisabled()
  await page.getByLabel('المبلغ النقدي المستلم').fill('30')
  await expect(page.getByRole('checkbox')).not.toBeChecked()
  await page.getByRole('checkbox').check()
  await expect(page.getByText(/الباقي للعميل/)).toContainText('7')
  await page.screenshot({ path: info.outputPath('arabic-online-payment.png') })
  expect(calls.some(x => /complete_online|print_queue/.test(x.path))).toBe(false)
  await pay.click()
  await expect(page.locator('#result')).toHaveText('"accepted"')
  const payments = calls.filter(x => x.path.endsWith('/complete_online_order_payment'))
  expect(payments).toHaveLength(1)
  expect(JSON.parse(payments[0].body)).toMatchObject({ p_order_id:'test-order',p_expected_total:23,p_payment_method:'cash',p_cash_tendered:30,p_shift_id:'test-shift' })
  expect(calls.some(x => /approve_online_order|confirm_pickup_order/.test(x.path))).toBe(false)
})

for (const method of ['card','split']) test(`${method} requires received-payment confirmation and preserves amounts`, async ({ page, context }) => {
  const calls = await isolated(context)
  await review(page)
  await page.getByLabel('طريقة الدفع').selectOption(method)
  if (method === 'split') {
    await page.getByLabel('المبلغ بالبطاقة').fill('10')
    await page.getByLabel('المبلغ النقدي المستلم').fill('15')
  }
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'تأكيد الدفع وبدء التحضير' }).click()
  await expect(page.locator('#result')).toHaveText('"accepted"')
  expect(JSON.parse(calls.find(x => x.path.endsWith('/complete_online_order_payment')).body)).toMatchObject({ p_payment_method:method,p_card_amount:method==='card'?23:10,p_cash_tendered:method==='card'?null:15 })
})

test('server failure stays Arabic, does not complete or print, and retries the same order ID', async ({ page, context }) => {
  const calls = await isolated(context,{failure:true})
  await review(page)
  await page.getByLabel('طريقة الدفع').selectOption('card')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'تأكيد الدفع وبدء التحضير' }).click()
  await expect(page.getByRole('alert')).toContainText('تعذر تأكيد الدفع')
  await expect(page.getByRole('alert')).not.toContainText('private backend error')
  await expect(page.locator('#result')).toBeEmpty()
  await page.getByRole('button', { name: 'تأكيد الدفع وبدء التحضير' }).click()
  await expect.poll(() => calls.filter(x => x.path.endsWith('/complete_online_order_payment')).length).toBe(2)
  expect(calls.filter(x => x.path.endsWith('/complete_online_order_payment')).map(x => JSON.parse(x.body).p_order_id)).toEqual(['test-order','test-order'])
  expect(calls.some(x => /print_queue/.test(x.path))).toBe(false)
})

test('already-paid replay does not enqueue a duplicate ticket', async ({ page, context }) => {
  const calls = await isolated(context,{replay:true})
  await review(page)
  await page.getByLabel('طريقة الدفع').selectOption('card')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'تأكيد الدفع وبدء التحضير' }).click()
  await expect(page.locator('#result')).toHaveText('"accepted"')
  expect(calls.some(x => /print_queue/.test(x.path))).toBe(false)
})

test('no shift and cancellation never submit payment', async ({ page, context }) => {
  const calls = await isolated(context)
  await page.goto('/tests/fixtures/pos-arabic.html?view=online&noShift=1')
  await page.getByRole('button', { name: 'مراجعة وتحصيل الدفع' }).click()
  await expect(page.getByRole('alert')).toHaveText('افتح الوردية قبل تحصيل الدفع.')
  await expect(page.getByRole('button', { name: 'تأكيد الدفع وبدء التحضير' })).toBeDisabled()
  await page.getByRole('button', { name: 'إلغاء',exact:true }).click()
  await expect(page.getByRole('button', { name: 'مراجعة وتحصيل الدفع' })).toBeVisible()
  expect(calls.some(x => x.path.endsWith('/complete_online_order_payment'))).toBe(false)
})
