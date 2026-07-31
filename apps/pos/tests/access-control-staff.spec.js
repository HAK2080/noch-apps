import { test, expect } from '@playwright/test'

test('staff mobile navigation exposes all granted pages and direct URLs fail closed', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/(pos|dashboard|expenses|inventory|my-tasks)/, { timeout: 15000 })

  await page.getByRole('button', { name: 'More' }).click()
  await expect(page.getByRole('heading', { name: 'All available pages' })).toBeVisible()
  await expect(page.getByRole('button', { name: /My profile/i })).toBeVisible()

  await page.goto('/finance')
  await expect(page.getByRole('heading', { name: 'This page is not available for your role' })).toBeVisible()
})
