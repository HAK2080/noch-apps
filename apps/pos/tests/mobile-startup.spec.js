import { test, expect } from '@playwright/test'
import { Buffer } from 'node:buffer'

for (const role of ['staff', 'owner']) {
  test(`${role} saved login opens the workspace without rendering menu dividers as icons`, async ({ page }) => {
    const id = '10000000-0000-4000-8000-000000000001'
    const user = { id, email: 'startup-test@example.invalid', role: 'authenticated', aud: 'authenticated' }
    const profile = { ...user, role, full_name: 'Startup test', access_enabled: true, is_active: true }
    const expires = Math.floor(Date.now() / 1000) + 3600
    const token = [
      Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
      Buffer.from(JSON.stringify({ sub: id, role: 'authenticated', aud: 'authenticated', exp: expires })).toString('base64url'),
      'test-signature',
    ].join('.')
    await page.addInitScript(({ user, token, expires }) => {
      localStorage.setItem('noch_lang', 'en')
      localStorage.setItem('sb-kxqjasdvoohiexedtfqw-auth-token', JSON.stringify({
        access_token: token, refresh_token: 'mock-refresh', expires_at: expires, expires_in: 3600, token_type: 'bearer', user,
      }))
    }, { user, token, expires })
    await page.route('https://kxqjasdvoohiexedtfqw.supabase.co/**', async route => {
      const url = route.request().url()
      let body = []
      if (url.includes('/rpc/my_profile_v2')) body = [profile]
      else if (url.includes('/rpc/get_ceo_forecast')) body = { items: [], today: '2026-10-16', month_end: '2026-10-31', target_date: '2026-10-31', rent_covered: false, bills_covered: false }
      else if (url.includes('/rpc/ceo_money_overview')) body = { money_in: 0, money_out: 0 }
      else if (url.includes('/role_permissions')) body = ['pos', 'expenses', 'products', 'inventory'].map(feature => ({ feature, can_access: true, can_edit: true }))
      else if (url.includes('/pos_branches')) body = [{ id, name: 'City Walk test', is_active: true, operational_status: 'operating' }]
      else if (url.includes('/auth/v1/user')) body = user
      await route.fulfill({ json: body })
    })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('/login')
    await expect(page).toHaveURL(role === 'owner' ? /\/overview$/ : /\/pos$/, { timeout: 15000 })
    if (role === 'owner') {
      await expect(page.getByRole('heading', { name: 'Your money, at a glance' })).toBeVisible()
    } else {
      await expect(page.getByRole('heading', { name: /Point of Sale|نقطة البيع/ })).toBeVisible()
    }
    const mobile = test.info().project.name === 'android'
    if (mobile) {
      await page.getByRole('button', { name: 'More', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'All available pages' })).toBeVisible()
      await page.getByRole('button', { name: 'Close', exact: true }).click()
    }
    await page.getByRole('button', { name: mobile ? 'Search' : /Search.*K/, exact: mobile }).filter({ visible: true }).click()
    await expect(page.getByRole('dialog', { name: 'Search workspace' })).toBeVisible()
    expect(errors).toEqual([])
  })
}
