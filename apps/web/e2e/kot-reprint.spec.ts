import { test, expect } from '@playwright/test';

const TABLE_ID = 'table-e2e-kot';
const ORDER_ID = 'order-e2e-kot';
const ORDER_ITEM_ID = 'order-item-e2e-kot';

/**
 * KOT reprint E2E tests — issue #157
 *
 * Verifies that the "Reprint KOT" button appears on the order detail page when
 * there are items and that clicking it does not throw JS errors.
 */
test.describe('KOT reprint button', () => {
  test.beforeEach(async ({ page }) => {
    // Mock tables list
    await page.route('**/rest/v1/tables**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: TABLE_ID, label: 'Table KOT' }]),
      });
    });

    // Mock order status — open
    await page.route('**/rest/v1/orders**', async (route) => {
      const url = route.request().url();
      if (url.includes(`id=eq.${ORDER_ID}`)) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{ status: 'open' }]),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{ id: ORDER_ID, table_id: TABLE_ID }]),
        });
      }
    });

    // Mock order items — at least one item so the Reprint KOT button is visible
    await page.route('**/rest/v1/order_items**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: ORDER_ITEM_ID,
            quantity: 2,
            unit_price_cents: 1000,
            modifier_ids: [],
            sent_to_kitchen: true,
            menu_items: { name: 'Test Dish' },
          },
        ]),
      });
    });
  });

  test('Reprint KOT button is visible on order detail page when order has items', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto(`/tables/${TABLE_ID}/order/${ORDER_ID}`);

    // Wait for items to load
    await expect(page.getByText('Test Dish', { exact: true }).first()).toBeVisible();

    // Reprint KOT button must be present
    await expect(page.getByRole('button', { name: /Reprint KOT/i })).toBeVisible();

    expect(errors).toHaveLength(0);
  });

  test('clicking Reprint KOT does not throw JS errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    // Intercept the print dialog — Playwright can't interact with OS print dialogs,
    // but we can confirm no JS error fires when the button is clicked.
    await page.goto(`/tables/${TABLE_ID}/order/${ORDER_ID}`);

    await expect(page.getByText('Test Dish', { exact: true }).first()).toBeVisible();

    const reprintBtn = page.getByRole('button', { name: /Reprint KOT/i });
    await expect(reprintBtn).toBeVisible();

    // Click the button — this triggers the Reprinting… state + setTimeout + window.print()
    await reprintBtn.click();

    // The button should briefly show "Reprinting…" (may resolve quickly in Playwright)
    // Just verify no JS error was thrown
    await page.waitForTimeout(500);

    expect(errors).toHaveLength(0);
  });

  test('Reprint KOT button has at least 48px height (touch target)', async ({ page }) => {
    await page.goto(`/tables/${TABLE_ID}/order/${ORDER_ID}`);

    await expect(page.getByText('Test Dish', { exact: true }).first()).toBeVisible();

    const reprintBtn = page.getByRole('button', { name: /Reprint KOT/i });
    const box = await reprintBtn.boundingBox();

    expect(box?.height).toBeGreaterThanOrEqual(48);
  });

  test('Reprint KOT does not call mark-items-sent-to-kitchen API', async ({ page }) => {
    let kotApiCalled = false;

    await page.route('**/functions/v1/mark-items-sent-to-kitchen**', async (route) => {
      kotApiCalled = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.goto(`/tables/${TABLE_ID}/order/${ORDER_ID}`);
    await expect(page.getByText('Test Dish', { exact: true }).first()).toBeVisible();

    await page.getByRole('button', { name: /Reprint KOT/i }).click();

    // Wait long enough for any async calls that might fire
    await page.waitForTimeout(600);

    expect(kotApiCalled).toBe(false);
  });
});
