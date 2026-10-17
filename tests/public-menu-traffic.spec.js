import { test, expect } from '../apps/pos/node_modules/@playwright/test/index.mjs'

test('real public menu uses shared data and media without direct Supabase reads', async ({ page }) => {
  const direct = []
  const cache = []
  const media = []
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('requestfailed', request => { if (request.url().includes('/api/public-menu/')) console.log('Shared API failure:', request.failure()) })
  page.on('response', response => { if (response.url().includes('/api/public-menu/')) console.log('Shared API response:', response.status(), response.headers()['x-noch-menu-cache']) })
  page.on('request', request => {
    const url = request.url()
    if (url.includes('.supabase.co/rest/') || url.includes('.supabase.co/storage/')) direct.push(url)
    if (url.includes('/api/public-menu/')) cache.push(url)
    if (url.includes('apps.noch.cloud/media/')) media.push(url)
  })
  await page.goto('/menu/8936e821-ad7f-4d69-b654-c2f76404f89f')
  await expect(page.locator('.card-tap-area').first()).toBeVisible({ timeout: 20000 })
  await expect.poll(() => media.length).toBeGreaterThan(0)
  await expect.poll(() => page.locator('img[src*="apps.noch.cloud/media/"]').evaluateAll(images => images.filter(image => image.complete && image.naturalWidth > 0).length)).toBeGreaterThan(0)
  await page.locator('.card-tap-area').first().click()
  await expect(page.locator('.detail-card')).toBeVisible()
  await page.locator('.detail-close').click()
  await page.locator('.grid-card-footer button, .scroll-card-footer button').first().click()
  await expect(page.locator('.cart-bar')).toBeVisible()
  expect(cache).toHaveLength(1)
  expect(direct).toEqual([])
  expect(errors).toEqual([])
  console.log(JSON.stringify({ directSupabase: direct.length, sharedMenu: cache.length, cachedMedia: media.length }))
  await page.screenshot({ path: test.info().outputPath('public-menu-shared-cache.png') })
})
