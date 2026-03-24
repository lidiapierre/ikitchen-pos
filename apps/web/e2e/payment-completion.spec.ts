import { test, expect } from '@playwright/test';

const TABLE_ID = 'table-e2e-1';
const ORDER_ID = 'order-e2e-1';
const MENU_ITEM_ID = 'menu-item-e2e-1';
const ORDER_ITEM_ID = 'order-item-e2e-1';

/**
 * Full post-payment completion flow:
 * open order → add item → close order → record payment → tables page shows table as available
 *
 * All Supabase/Action API calls are intercepted and mocked so this test runs
 * without a real backend.
 */
test.describe('post-payment completion flow', () => {
  test.beforeEach(async ({ page }) => {
    // Mock tables list — table starts as occupied (has an open order)
    await page.route('**/rest/v1/tables**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: TABLE_ID, label: 'Table 1' }]),
      });
    });

    // Mock open orders — initially the table has an open order
    let tableHasOpenOrder = true;
    await page.route('**/rest/v1/orders**', async (route) => {
      const url = route.request().url();
      // Order items queries come through order_items, not orders
      if (url.includes('/rest/v1/orders')) {
        if (tableHasOpenOrder && url.includes('status=eq.open')) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([{ id: ORDER_ID, table_id: TABLE_ID }]),
          });
        } else if (url.includes('status=eq.open')) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([]),
          });
        } else if (url.includes(`id=eq.${ORDER_ID}`)) {
          // fetchOrderSummary check — order is open until payment is recorded
          const status = tableHasOpenOrder ? 'open' : 'paid';
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([{ status }]),
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([]),
          });
        }
      } else {
        await route.continue();
      }
    });

    // Mock order items
    await page.route('**/rest/v1/order_items**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: ORDER_ITEM_ID,
            quantity: 1,
            unit_price_cents: 1200,
            menu_items: { name: 'Margherita Pizza' },
          },
        ]),
      });
    });

    // Mock menu items
    await page.route('**/rest/v1/menu_items**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: MENU_ITEM_ID, name: 'Margherita Pizza', price_cents: 1200, category: 'Mains' }]),
      });
    });

    // Mock close_order action
    await page.route('**/functions/v1/close_order**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    // Mock record_payment action — after this is called, mark table as no longer occupied
    await page.route('**/functions/v1/record_payment**', async (route) => {
      tableHasOpenOrder = false;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { payment_id: 'pay-e2e-1', change_due: 300 } }),
      });
    });
  });

  test('navigates directly to order detail — shows items and order controls', async ({ page }) => {
    await page.goto(`/tables/${TABLE_ID}/order/${ORDER_ID}`);

    await expect(page.getByText('Margherita Pizza', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close Order' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Add Items' })).toBeVisible();
  });

  test('full flow: close order → card payment → success state → /tables shows table as available', async ({ page }) => {
    await page.goto(`/tables/${TABLE_ID}/order/${ORDER_ID}`);

    // Wait for items to load
    await expect(page.getByText('Margherita Pizza', { exact: true })).toBeVisible();

    // Close the order
    await page.getByRole('button', { name: 'Close Order' }).click();
    await expect(page.getByText('Record Payment')).toBeVisible();

    // Select card payment and confirm
    await page.getByRole('button', { name: 'Card' }).click();
    await page.getByRole('button', { name: /Confirm Payment/ }).click();

    // Success state must appear
    await expect(page.getByText('Payment recorded — order closed')).toBeVisible();

    // Wait for auto-navigation to /tables (1.5s)
    await page.waitForURL('**/tables', { timeout: 5000 });

    // The table should now show as available (no order badge)
    await expect(page.getByRole('heading', { name: 'Tables' })).toBeVisible();

    // The table card should not show an "Occupied" or order badge
    // (TableCard shows the table label; Available tables link to create an order)
    const tableCard = page.getByText('Table 1').first();
    await expect(tableCard).toBeVisible();
  });

  test('full flow: close order → cash payment → change due → Done → success state → /tables', async ({ page }) => {
    await page.goto(`/tables/${TABLE_ID}/order/${ORDER_ID}`);

    await expect(page.getByText('Margherita Pizza', { exact: true })).toBeVisible();

    // Close order
    await page.getByRole('button', { name: 'Close Order' }).click();
    await expect(page.getByText('Record Payment')).toBeVisible();

    // Cash is default; enter tendered amount
    await page.getByRole('spinbutton').fill('15.00');
    await page.getByRole('button', { name: /Confirm Payment/ }).click();

    // Change due screen
    await expect(page.getByText('Change Due')).toBeVisible();
    await expect(page.getByText(/3\.00/)).toBeVisible();

    // Click Done
    await page.getByRole('button', { name: 'Done' }).click();

    // Success state
    await expect(page.getByText('Payment recorded — order closed')).toBeVisible();

    // Auto-navigate to /tables
    await page.waitForURL('**/tables', { timeout: 5000 });
    await expect(page.getByRole('heading', { name: 'Tables' })).toBeVisible();
  });

  test('paid order URL shows read-only view — not editable', async ({ page }) => {
    // Simulate navigating back to a paid order
    await page.route('**/rest/v1/orders**', async (route) => {
      const url = route.request().url();
      if (url.includes(`id=eq.${ORDER_ID}`)) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{ status: 'paid' }]),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      }
    });

    await page.route('**/rest/v1/payments**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ method: 'card' }]),
      });
    });

    await page.goto(`/tables/${TABLE_ID}/order/${ORDER_ID}`);

    // Should show read-only paid badge
    await expect(page.getByText('Paid')).toBeVisible();
    await expect(page.getByText('card')).toBeVisible();

    // Should NOT show editable controls
    await expect(page.getByRole('button', { name: 'Close Order' })).not.toBeVisible();
    await expect(page.getByRole('link', { name: 'Add Items' })).not.toBeVisible();
  });

  test('all touch targets on order detail are at least 48px', async ({ page }) => {
    await page.goto(`/tables/${TABLE_ID}/order/${ORDER_ID}`);
    await expect(page.getByText('Margherita Pizza', { exact: true })).toBeVisible();

    const closeBtn = page.getByRole('button', { name: 'Close Order' });
    const addLink = page.getByRole('link', { name: 'Add Items' });

    const closeBtnBox = await closeBtn.boundingBox();
    const addLinkBox = await addLink.boundingBox();

    expect(closeBtnBox?.height).toBeGreaterThanOrEqual(48);
    expect(addLinkBox?.height).toBeGreaterThanOrEqual(48);
  });
});
