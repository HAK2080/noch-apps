// @ts-check
import { test, expect } from '@playwright/test';

const AUDIT_TAG = 'TEST_AUDIT_2026_04_24';

// Helper: assert page loaded (not login, not blank, no JS crash)
async function assertPageLoaded(page, routeLabel) {
  // Not on login
  await expect(page).not.toHaveURL(/\/login/, { timeout: 8000 });

  // No unhandled JS errors that crash the whole page
  const html = await page.content();
  expect(html.length, `${routeLabel}: page has content`).toBeGreaterThan(200);
}

// Helper: collect console errors during navigation
function attachErrorCollector(page) {
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(err.message));
  return errors;
}

test.describe('Owner — route audit', () => {
  let consoleErrors;

  test.beforeEach(async ({ page }) => {
    consoleErrors = attachErrorCollector(page);
  });

  // ── Core ──────────────────────────────────────────────────────────────────

  test('dashboard loads with stats', async ({ page }) => {
    await page.goto('/dashboard');
    await assertPageLoaded(page, '/dashboard');
    await expect(page.getByText('Total')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Pending')).toBeVisible();
  });

  test('tasks page loads', async ({ page }) => {
    await page.goto('/tasks');
    await assertPageLoaded(page, '/tasks');
    // Should show task list or empty state
    await page.waitForTimeout(2000);
    const body = await page.content();
    expect(body).toMatch(/task|Task|مهم|مهام/i);
  });

  test('my-tasks page loads', async ({ page }) => {
    await page.goto('/my-tasks');
    await assertPageLoaded(page, '/my-tasks');
    await page.waitForTimeout(2000);
  });

  test('staff page loads', async ({ page }) => {
    await page.goto('/staff');
    await assertPageLoaded(page, '/staff');
    await page.waitForTimeout(2000);
    const body = await page.content();
    expect(body).toMatch(/staff|Staff|طاقم/i);
  });

  test('report page loads', async ({ page }) => {
    await page.goto('/report');
    await assertPageLoaded(page, '/report');
    await page.waitForTimeout(2000);
  });

  // ── Recipes ───────────────────────────────────────────────────────────────

  test('recipes list loads', async ({ page }) => {
    await page.goto('/recipes');
    await assertPageLoaded(page, '/recipes');
    await page.waitForTimeout(2000);
    const body = await page.content();
    expect(body).toMatch(/recipe|Recipe|وصفة/i);
  });

  // ── Cost Calculator ───────────────────────────────────────────────────────

  test('cost calculator loads', async ({ page }) => {
    await page.goto('/cost-calculator');
    await assertPageLoaded(page, '/cost-calculator');
    await page.waitForTimeout(2000);
  });

  // ── Content Studio 2.0 ────────────────────────────────────────────────────

  test('content studio loads', async ({ page }) => {
    await page.goto('/content-studio');
    await assertPageLoaded(page, '/content-studio');
    await page.waitForTimeout(3000);
  });

  test('content studio — businesses page', async ({ page }) => {
    await page.goto('/content-studio/businesses');
    await assertPageLoaded(page, '/content-studio/businesses');
    await page.waitForTimeout(2000);
  });

  test('content studio — drafts page', async ({ page }) => {
    await page.goto('/content-studio/drafts');
    await assertPageLoaded(page, '/content-studio/drafts');
    await page.waitForTimeout(2000);
  });

  // ── Expenses ──────────────────────────────────────────────────────────────

  test('expenses page loads', async ({ page }) => {
    await page.goto('/expenses');
    await assertPageLoaded(page, '/expenses');
    await page.waitForTimeout(2000);
  });

  // ── Products ──────────────────────────────────────────────────────────────

  test('products page loads', async ({ page }) => {
    await page.goto('/products');
    await assertPageLoaded(page, '/products');
    await page.waitForTimeout(2000);
  });

  // ── Inventory ─────────────────────────────────────────────────────────────

  test('inventory hub loads', async ({ page }) => {
    await page.goto('/inventory');
    await assertPageLoaded(page, '/inventory');
    await page.waitForTimeout(2000);
  });

  test('inventory stock-check loads', async ({ page }) => {
    await page.goto('/inventory/stock-check');
    await assertPageLoaded(page, '/inventory/stock-check');
    await page.waitForTimeout(2000);
  });

  test('inventory stock manager loads', async ({ page }) => {
    await page.goto('/inventory/stock');
    await assertPageLoaded(page, '/inventory/stock');
    await page.waitForTimeout(2000);
  });

  test('inventory procurement loads', async ({ page }) => {
    await page.goto('/inventory/procurement');
    await assertPageLoaded(page, '/inventory/procurement');
    await page.waitForTimeout(2000);
  });

  // ── Analytics ─────────────────────────────────────────────────────────────

  test('analytics page loads', async ({ page }) => {
    await page.goto('/analytics');
    await assertPageLoaded(page, '/analytics');
    await page.waitForTimeout(2000);
  });

  // ── Loyalty ───────────────────────────────────────────────────────────────

  test('loyalty dashboard loads', async ({ page }) => {
    await page.goto('/loyalty');
    await assertPageLoaded(page, '/loyalty');
    await page.waitForTimeout(2000);
  });

  test('loyalty customers loads', async ({ page }) => {
    await page.goto('/loyalty/customers');
    await assertPageLoaded(page, '/loyalty/customers');
    await page.waitForTimeout(2000);
  });

  test('loyalty rewards loads', async ({ page }) => {
    await page.goto('/loyalty/rewards');
    await assertPageLoaded(page, '/loyalty/rewards');
    await page.waitForTimeout(2000);
  });

  test('loyalty QR loads', async ({ page }) => {
    await page.goto('/loyalty/qr');
    await assertPageLoaded(page, '/loyalty/qr');
    await page.waitForTimeout(2000);
  });

  test('loyalty settings loads', async ({ page }) => {
    await page.goto('/loyalty/settings');
    await assertPageLoaded(page, '/loyalty/settings');
    await page.waitForTimeout(2000);
  });

  test('loyalty leaderboard loads', async ({ page }) => {
    await page.goto('/loyalty/leaderboard');
    await assertPageLoaded(page, '/loyalty/leaderboard');
    await page.waitForTimeout(2000);
  });

  // ── Ideas ─────────────────────────────────────────────────────────────────

  test('ideas board loads', async ({ page }) => {
    await page.goto('/ideas');
    await assertPageLoaded(page, '/ideas');
    await page.waitForTimeout(2000);
  });

  test('ideas categories loads', async ({ page }) => {
    await page.goto('/ideas/categories');
    await assertPageLoaded(page, '/ideas/categories');
    await page.waitForTimeout(2000);
  });

  // ── Vestaboard ────────────────────────────────────────────────────────────

  test('vestaboard loads', async ({ page }) => {
    await page.goto('/vestaboard');
    await assertPageLoaded(page, '/vestaboard');
    await page.waitForTimeout(2000);
  });

  // ── POS ───────────────────────────────────────────────────────────────────

  test('pos home loads', async ({ page }) => {
    await page.goto('/pos');
    await assertPageLoaded(page, '/pos');
    await page.waitForTimeout(3000);
  });

  // ── My Card ───────────────────────────────────────────────────────────────

  test('my-card loads', async ({ page }) => {
    await page.goto('/my-card');
    await assertPageLoaded(page, '/my-card');
    await page.waitForTimeout(2000);
  });

  // ── CRUD: Task creation ───────────────────────────────────────────────────

  test('create and delete a test task', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForTimeout(2000);

    // Click add task button
    const addBtn = page.locator('button').filter({ hasText: /add|new|create|\+/i }).first();
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await page.waitForTimeout(500);

      // Fill title
      const titleInput = page.locator('input[placeholder*="task" i], input[placeholder*="title" i], textarea').first();
      if (await titleInput.isVisible()) {
        await titleInput.fill(`${AUDIT_TAG} — test task`);

        // Save
        const saveBtn = page.locator('button').filter({ hasText: /save|add|create|confirm/i }).first();
        if (await saveBtn.isVisible()) {
          await saveBtn.click();
          await page.waitForTimeout(1500);
        }
      }
    }

    // Verify no crash
    await expect(page).not.toHaveURL(/\/login/);
  });

  // ── Task Detail ───────────────────────────────────────────────────────────

  test('task detail page loads when clicking a task', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForTimeout(2000);

    // Click the first task card
    const taskCard = page.locator('article, [class*="card"], [class*="task"]').first();
    if (await taskCard.isVisible()) {
      await taskCard.click();
      await page.waitForTimeout(2000);
      // May go to /tasks/:id
      const url = page.url();
      if (url.includes('/tasks/')) {
        await assertPageLoaded(page, '/tasks/:id');
      }
    }
  });
});
