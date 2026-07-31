// @ts-check
import { test, expect } from '@playwright/test';

async function assertPageLoaded(page, routeLabel) {
  await expect(page).not.toHaveURL(/\/login/, { timeout: 8000 });
  const html = await page.content();
  expect(html.length, `${routeLabel}: page has content`).toBeGreaterThan(200);
}

test.describe('Staff — route audit (Mohamed)', () => {
  test('lands on the first granted daily workflow after login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/pos$/, { timeout: 10000 });
  });

  test('my-tasks page loads', async ({ page }) => {
    await page.goto('/my-tasks');
    await assertPageLoaded(page, '/my-tasks');
    await expect(page.getByRole('heading', { name: 'My Tasks' })).toBeVisible({ timeout: 10000 });
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

  test('loyalty admin is explicitly denied to staff', async ({ page }) => {
    await page.goto('/loyalty');
    await expect(page.getByRole('heading', { name: 'This page is not available for your role' })).toBeVisible();
  });

  test('loyalty customer records are explicitly denied to staff', async ({ page }) => {
    await page.goto('/loyalty/customers');
    await expect(page.getByRole('heading', { name: 'This page is not available for your role' })).toBeVisible();
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

  test('removed staff loyalty card route returns to the granted landing page', async ({ page }) => {
    await page.goto('/my-card');
    await expect(page).toHaveURL(/\/pos$/, { timeout: 10000 });
  });

  test('pos home loads for staff', async ({ page }) => {
    await page.goto('/pos');
    await assertPageLoaded(page, '/pos');
    await page.waitForTimeout(2000);
  });

  test('ungranted dashboard is explicitly denied to staff', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'This page is not available for your role' })).toBeVisible();
  });

  test('finance permission check fails closed with an explanation', async ({ page }) => {
    await page.goto('/finance');
    await expect(page.getByRole('heading', { name: 'This page is not available for your role' })).toBeVisible();
  });
});
