import { test, expect } from '@playwright/test'
import { Buffer } from 'node:buffer'

const id = '10000000-0000-4000-8000-000000000001'
const shift = { id, branch_id: id, status: 'open', opened_at: '2026-10-17T07:16:00Z', total_sales: 12235.5, total_orders: 282, opening_cash: 100, expected_cash: 8565.5 }
async function mockPOS(page, { lang = 'en', slowCategories = false, failedDaily = false } = {}) {
  const user = { id, email: 'pos-test@example.invalid', role: 'authenticated', aud: 'authenticated' }
  const expires = Math.floor(Date.now() / 1000) + 3600
  const token = [Buffer.from('{"alg":"HS256"}').toString('base64url'), Buffer.from(JSON.stringify({ sub: id, exp: expires, role: 'authenticated' })).toString('base64url'), 'test-signature'].join('.')
  await page.addInitScript(({ user, token, expires, lang }) => {
    localStorage.setItem('noch_lang', lang)
    localStorage.setItem('pos-tile-lang', lang)
    localStorage.setItem('noch_pos_served_by', JSON.stringify({ id: user.id, full_name: 'Test operator' }))
    localStorage.setItem('noch_pos_served_by_exp', String(Date.now() + 3600000))
    localStorage.setItem('sb-kxqjasdvoohiexedtfqw-auth-token', JSON.stringify({ user, access_token: token, refresh_token: 'mock', expires_at: expires, token_type: 'bearer' }))
  }, { user, token, expires, lang })
  const writes = []
  const dailyRequests = []
  await page.route('https://kxqjasdvoohiexedtfqw.supabase.co/**', async route => {
    const req = route.request(), url = req.url()
    const rpcRead = ['/rpc/my_profile_v2', '/rpc/pos_shift_control', '/rpc/pos_sales_control_summary', '/rpc/get_sale_availability', '/rpc/get_product_popularity', '/rpc/pos_security_status', '/rpc/profile_directory_v2'].some(path => url.includes(path))
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method()) && !rpcRead) writes.push(url)
    let body = []
    if (url.includes('/rpc/my_profile_v2')) body = [{ ...user, role: 'owner', full_name: 'Test owner', access_enabled: true }]
    else if (url.includes('/pos_settings')) body = { require_pin: false, block_duplicate_tabs: false }
    else if (url.includes('/pos_branches')) body = { id, name: 'Test City Walk', is_active: true }
    else if (url.includes('/pos_shifts')) body = url.includes('id=eq.') && !url.includes('branch_id=eq.') ? shift : [shift]
    else if (url.includes('/rpc/pos_shift_control')) body = [{ shift_id: id, status: 'open', opened_at: shift.opened_at, net_sales: 12235.5, order_count: 282, net_cash_tender: 8465.5, net_card_tender: 3770, expected_drawer_cash: 8565.5 }]
    else if (url.includes('/rpc/pos_sales_control_summary')) {
      const payload = req.postDataJSON()
      dailyRequests.push(payload)
      if (failedDaily) return route.fulfill({ status: 503, json: { message: 'Temporary daily-report outage' } })
      body = [{ net_sales: payload.p_from === '2026-10-19' ? 2772.5 : 4157, order_count: 81, period_cash_movement: 3253, period_card_movement: 904 }]
    } else if (url.includes('/pos_orders')) body = [{ id, total: 4157, status: 'completed', created_at: '2026-10-20T20:44:00Z', pos_order_items: [] }]
    else if (url.includes('/pos_products')) body = [{ id, name: 'Ready coffee', price: 15, is_active: true, visible_on_menu: true, track_inventory: false }]
    else if (url.includes('/rpc/get_sale_availability')) body = [{ product_id: id, blocked: false }]
    else if (url.includes('/pos_categories') && slowCategories) await new Promise(resolve => setTimeout(resolve, 8000))
    await route.fulfill({ json: body }).catch(() => {})
  })
  return { writes, dailyRequests }
}

for (const lang of ['en', 'ar']) test(`daily versus multi-day shift totals are distinct in ${lang}`, async ({ page }) => {
  const { writes, dailyRequests } = await mockPOS(page, { lang })
  await page.goto(`/pos/${id}/end-of-day`)
  await expect(page.getByTestId('daily-closeout')).toContainText('4,157.00')
  await expect(page.locator('#closeout-day')).toHaveValue('2026-10-20')
  await expect(page.getByTestId('shift-period')).toContainText(lang === 'ar' ? 'أكثر من يوم' : 'more than one day')
  await expect(page.locator('[data-closeout-metric]').first()).toContainText('12,235.50')
  await expect(page.locator('#closing-cash')).toHaveValue('')
  expect(dailyRequests.at(-1)).toEqual({ p_branch_id: id, p_from: '2026-10-20', p_to: '2026-10-20' })
  expect(writes).toEqual([])
  await page.screenshot({ path: test.info().outputPath(`closeout-${lang}.png`), fullPage: true })
  await page.locator('#closeout-day').fill('2026-10-19')
  await expect(page.getByTestId('daily-closeout')).toContainText('2,772.50')
  await expect(page.getByTestId('daily-closeout')).not.toContainText('4,157.00')
  await expect(page.locator('[data-closeout-metric]').first()).toContainText('12,235.50')
})

test('failed daily report shows unavailable, not a fabricated zero or prior total', async ({ page }) => {
  await mockPOS(page, { failedDaily: true })
  await page.goto(`/pos/${id}/end-of-day`)
  await expect(page.getByTestId('daily-closeout')).toContainText('Daily sales unavailable')
  await expect(page.getByTestId('daily-closeout')).not.toContainText('4,157')
  await expect(page.locator('[data-closeout-metric]').first()).toContainText('12,235.50')
})

test('ready products are usable while categories are still delayed', async ({ page }) => {
  await mockPOS(page, { slowCategories: true })
  await page.goto(`/pos/${id}`)
  await expect(page.getByRole('button', { name: /Ready coffee/ })).toBeVisible({ timeout: 5000 })
})
