import { test, expect } from '@playwright/test'

const fixture = '/tests/fixtures/ceo-stock.html'
const summary = { money_in: 5000, money_out: 2000, balance: 3000, payroll_estimate: 1000, invoice_total: 1700, invoice_count: 4, observation: null, baseline_date: null }

test.beforeEach(async ({ page }) => {
  await page.route('**/rest/v1/ops_settings**', route => route.fulfill({ json: { module_enabled: false } }))
})

test('CEO defaults to month to date, supports dates and saves real balances without counting estimate as spending', async ({ page }) => {
  let dates, saved
  await page.route('**/rpc/ceo_money_overview', route => {
    dates = route.request().postDataJSON()
    return route.fulfill({ json: saved ? { ...summary, observation: { as_of: saved.p_as_of, cash_lyd: saved.p_cash, bank_lyd: saved.p_bank }, baseline_date: '2026-08-31', expected_cash: 1010, expected_bank: 2000, cash_difference: -10, bank_difference: 0 } : summary })
  })
  await page.route('**/rpc/save_ceo_balances', route => { saved = route.request().postDataJSON(); return route.fulfill({ json: 'observation-id' }) })
  await page.goto(fixture)
  await expect(page.getByText('3,000.00 LYD', { exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/ceo-desktop.png', fullPage: true })
  expect(dates.p_from).toBe(`${dates.p_to.slice(0, 7)}-01`)
  await page.getByLabel('From', { exact: true }).fill('2026-08-01')
  await expect.poll(() => dates.p_from).toBe('2026-08-01')
  await page.getByRole('button', { name: 'Update balances' }).click()
  await page.getByLabel('Balance date', { exact: true }).fill('2026-09-01')
  await page.getByLabel('Actual cash (LYD)', { exact: true }).fill('1000')
  await page.getByLabel('Actual bank (LYD)', { exact: true }).fill('2000')
  await page.getByRole('button', { name: 'Save balances' }).click()
  await expect(page.getByText('Difference to check', { exact: true })).toBeVisible()
  expect(saved).toMatchObject({ p_as_of: '2026-09-01', p_cash: 1000, p_bank: 2000 })
  await expect(page.getByText('Cash: -10.00 LYD · Bank: 0.00 LYD', { exact: true })).toBeVisible()
})

test('failed or invalid date queries do not display stale money', async ({ page }) => {
  let fail = false
  await page.route('**/rpc/ceo_money_overview', route => route.fulfill(fail ? { status: 400, json: { message: 'Finance unavailable' } } : { json: summary }))
  await page.goto(fixture)
  await expect(page.getByText('3,000.00 LYD', { exact: true })).toBeVisible()
  fail = true
  await page.getByRole('button', { name: 'Refresh overview' }).click()
  await expect(page.getByRole('alert')).toContainText('Finance unavailable')
  await expect(page.getByText('3,000.00 LYD', { exact: true })).toHaveCount(0)
  await page.getByLabel('From', { exact: true }).fill('2030-01-01')
  await expect(page.getByRole('alert')).toContainText('start date on or before')
})

test('blocked product stays visible with shaded image; pointer and keyboard cannot add until unblocked', async ({ page }) => {
  await page.goto(`${fixture}?stock`)
  const product = page.getByRole('button', { name: /Chocolate cake/ })
  await expect(product).toHaveAttribute('aria-disabled', 'true')
  await expect(product.locator('.brightness-50')).toBeVisible()
  await product.click({ force: true })
  await product.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText('Cart: 0')).toBeVisible()
  await page.getByRole('button', { name: 'Toggle stock' }).click()
  await expect(product).toHaveAttribute('aria-disabled', 'false')
  await product.click()
  await expect(page.getByText('Cart: 1')).toBeVisible()
})

test('CEO is usable on a phone without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('**/rpc/ceo_money_overview', route => route.fulfill({ json: summary }))
  await page.goto(fixture)
  await expect(page.getByText('3,000.00 LYD', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/ceo-mobile.png', fullPage: true })
})
