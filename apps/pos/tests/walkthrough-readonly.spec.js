// @ts-check
import { test, expect } from '@playwright/test'

const ROUTES = [
  '/dashboard',
  '/expenses',
  '/inventory',
  '/inventory/procurement',
  '/sales',
  '/pos',
  '/finance',
  '/accounting',
  '/analytics-legacy',
  '/marketing',
  '/products',
  '/loyalty',
  '/content-studio',
]

test.describe('Read-only app walkthrough', () => {
  for (const route of ROUTES) {
    test(`${route} loads without crashing`, async ({ page }) => {
      const errors = []
      page.on('console', msg => {
        if (msg.type() === 'error') errors.push(msg.text())
      })
      page.on('pageerror', err => errors.push(err.message))

      await page.goto(route)
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1500)

      await expect(page, `${route} should not redirect to login`).not.toHaveURL(/\/login/)
      const html = await page.content()
      expect(html.length, `${route} should render content`).toBeGreaterThan(500)
      expect(errors.slice(0, 3), `${route} console/page errors`).toEqual([])
    })
  }

  test('Arabic mode translates internal Expenses and Procurement labels', async ({ page }) => {
    await page.goto('/expenses')
    await page.evaluate(() => localStorage.setItem('noch_lang', 'ar'))
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByText('\u0627\u0644\u0645\u0635\u0627\u0631\u064a\u0641').first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('\u0625\u062f\u062e\u0627\u0644').first()).toBeVisible({ timeout: 10000 })

    await page.goto('/inventory/procurement')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByText('\u0623\u0648\u0627\u0645\u0631 \u0627\u0644\u0634\u0631\u0627\u0621').first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('\u0625\u0636\u0627\u0641\u0629 \u0623\u0645\u0631').first()).toBeVisible({ timeout: 10000 })
  })

  test('Accounting exposes payables without crashing', async ({ page }) => {
    const errors = []
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })
    page.on('pageerror', err => errors.push(err.message))

    await page.goto('/accounting')
    await page.waitForLoadState('domcontentloaded')
    await page.getByRole('button', { name: /Payables/i }).click()
    await expect(page.getByText(/Supplier invoices|Open AP/i).first()).toBeVisible({ timeout: 10000 })
    expect(errors.slice(0, 3), 'accounting payables console/page errors').toEqual([])
  })

  test('Accounting statements render without crashing', async ({ page }) => {
    await page.goto('/accounting')
    await page.waitForLoadState('domcontentloaded')
    await page.getByRole('button', { name: /Statements/i }).click()
    await expect(page.getByText(/Income statement|Balance sheet/i).first()).toBeVisible({ timeout: 10000 })
  })

  test('Analytics legacy redirects to finance', async ({ page }) => {
    await page.goto('/analytics-legacy')
    await page.waitForLoadState('domcontentloaded')
    await expect(page).toHaveURL(/\/finance/)
  })

  test('POS selling entrypoint loads without posting a sale', async ({ page }) => {
    await page.goto('/pos')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByText(/Point of Sale|No branches found/i).first()).toBeVisible({ timeout: 10000 })

    const branchHeading = page.locator('h3').first()
    if (await branchHeading.count()) {
      await expect(branchHeading).toBeVisible()
      await expect(page.getByText(/Shift open|No open shift|Open Shift/i).first()).toBeVisible({ timeout: 10000 })
    }
  })

  test('Legacy content routes redirect to supported surfaces', async ({ page }) => {
    await page.goto('/content/create')
    await page.waitForLoadState('domcontentloaded')
    await expect(page).toHaveURL(/\/content\/studio/)

    await page.goto('/content/research')
    await page.waitForLoadState('domcontentloaded')
    await expect(page).toHaveURL(/\/content$/)
  })
})
