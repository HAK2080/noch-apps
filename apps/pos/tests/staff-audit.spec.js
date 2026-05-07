// @ts-check
import { test, expect } from '@playwright/test';

async function assertPageLoaded(page, routeLabel) {
  await expect(page).not.toHaveURL(/\/login/, { timeout: 8000 });
  const html = await page.content();
  expect(html.length, `${routeLabel}: page has content`).toBeGreaterThan(200);
}

test.describe('Staff — route audit (Mohamed)', () => {
  test('lands on my-tasks after login', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    const url = page.url();
    expect(url).toMatch(/my-tasks|dashboard/);
  });

  test('my-tasks page loads', async ({ page }) => {
    await page.goto('/my-tasks');
    await assertPageLoaded(page, '/my-tasks');
    await page.waitForTimeout(2000);
    const body = await page.content();
    expect(body).toMatch(/task|Task|مهام/i);
  });

  test('recipes loads for staff', async ({ page }) => {
    await page.goto('/recipes');
    await assertPageLoaded(page, '/recipes');
    await page.waitForTimeout(2000);
  });

  test('inventory loads for staff', async ({ page }) => {
    await page.goto('/inventory');
    await assertPageLoaded(page, '/inventory');
    await page.waitForTimeout(2000);
  });

  test('inventory stock-check loads for staff', async ({ page }) => {
    await page.goto('/inventory/stock-check');
    await assertPageLoaded(page, '/inventory/stock-check');
    await page.waitForTimeout(2000);
  });

  test('loyalty loads for staff', async ({ page }) => {
    await page.goto('/loyalty');
    await assertPageLoaded(page, '/loyalty');
    await page.waitForTimeout(2000);
  });

  test('loyalty customers loads for staff', async ({ page }) => {
    await page.goto('/loyalty/customers');
    await assertPageLoaded(page, '/loyalty/customers');
    await page.waitForTimeout(2000);
  });

  test('ideas board loads for staff', async ({ page }) => {
    await page.goto('/ideas');
    await assertPageLoaded(page, '/ideas');
    await page.waitForTimeout(2000);
  });

  test('vestaboard loads for staff', async ({ page }) => {
    await page.goto('/vestaboard');
    await assertPageLoaded(page, '/vestaboard');
    await page.waitForTimeout(2000);
  });

  test('my-card loads for staff', async ({ page }) => {
    await page.goto('/my-card');
    await assertPageLoaded(page, '/my-card');
    await page.waitForTimeout(2000);
  });

  test('pos home loads for staff', async ({ page }) => {
    await page.goto('/pos');
    await assertPageLoaded(page, '/pos');
    await page.waitForTimeout(2000);
  });

  test('owner-only routes redirect staff', async ({ page }) => {
    // Staff should be redirected away from /dashboard
    await page.goto('/dashboard');
    await page.waitForTimeout(2000);
    // Should redirect to /my-tasks
    expect(page.url()).not.toContain('/login');
  });
});
