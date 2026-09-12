import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  // Synthetic responses only: never create a production sale, session or message.
  await page.route('https://**/*', async route => {
    const path = new URL(route.request().url()).pathname
    let data = []
    if (path.endsWith('/create_loyalty_checkout_v2')) data = { session_id: 'fake-session', token: 'fake-token' }
    if (path.endsWith('/get_loyalty_checkout_v2')) data = { status: 'pending' }
    if (path.endsWith('/cancel_online_order') || path.endsWith('/confirm_pickup_order')) data = { success: true }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
  })
})

test('incoming order controls and decline confirmation are Arabic', async ({ page }, testInfo) => {
  await page.goto('/tests/fixtures/pos-arabic.html?view=online')
  await expect(page.getByRole('dialog')).toHaveAttribute('dir', 'rtl')
  await expect(page.getByText('طلب جديد من المنيو!')).toBeVisible()
  await expect(page.getByRole('button', { name: 'مراجعة وتحصيل الدفع' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('arabic-online-order.png') })
  await page.getByRole('button', { name: 'رفض الطلب' }).click()
  await expect(page.getByText('تم رفض الطلب ONL-TEST-1')).toBeVisible()
  await expect(page.locator('#result')).toHaveText('"declined"')
})

test('unknown server errors are shown in Arabic without exposing technical details', async ({ page }) => {
  await page.route('**/rest/v1/rpc/cancel_online_order', route => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'private database failure', code: 'P0001' }) }))
  await page.goto('/tests/fixtures/pos-arabic.html?view=online')
  await page.getByRole('button', { name: 'رفض الطلب' }).click()
  await expect(page.getByText('تعذر تحديث الطلب. يرجى المحاولة مجدداً.')).toBeVisible()
  await expect(page.locator('body')).not.toContainText('private database failure')
  await expect(page.locator('#result')).toBeEmpty()
})

test('payment, phone validation and loyalty instructions are Arabic; amounts are unchanged', async ({ page }, testInfo) => {
  await page.goto('/tests/fixtures/pos-arabic.html')
  await expect(page.getByText('يمسح العميل الرمز لجمع النقاط')).toBeVisible()
  await page.getByRole('button', { name: 'البحث برقم هاتف العميل' }).click()
  await page.getByRole('button', { name: 'ربط العميل', exact: true }).click()
  await expect(page.getByText('أدخل رقم هاتف من 7 أرقام على الأقل.')).toBeVisible()
  await page.getByRole('button', { name: 'ليس عضواً', exact: true }).click()
  await page.screenshot({ path: testInfo.outputPath('arabic-checkout.png') })
  await page.getByRole('button', { name: 'إنهاء البيع', exact: true }).click()
  await expect(page.locator('#result')).toContainText('"cash_tendered":23')
  await expect(page.locator('#result')).toContainText('"loyalty_skip_reason":"not_member"')
})

test('bilingual tiles retain Arabic controls; English is an explicit option', async ({ page }) => {
  await page.goto('/tests/fixtures/pos-arabic.html?view=online&lang=both')
  await expect(page.getByRole('button', { name: 'مراجعة وتحصيل الدفع' })).toBeVisible()
  await page.goto('/tests/fixtures/pos-arabic.html?view=online&lang=en')
  await expect(page.getByRole('button', { name: 'Review and collect payment' })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveAttribute('dir', 'ltr')
})

test('collection payment review and customer verification page are Arabic', async ({ page }) => {
  await page.goto('/tests/fixtures/pos-arabic.html?view=collected')
  await page.getByRole('button', { name: 'مراجعة وتحصيل الدفع' }).click()
  await expect(page.getByRole('button', { name: 'تأكيد الدفع وبدء التحضير' })).toBeDisabled()
  await page.goto('/tests/fixtures/pos-arabic.html?view=claim')
  await expect(page.locator('main')).toHaveAttribute('lang', 'ar')
  await expect(page.getByRole('button', { name: 'إرسال رمز خاص' })).toBeVisible()
  await page.getByRole('button', { name: 'English', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Send private code' })).toBeVisible()
})

test('manager approval instructions and invalid PIN messages are Arabic', async ({ page }) => {
  await page.route('**/rest/v1/rpc/verify_manager_pin', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ matched: false, reason: 'not_a_manager' }) }))
  await page.goto('/tests/fixtures/pos-arabic.html?view=manager')
  await expect(page.getByText('الموافقة على خصم يتجاوز حد الموظف البالغ 10٪.')).toBeVisible()
  await page.getByPlaceholder('الرقم السري للمدير').fill('1234')
  await page.getByRole('button', { name: 'موافقة', exact: true }).click()
  await expect(page.getByText('هذا الرقم السري ليس لمدير مخوّل.')).toBeVisible()
  await expect(page.locator('#result')).toBeEmpty()
})

test('modifier requirements use Arabic names and block incomplete choices', async ({ page }) => {
  await page.goto('/tests/fixtures/pos-arabic.html?view=modifiers')
  await expect(page.getByText('اختر 1 على الأقل من الحليب')).toBeVisible()
  await expect(page.getByRole('button', { name: 'أضف للسلة' })).toBeDisabled()
})
