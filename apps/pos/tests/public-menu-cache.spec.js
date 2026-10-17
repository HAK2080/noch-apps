import { test, expect } from '@playwright/test'
const branch = '8936e821-ad7f-4d69-b654-c2f76404f89f'
const snapshot = {
  version: 1, branch: { id: branch, name: 'Noch - City Walk' },
  categories: [{ id: 'coffee', name: 'Coffee', name_ar: 'قهوة', menu_display_style: 'grid' }],
  products: [{ id: 'test-product', name: 'Latte', name_ar: 'لاتيه', price: 15, category_id: 'coffee' }],
}
for (const fallback of [false, true]) {
  test(`menu, item detail and cart survive ${fallback ? 'cache outage' : 'shared cache hit'}`, async ({ page }) => {
    const database = []
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.route('https://apps.noch.cloud/api/public-menu/**', route => route.fulfill(fallback ? { status: 503, json: {} } : { json: snapshot }))
    await page.route('https://kxqjasdvoohiexedtfqw.supabase.co/**', route => {
      const url = route.request().url()
      database.push(url)
      let body = []
      if (url.includes('/pos_branches')) body = snapshot.branch
      else if (url.includes('/pos_categories')) body = snapshot.categories
      else if (url.includes('/pos_products')) body = snapshot.products
      else if (url.includes('/get_customer_sale_availability')) body = [{ product_id: 'test-product', available: true }]
      return route.fulfill({ json: body })
    })
    await page.goto('/menu/' + branch)
    const product = page.getByRole('button', { name: 'لاتيه', exact: true })
    await expect(product).toBeVisible()
    expect(database.length).toBe(fallback ? 4 : 0)
    await product.click()
    await expect(page.locator('.detail-card')).toBeVisible()
    await page.locator('.detail-close').click()
    await page.locator('.grid-card-footer button, .scroll-card-footer button, .list-row-add').first().click()
    await expect(page.locator('.cart-bar')).toBeVisible()
    expect(errors).toEqual([])
  })
}
