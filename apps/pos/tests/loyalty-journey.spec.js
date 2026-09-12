import { test, expect } from '@playwright/test'

const branch = '00000000-0000-4000-8000-000000000001'
const product = '00000000-0000-4000-8000-000000000002'
const member = '00000000-0000-4000-8000-000000000003'
const fixture = '/tests/fixtures/loyalty-journey.html'

async function isolate(context, { gps = 'ready' } = {}) {
  const state = { requests: [], claimed: false, settled: false, outsideRequests: [] }
  await context.addInitScript(mode => {
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition(success, error) {
      if (mode === 'denied') error({ code: 1 })
      else success({ coords: { latitude: mode === 'outside' ? 40 : 32, longitude: 13 } })
    } } })
  }, gps)
  // Fail closed: everything outside the local Vite origin is fulfilled here.
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url())
    if (url.origin === 'http://127.0.0.1:4193') return route.continue()
    let body
    try { body = request.postDataJSON() } catch { body = null }
    state.requests.push({ path: url.pathname, body, method: request.method() })
    let data = []
    const path = url.pathname
    if (path.endsWith('/pos_branches')) data = { id: branch, name: 'مقهى الاختبار', lat: 32, lng: 13, geofence_radius_m: 50 }
    else if (path.endsWith('/pos_categories')) data = [{ id: 'coffee', name: 'Coffee', name_ar: 'القهوة', menu_display_style: 'scroll' }]
    else if (path.endsWith('/pos_products')) data = [{ id: product, category_id: 'coffee', name: 'Latte', name_ar: 'لاتيه تجريبي', price: 23, is_available: true }]
    else if (path.endsWith('/get_sale_availability')) data = [{ product_id: product, blocked: false }]
    else if (path.endsWith('/submit_guest_order')) data = { success: true, order_id: 'test-order', order_number: 'ONL-TEST', total: 23, pickup_code: '4321' }
    else if (path.endsWith('/create_loyalty_checkout_v2')) data = { session_id: 'test-session', token: 'test-token' }
    else if (path.endsWith('/get_loyalty_checkout_v2')) data = state.claimed ? { status: 'claimed', customer_id: member, full_name: 'عميل تجريبي', points_balance: 100 } : { status: 'pending' }
    else if (path.endsWith('/lookup_or_create_loyalty_member_v2')) data = { id: member, full_name: 'عميل تجريبي', points_balance: 100 }
    else if (path.endsWith('/join_and_claim_loyalty_checkout_v2')) {
      state.claimed = true
      data = { status: 'claimed', full_name: 'عميل تجريبي', points_balance: 100 }
    } else if (path.endsWith('/get_my_loyalty_checkout_v2')) data = state.settled
      ? { status: 'settled', full_name: 'عميل تجريبي', points_balance: 123, points_earned: 23, available_rewards: 1, missions: [{ mission_id: 'mission', title: 'Visit', title_ar: 'زيارات المقهى', progress_count: 2, target_count: 3 }] }
      : { status: 'claimed', full_name: 'عميل تجريبي', points_balance: 100 }
    else if (path.endsWith('/auth/v1/verify')) data = { access_token: 'test-access-token', token_type: 'bearer', expires_in: 3600, refresh_token: 'test-refresh-token', user: { id: member, aud: 'authenticated', role: 'authenticated', email: 'journey@example.invalid', app_metadata: {}, user_metadata: {} } }
    else if (path.endsWith('/auth/v1/otp')) data = {}
    else if (path.endsWith('/auth/v1/user')) data = { id: member, aud: 'authenticated', email: 'journey@example.invalid' }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
  })
  return state
}

async function basket(page) {
  await page.goto(fixture)
  await page.getByRole('button', { name: 'لاتيه تجريبي', exact: true }).click()
  await page.getByRole('button', { name: 'أضف للطلب', exact: true }).click()
  await page.getByRole('button', { name: 'إغلاق', exact: true }).click()
  await page.getByText('عرض الطلب', { exact: true }).click()
}

test('customer menu: browse, basket, details, submit and explicit reset; record missing modifier/profile links', async ({ page, context }, info) => {
  const state = await isolate(context)
  await basket(page)
  await expect(page.locator('.sheet-item')).toContainText('23.00')
  await page.getByRole('button', { name: /إرسال للكاشير/ }).click()
  await expect(page.getByText('الرجاء إدخال اسمك')).toBeVisible()
  await page.getByPlaceholder('اسمك', { exact: true }).fill('عميل تجريبي')
  await page.getByPlaceholder('رقم الهاتف', { exact: true }).fill('0000000000')
  await page.getByRole('button', { name: /إرسال للكاشير/ }).click()
  await expect(page.getByText('تم إرسال طلبك!')).toBeVisible()
  const sent = state.requests.filter(x => x.path.endsWith('/submit_guest_order'))
  expect(sent).toHaveLength(1)
  expect(sent[0].body.p_items).toEqual([{ product_id: product, quantity: 1 }])
  expect(sent[0].body.p_payment_method).toBe('pickup')
  await expect(page.locator('.pickup-code')).toHaveText('4321')
  // Characterization assertions: these expose current gaps, not desired behavior.
  await expect(page.locator('.feedback-link')).toHaveAttribute('href', /order=undefined/)
  await expect(page.locator('.order-success a[href*="loyalty"]')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('menu-order-submitted.png') })
  await page.getByRole('button', { name: 'تم', exact: true }).click()
  await page.getByRole('button', { name: 'لاتيه تجريبي', exact: true }).click()
  await page.getByRole('button', { name: 'أضف للطلب', exact: true }).click()
  await page.getByRole('button', { name: 'إغلاق', exact: true }).click()
  await page.getByText('عرض الطلب', { exact: true }).click()
  await expect(page.getByPlaceholder('اسمك', { exact: true })).toHaveValue('')
  await expect(page.getByPlaceholder('رقم الهاتف', { exact: true })).toHaveValue('')
})

for (const gps of ['denied', 'outside']) test(`menu GPS ${gps}: submission blocked`, async ({ page, context }) => {
  const state = await isolate(context, { gps })
  await basket(page)
  await expect(page.locator('.gps-row.warn')).toBeVisible()
  await expect(page.getByRole('button', { name: /إرسال للكاشير/ })).toHaveCount(0)
  expect(state.requests.some(x => x.path.endsWith('/submit_guest_order'))).toBe(false)
})

test('barista customizes milk; paid extra changes unit price and preserves choice', async ({ page, context }) => {
  await isolate(context)
  await page.goto(`${fixture}?view=modifiers`)
  await expect(page.getByRole('button', { name: 'أضف للسلة' })).toBeDisabled()
  await page.getByRole('button', { name: /الحليب/ }).click()
  await page.getByRole('button', { name: /حليب الشوفان/ }).click()
  await page.getByRole('button', { name: 'أضف للسلة' }).click()
  const result = JSON.parse(await page.locator('#result').textContent())
  expect(result.unit_price).toBe(26)
  expect(result.modifiers[0]).toMatchObject({ modifier_id: 'oat', price_delta: 3, modifier_name_ar: 'حليب الشوفان' })
})

test('cashier QR decodes; separate customer page verifies, links and displays settlement response', async ({ page, context }, info) => {
  const state = await isolate(context)
  await page.goto(`${fixture}?view=payment`)
  const qr = page.locator('img[src^="data:image/png"]')
  await expect(qr).toBeVisible()
  const source = await qr.getAttribute('src')
  const decoded = await page.evaluate(src => window.decodeTestQr(src), source)
  expect(decoded).toBe('http://127.0.0.1:4193/loyalty/checkout/test-token')
  const customer = await context.newPage()
  await customer.setViewportSize({ width: 390, height: 844 })
  await customer.goto(`${fixture}?view=claim`)
  await customer.getByRole('button', { name: 'بريد', exact: true }).click()
  await customer.getByPlaceholder('you@example.com').fill('journey@example.invalid')
  await customer.getByRole('button', { name: 'إرسال رمز خاص' }).click()
  await customer.getByPlaceholder('000000').fill('123456')
  await customer.getByRole('button', { name: 'تحقق', exact: true }).click()
  await customer.getByPlaceholder('الاسم الظاهر في بطاقة الولاء').fill('عميل تجريبي')
  await customer.getByRole('button', { name: 'اجمع نقاط هذا الطلب' }).click()
  await expect(customer.getByText('بانتظار إتمام الدفع…')).toBeVisible()
  await expect(page.getByRole('button', { name: 'إنهاء البيع', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'إنهاء البيع', exact: true }).click()
  const payment = JSON.parse(await page.locator('#result').textContent())
  expect(payment).toMatchObject({ loyalty_customer_id: member, loyalty_capture_method: 'customer_qr', loyalty_checkout_session_id: 'test-session', cash_tendered: 23 })
  // Synthetic server settlement, NOT a claim of a real sale or a DB integration test.
  state.settled = true
  await expect(customer.getByText('تمت إضافة النقاط', { exact: true })).toBeVisible()
  await expect(customer.getByText('+23 نقطة', { exact: true })).toBeVisible()
  await expect(customer.getByText('123 نقطة', { exact: true })).toBeVisible()
  await expect(customer.getByText('المكافآت المتاحة: 1')).toBeVisible()
  await expect(customer.getByText('تم إكمال 2 من 3')).toBeVisible()
  await expect(customer.getByRole('progressbar')).toHaveCount(0)
  expect(await customer.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await customer.screenshot({ path: info.outputPath('customer-points-result.png') })
  await customer.getByRole('button', { name: 'لا رسائل', exact: true }).click()
  await expect(customer.getByText('تم حفظ اختيارك ويمكن تغييره لاحقاً.')).toBeVisible()
  const consent = state.requests.find(x => x.path.endsWith('/update_my_loyalty_profile_v2'))
  expect(consent.body).toMatchObject({ p_whatsapp_opt_in: false, p_marketing_opt_in: false })
})

test('phone fallback links customer but cancels/removes transaction QR (current gap)', async ({ page, context }) => {
  const state = await isolate(context)
  await page.goto(`${fixture}?view=payment`)
  await expect(page.locator('img[src^="data:image/png"]')).toBeVisible()
  await page.getByRole('button', { name: 'البحث برقم هاتف العميل' }).click()
  await page.locator('input[inputmode="tel"]').fill('0000000000')
  await page.getByRole('button', { name: 'ربط العميل', exact: true }).click()
  await expect(page.locator('img[src^="data:image/png"]')).toHaveCount(0)
  await page.getByRole('button', { name: 'إنهاء البيع', exact: true }).click()
  const result = JSON.parse(await page.locator('#result').textContent())
  expect(result.loyalty_capture_method).toBe('phone_fallback')
  expect(result.loyalty_checkout_session_id).toBeNull()
  expect(state.requests.find(x => x.path.endsWith('/close_loyalty_checkout_v2')).body.p_cancel).toBe(true)
})

test('incoming order acceptance has no payment capture; collection calls pickup completion', async ({ page, context }) => {
  const state = await isolate(context)
  await page.goto('/tests/fixtures/pos-arabic.html?view=online')
  await page.getByRole('button', { name: 'قبول الطلب' }).click()
  await expect(page.locator('#result')).toHaveText('"accepted"')
  expect(state.requests.some(x => x.path.endsWith('/approve_online_order'))).toBe(true)
  expect(state.requests.some(x => /create_pos_order|create_loyalty_checkout/.test(x.path))).toBe(false)
  await expect(page.getByRole('button', { name: 'إنهاء البيع', exact: true })).toHaveCount(0)
  await page.goto('/tests/fixtures/pos-arabic.html?view=collected')
  await page.getByRole('button', { name: 'تم الاستلام' }).click()
  await expect(page.locator('#result')).toHaveText('"collected"')
  expect(state.requests.find(x => x.path.endsWith('/confirm_pickup_order')).body).toEqual({ p_pickup_code: '1234', p_branch_id: 'test-branch' })
})

test('OTP delivery error stays Arabic and does not link purchase', async ({ page, context }) => {
  const state = await isolate(context)
  await page.route('**/auth/v1/otp', route => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ msg: 'SMS provider failure', error_code: 'sms_send_failed' }) }))
  await page.goto(`${fixture}?view=claim`)
  await page.locator('input[type="tel"]').fill('0000000000')
  await page.getByRole('button', { name: 'إرسال رمز خاص' }).click()
  await expect(page.locator('body')).not.toContainText('SMS provider failure')
  await expect(page.getByRole('button', { name: 'إرسال رمز خاص' })).toBeEnabled()
  expect(state.claimed).toBe(false)
})

test('GAP: Arabic menu exposes raw server submission errors', async ({ page, context }) => {
  await isolate(context)
  await page.route('**/rest/v1/rpc/submit_guest_order', route => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'STOCK_BLOCKED: Insufficient stock for Synthetic Latte' }) }))
  await basket(page)
  await page.getByPlaceholder('اسمك', { exact: true }).fill('عميل تجريبي')
  await page.getByPlaceholder('رقم الهاتف', { exact: true }).fill('0000000000')
  await page.getByRole('button', { name: /إرسال للكاشير/ }).click()
  await expect(page.locator('.submit-error')).toHaveText('STOCK_BLOCKED: Insufficient stock for Synthetic Latte')
  await expect(page.getByRole('button', { name: /إرسال للكاشير/ })).toBeEnabled()
})

test('GAP: expired QR remains displayed without automatic replacement', async ({ page, context }) => {
  const state = await isolate(context)
  let polled = false
  await page.route('**/rest/v1/rpc/get_loyalty_checkout_v2', async route => {
    polled = true
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'expired' }) })
  })
  await page.goto(`${fixture}?view=payment`)
  await expect(page.locator('img[src^="data:image/png"]')).toBeVisible()
  await expect.poll(() => polled).toBe(true)
  await expect(page.locator('img[src^="data:image/png"]')).toBeVisible()
  expect(state.requests.filter(x => x.path.endsWith('/create_loyalty_checkout_v2'))).toHaveLength(1)
})

for (const [type, label] of Object.entries({ stamp: 'تم منح الطابع!', badge: 'حصلت على شارة!', tier_up: 'مستوى جديد!', streak: 'سلسلة!', spin_win: 'ربحت!', birthday: 'عيد ميلاد سعيد!' })) {
  test(`existing ${type} animation renders and dismisses in isolation (not connected to checkout)`, async ({ page, context }) => {
    await isolate(context)
    await page.clock.install()
    await page.goto(`${fixture}?view=animation&type=${type}`)
    await page.getByRole('button', { name: 'تشغيل التجربة' }).click()
    await expect(page.getByText(label, { exact: true })).toBeVisible()
    await expect(page.locator('div[style*="confetti-fall"]')).toHaveCount(20)
    await expect(page.getByText('جائزة تجريبية', { exact: true })).toBeVisible()
    await page.clock.fastForward(3500)
    await expect(page.getByText(label, { exact: true })).toHaveCount(0)
    await expect(page.locator('#result')).toHaveText('"dismissed"')
  })
}
