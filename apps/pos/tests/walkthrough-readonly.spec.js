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
  '/messages',
  '/products',
  '/loyalty',
  '/content-studio',
]

async function clickTab(page, name) {
  const tab = page.locator('button').filter({ hasText: name }).first()
  await tab.scrollIntoViewIfNeeded()
  await tab.click()
}

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
    await clickTab(page, /Payables|حسابات الموردين/i)
    await expect(page.getByText(/Supplier invoices|Open AP/i).first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/Supplier statement|Select supplier/i).first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/Cash flow statement|P&L drill-down/i).first()).toBeVisible({ timeout: 10000 })
    expect(errors.slice(0, 3), 'accounting payables console/page errors').toEqual([])
  })

  test('Expenses module exposes submit and review workflow affordances', async ({ page }) => {
    await page.goto('/expenses')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByText(/Submit Expense|Expenses/i).first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/My Expenses|Approve|Dashboard/i).first()).toBeVisible({ timeout: 10000 })
  })

  test('Finance expenses and bank scaffolding render without mutation', async ({ page }) => {
    await page.goto('/finance')
    await page.waitForLoadState('domcontentloaded')

    await clickTab(page, /Expenses/i)
    await expect(page.getByText(/consolidated expense register|Total OpEx|No approved expenses in this period/i).first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/Canonical workflow|Open Expenses module|Submit or approve expenses/i).first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/Recurring expense scaffolding|By category|Top category|No approved expenses in this period/i).first()).toBeVisible({ timeout: 10000 })

    await clickTab(page, /Bank/i)
    await expect(page.getByText(/Recon queue|No bank transactions yet/i).first()).toBeVisible({ timeout: 10000 })
  })

  test('Accounting statements render without crashing', async ({ page }) => {
    await page.goto('/accounting')
    await page.waitForLoadState('domcontentloaded')
    await clickTab(page, /Statements|القوائم المالية/i)
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

  test('Procurement exposes receiving controls and purchasing signals without posting changes', async ({ page }) => {
    await page.goto('/inventory/procurement')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByText(/Outstanding supplier invoices|Stock valuation|Recent supplier price updates|No procurement orders/i).first()).toBeVisible({ timeout: 10000 })

    const hasOrderRows = await page.locator('button[title*="Received"], button[title*="received"], button[title*="Purchase return"], button[title*="Pay Supplier Invoice"], button[title*="Pay supplier invoice"]').count()
    if (hasOrderRows > 0) {
      await expect(page.getByText(/Reorder suggestions|Warehouse signals/i).first()).toBeVisible({ timeout: 10000 })
    } else {
      await expect(page.getByText(/No procurement orders/i).first()).toBeVisible({ timeout: 10000 })
    }

    const receiveButton = page.locator('button[title*="Received"], button[title*="received"]').first()
    if (await receiveButton.count()) {
      await receiveButton.click()
      await expect(page.getByText(/Mark as Received|Receipt quantity/i).first()).toBeVisible({ timeout: 10000 })
      await page.keyboard.press('Escape')
    }

    const returnButton = page.locator('button[title*="Purchase return"]').first()
    if (await returnButton.count()) {
      await returnButton.click()
      await expect(page.getByText(/Purchase Return|Return quantity/i).first()).toBeVisible({ timeout: 10000 })
      await page.keyboard.press('Escape')
    }

    const payButton = page.locator('button[title*="Pay Supplier Invoice"], button[title*="Pay supplier invoice"]').first()
    if (await payButton.count()) {
      await payButton.click()
      await expect(page.getByText(/Pay Supplier Invoice|Payment Date/i).first()).toBeVisible({ timeout: 10000 })
      await page.keyboard.press('Escape')
    }
  })

  test('Legacy content routes redirect to supported surfaces', async ({ page }) => {
    await page.goto('/content')
    await page.waitForLoadState('domcontentloaded')
    await expect(page).toHaveURL(/\/content-studio$/)

    await page.goto('/content/studio')
    await page.waitForLoadState('domcontentloaded')
    await expect(page).toHaveURL(/\/content-studio$/)

    await page.goto('/content/research')
    await page.waitForLoadState('domcontentloaded')
    await expect(page).toHaveURL(/\/content-studio\/inspiration/)

    await page.goto('/content/ideas')
    await page.waitForLoadState('domcontentloaded')
    await expect(page).toHaveURL(/\/content-studio\/concepts/)

    await page.goto('/content/brand/setup')
    await page.waitForLoadState('domcontentloaded')
    await expect(page).toHaveURL(/\/content-studio\/businesses\/new/)
  })

  test('Messages page exposes notification outbox copy', async ({ page }) => {
    await page.goto('/messages')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByText(/Messages/i).first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/Notification outbox|loyalty, feedback, campaigns|No messages yet|New message/i).first()).toBeVisible({ timeout: 10000 })
  })

  test('Loyalty settings call out approved WhatsApp templates', async ({ page }) => {
    await page.goto('/loyalty/settings')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByText(/Template SID|approved WhatsApp template/i).first()).toBeVisible({ timeout: 10000 })
  })
})
