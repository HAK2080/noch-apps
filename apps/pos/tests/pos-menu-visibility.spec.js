import { test, expect } from '@playwright/test'
import { Buffer } from 'node:buffer'

for (const lang of ['ar', 'en']) {
  test(`POS actions and closing menu fit the screen in ${lang}`, async ({ page }) => {
    const id = '10000000-0000-4000-8000-000000000001'
    const user = { id, email: 'toolbar-test@example.invalid', role: 'authenticated', aud: 'authenticated' }
    const expires = Math.floor(Date.now() / 1000) + 3600
    const token = [
      Buffer.from('{"alg":"HS256"}').toString('base64url'),
      Buffer.from(JSON.stringify({ sub: id, role: 'authenticated', exp: expires })).toString('base64url'),
      'test-signature',
    ].join('.')
    await page.addInitScript(({ user, token, expires, lang }) => {
      localStorage.setItem('noch_lang', lang)
      localStorage.setItem('pos-tile-lang', lang)
      localStorage.setItem('noch_pos_served_by', JSON.stringify({ id: user.id, full_name: 'Cashier long name' }))
      localStorage.setItem('noch_pos_served_by_exp', String(Date.now() + 3600000))
      localStorage.setItem('sb-kxqjasdvoohiexedtfqw-auth-token', JSON.stringify({
        user, access_token: token, refresh_token: 'mock', expires_at: expires, expires_in: 3600, token_type: 'bearer',
      }))
    }, { user, token, expires, lang })
    await page.route('https://kxqjasdvoohiexedtfqw.supabase.co/**', async route => {
      const url = route.request().url()
      let body = []
      if (url.includes('/rpc/my_profile_v2')) body = [{ ...user, role: 'staff', full_name: 'Cashier long name', access_enabled: true }]
      else if (url.includes('/role_permissions')) body = ['pos', 'expenses', 'products', 'inventory'].map(feature => ({ feature, can_access: true, can_edit: true }))
      else if (url.includes('/pos_settings')) body = { require_pin: false, block_duplicate_tabs: false }
      else if (url.includes('/pos_branches')) body = { id, name: 'Noch - City Walk', is_active: true }
      else if (url.includes('/pos_shifts')) body = [{ id, status: 'open', opened_at: new Date().toISOString() }]
      await route.fulfill({ json: body })
    })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`/pos/${id}`)
    const header = page.locator('header').filter({ has: page.getByPlaceholder(lang === 'ar' ? 'بحث عن منتج…' : 'Search products…') })
    await header.waitFor()
    const fits = async locator => {
      const box = await locator.boundingBox()
      expect(box).not.toBeNull()
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width + 1)
    }
    for (const button of await header.getByRole('button').all()) await fits(button)
    await header.getByRole('button').last().click()
    for (const name of lang === 'ar' ? ['الإعدادات', 'إقفال اليوم'] : ['Settings', 'End of Day']) {
      const action = header.getByRole('button', { name, exact: true })
      await expect(action).toBeVisible()
      await fits(action)
      await action.click({ trial: true })
    }
    expect(errors).toEqual([])
    await page.screenshot({ path: test.info().outputPath(`pos-actions-${lang}.png`) })
  })
}
