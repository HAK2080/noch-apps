// @ts-check
import { test as setup, expect } from '@playwright/test';

setup('authenticate as staff (Mohamed)', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[type="email"]', 'mohd.abdelazim2@noch.staff');
  await page.fill('input[type="password"]', 'noch2026');
  await page.click('button[type="submit"]');
  // Staff lands on /my-tasks
  await page.waitForURL('**/{my-tasks,dashboard}', { timeout: 15000 });
  await page.context().storageState({ path: 'tests/.auth/staff.json' });
});
