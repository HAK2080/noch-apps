// @ts-check
import { test, expect } from '@playwright/test'

async function clickTab(page, name) {
  const tab = page.locator('button').filter({ hasText: name }).first()
  await tab.scrollIntoViewIfNeeded()
  await tab.click()
}

test.describe('Roadmap smoke coverage', () => {
  test('expenses register renders the canonical finance read model', async ({ page }) => {
    await page.goto('/finance')
    await page.waitForLoadState('domcontentloaded')

    await clickTab(page, /Expenses/i)
    await expect(page.getByText(/consolidated expense register|Total OpEx|No approved expenses in this period/i).first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/Canonical workflow|expense_entries|Open Expenses module/i).first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/Recurring expense scaffolding|By category|Top category/i).first()).toBeVisible({ timeout: 10000 })
  })

  test('procurement workspace exposes payables, receiving, returns, and warehouse signals', async ({ page }) => {
    await page.goto('/inventory/procurement')
    await page.waitForLoadState('domcontentloaded')

    await expect(page.getByText(/Outstanding supplier invoices|Stock valuation|Recent supplier price updates|No procurement orders/i).first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/Payables snapshot|supplier invoices, due dates, and paid status|No supplier invoices in the payable register yet/i).first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/Reorder suggestions|Warehouse signals|recent receipts|No procurement orders/i).first()).toBeVisible({ timeout: 10000 })
  })

  test('accounting reports expose AP aging, supplier statement, cash flow, and P&L drill-down', async ({ page }) => {
    await page.goto('/accounting')
    await page.waitForLoadState('domcontentloaded')

    await clickTab(page, /Payables|ط­ط³ط§ط¨ط§طھ ط§ظ„ظ…ظˆط±ط¯ظٹظ†/i)
    await expect(page.getByText(/Open AP|Overdue|Unpaid invoices/i).first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/Supplier statement|Select supplier/i).first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/Cash flow statement|Net cash movement/i).first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/P&L drill-down|No statement lines for this period/i).first()).toBeVisible({ timeout: 10000 })
  })

  test('pos shell opens a payment modal without creating a live sale', async ({ page }) => {
    await page.goto('/pos')
    await page.waitForLoadState('domcontentloaded')

    const branchLink = page.locator('a[href^="/pos/"]').first()
    if (await branchLink.count() === 0) {
      await expect(page.getByText(/Point of Sale|No branches found/i).first()).toBeVisible({ timeout: 10000 })
      return
    }

    const href = await branchLink.getAttribute('href')
    await page.goto(href)
    await page.waitForLoadState('domcontentloaded')

    const shiftPrompt = page.getByText(/No open shift|Open Shift/i).first()
    if (await shiftPrompt.count()) {
      await expect(shiftPrompt).toBeVisible({ timeout: 10000 })
      return
    }

    const productTile = page.locator('button').filter({ hasText: /LYD/ }).first()
    const emptyState = page.getByText(/No products in this category|No results for/i).first()
    if (await productTile.count() === 0) {
      await expect(emptyState).toBeVisible({ timeout: 10000 })
      return
    }

    await productTile.click()
    const chargeButton = page.locator('button').filter({ hasText: /Charge .* LYD/i }).first()
    await expect(chargeButton).toBeVisible({ timeout: 10000 })
    await chargeButton.click()

    const paymentText = page.getByText(/Payment|Cash Tendered|Confirm card|Complete sale/i).first()
    await expect(paymentText).toBeVisible({ timeout: 10000 })
    await page.keyboard.press('Escape')
    await expect(paymentText).not.toBeVisible({ timeout: 10000 })
  })
})
