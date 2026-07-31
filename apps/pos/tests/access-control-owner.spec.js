import { test, expect } from '@playwright/test'

test('owner sees audited account and module controls in both languages', async ({ page }) => {
  await page.goto('/staff/roles')
  await expect(page.getByRole('heading', { name: 'Roles and access' })).toBeVisible({ timeout: 15000 })
  await expect(page.getByRole('heading', { name: 'Account access' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Module permissions' })).toBeVisible()
  await expect(page.getByText('The old data-entry role is archived.', { exact: false })).toBeVisible()

  await page.getByRole('button', { name: 'Switch to Arabic' }).click()
  await expect(page.getByRole('heading', { name: 'الأدوار والوصول' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'دخول الحسابات' })).toBeVisible()
})
