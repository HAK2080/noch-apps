import { expect, test } from '@playwright/test'

const fixture = '/tests/fixtures/settings.html'
async function policy(context, initial = false) {
  const state = { enabled: initial, error: false }
  await context.route('https://settings-test.supabase.co/rest/v1/pos_settings**', route =>
    state.error ? route.abort() : route.fulfill({ json: { block_duplicate_tabs: state.enabled } }))
  return state
}
const refresh = page => page.evaluate(() => window.dispatchEvent(new Event('pos-settings-changed')))
const terminal = page => page.getByRole('heading', { name: 'Test terminal' })

test('default off permits two POS tabs', async ({ context, page }) => {
  await policy(context)
  const second = await context.newPage()
  await Promise.all([page.goto(fixture), second.goto(fixture)])
  await expect(terminal(page)).toBeVisible()
  await expect(terminal(second)).toBeVisible()
})

test('enabled: simultaneous opens admit exactly one tab, then closing it admits the waiting tab', async ({ context, page }) => {
  await policy(context, true)
  const second = await context.newPage()
  await Promise.all([page.goto(fixture), second.goto(fixture)])
  await expect.poll(async () => Number(await terminal(page).isVisible()) + Number(await terminal(second).isVisible())).toBe(1)
  const [active, waiting] = await terminal(page).isVisible() ? [page, second] : [second, page]
  await expect(waiting.getByRole('heading', { name: 'POS is already open' })).toBeVisible()
  await active.close()
  await expect(terminal(waiting)).toBeVisible()
})

test('on/off changes apply to open tabs and preserve their existing carts', async ({ context, page }) => {
  const state = await policy(context)
  const second = await context.newPage()
  await page.goto(fixture)
  await second.goto(fixture)
  await page.getByLabel('Cart note').fill('Keep first cart')
  await second.getByLabel('Cart note').fill('Keep second cart')
  state.enabled = true
  await refresh(page)
  await expect.poll(() => page.evaluate(async () => (await navigator.locks.query()).held.length)).toBe(1)
  await refresh(second)
  await expect(terminal(second)).toBeHidden()
  state.enabled = false
  await Promise.all([refresh(page), refresh(second)])
  await expect(terminal(page)).toBeVisible()
  await expect(terminal(second)).toBeVisible()
  await expect(page.getByLabel('Cart note')).toHaveValue('Keep first cart')
  await expect(second.getByLabel('Cart note')).toHaveValue('Keep second cart')
})

test('closing a queued tab does not leave a stale request; refresh still leaves one active tab', async ({ context, page }) => {
  await policy(context, true)
  await page.goto(fixture)
  await expect(terminal(page)).toBeVisible()
  const waiting = await context.newPage()
  await waiting.goto(fixture)
  await expect(waiting.getByText('POS is already open', { exact: true })).toBeVisible()
  await waiting.close()
  await page.reload()
  await expect(terminal(page)).toBeVisible()
  await expect.poll(() => page.evaluate(async () => (await navigator.locks.query()).pending.length)).toBe(0)
})

test('other branches and separate browser profiles remain independent', async ({ context, page, browser }) => {
  await policy(context, true)
  await page.goto(fixture)
  await expect(terminal(page)).toBeVisible()
  const otherBranch = await context.newPage()
  await otherBranch.goto(`${fixture}?branch=branch-b`)
  await expect(terminal(otherBranch)).toBeVisible()
  const otherContext = await browser.newContext()
  try {
    await policy(otherContext, true)
    const otherDevice = await otherContext.newPage()
    await otherDevice.goto(`http://127.0.0.1:4187${fixture}`)
    await expect(terminal(otherDevice)).toBeVisible()
  } finally { await otherContext.close() }
})

test('network failure retains the confirmed restriction on reload', async ({ context, page }) => {
  const state = await policy(context, true)
  await page.goto(fixture)
  await expect(terminal(page)).toBeVisible()
  state.error = true
  const second = await context.newPage()
  await second.goto(fixture)
  await expect(second.getByText('POS is already open', { exact: true })).toBeVisible({ timeout: 15000 })
  await expect(terminal(second)).toHaveCount(0)
})

test('unsupported browser blocks when enabled and permits POS when disabled', async ({ context, page }) => {
  const state = await policy(context, true)
  await page.addInitScript(() => Object.defineProperty(navigator, 'locks', { value: undefined }))
  await page.goto(fixture)
  await expect(page.getByText(/This browser cannot enforce/)).toBeVisible()
  await expect(terminal(page)).toHaveCount(0)
  state.enabled = false
  await refresh(page)
  await expect(terminal(page)).toBeVisible()
})

test('expense switch persists on and off and does not falsely change on failed saves', async ({ context, page }) => {
  let enabled = false
  let fail = false
  await context.route('https://settings-test.supabase.co/rest/v1/expense_approval_settings**', route =>
    route.fulfill({ json: { auto_approve: enabled } }))
  await context.route('https://settings-test.supabase.co/rest/v1/rpc/set_expense_auto_approval', route => {
    if (fail) return route.fulfill({ status: 403, json: { message: 'Only an owner can change expense auto-approval' } })
    enabled = route.request().postDataJSON().p_enabled
    return route.fulfill({ json: { auto_approve: enabled } })
  })
  await page.goto(`${fixture}?view=expenses`)
  const toggle = page.getByRole('switch', { name: 'Auto-approve all new expenses' })
  await expect(toggle).not.toBeChecked()
  await toggle.click()
  await expect(toggle).toBeChecked()
  await page.reload()
  await expect(toggle).toBeChecked()
  fail = true
  await toggle.click()
  await expect(page.getByText('Only an owner can change expense auto-approval', { exact: true })).toBeVisible()
  await expect(toggle).toBeChecked()
  fail = false
  await toggle.click()
  await expect(toggle).not.toBeChecked()
})

test('expense setting load failure disables its switch', async ({ context, page }) => {
  await context.route('https://settings-test.supabase.co/rest/v1/expense_approval_settings**', route =>
    route.fulfill({ status: 500, json: { message: 'Unavailable' } }))
  await page.goto(`${fixture}?view=expenses`)
  await expect(page.getByRole('alert')).toContainText('Could not load approval settings')
  await expect(page.getByRole('switch')).toBeDisabled()
})
