// @ts-check
import { test as setup, expect } from '@playwright/test';

setup('authenticate as owner', async ({ page }) => {
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  await page.fill('input[type="email"]', 'aerohaith@gmail.com');
  await page.fill('input[type="password"]', 'Noch2026');

  // Wait for the password API response before checking URL
  const [tokenResponse] = await Promise.all([
    page.waitForResponse(r => r.url().includes('token?grant_type=password'), { timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);

  expect(tokenResponse.status(), 'Login API should return 200').toBe(200);

  // Wait for either dashboard or my-tasks (the app redirects based on role)
  await page.waitForURL(/\/(dashboard|my-tasks)/, { timeout: 20000 });

  // Save storage state (includes localStorage with Supabase session)
  await page.context().storageState({ path: 'tests/.auth/owner.json' });
  console.log('Owner auth saved. URL:', page.url());
  console.log('Console errors during setup:', errors.slice(0, 5));
});
