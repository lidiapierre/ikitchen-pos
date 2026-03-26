import { test, expect } from '@playwright/test';

const TABLE_ID = 'table-e2e-bill';
const ORDER_ID = 'order-e2e-bill';
const ORDER_ITEM_ID = 'order-item-e2e-bill';

/**
 * Bill print E2E tests — issue #145
 *
 * Verifies that the "Print Bill" button appears on both the payment step and
 * the success step of the order detail page.
 */
test.describe('Print Bill button', () => {
  // Requires a valid session so UserContext can populate accessToken (needed for
  // close_order / record_payment edge function calls after the RBAC auth fix).
  test.use({ storageState: 'e2e/.auth/admin.json' })

  test.beforeEach(async ({ page }) => {
    // Mock tables list
    await page.route('**/rest/v1/tables**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: TABLE_ID, label: 'Table Bill' }]),
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

    // Mock order items
    await page.route('**/rest/v1/order_items**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: ORDER_ITEM_ID,
            quantity: 2,
            unit_price_cents: 1500,
            modifier_ids: [],
            sent_to_kitchen: true,
            menu_items: { name: 'Chicken Karahi' },
          },
        ]),
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

    // Mock record_payment action
    await page.route('**/functions/v1/record_payment**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { payment_id: 'pay-e2e-bill', change_due: 0 } }),
      });
    });
  });

  test('Print Bill button is visible on the payment step', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto(`/tables/${TABLE_ID}/order/${ORDER_ID}`);

    // Wait for items to load
    await expect(page.getByText('Chicken Karahi', { exact: true })).toBeVisible();

    // Close order to enter payment step
    await page.getByRole('button', { name: 'Close Order' }).click();
    await expect(page.getByText('Record Payment')).toBeVisible();

    // Print Bill button should be visible on payment step
    await expect(page.getByRole('button', { name: /Print Bill/i })).toBeVisible();

    expect(errors).toHaveLength(0);
  });

  test('Print Bill button is visible on the success step after card payment', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto(`/tables/${TABLE_ID}/order/${ORDER_ID}`);

    await expect(page.getByText('Chicken Karahi', { exact: true })).toBeVisible();

    // Close order
    await page.getByRole('button', { name: 'Close Order' }).click();
    await expect(page.getByText('Record Payment')).toBeVisible();

    // Select card and confirm payment
    await page.getByRole('button', { name: 'Card' }).click();
    await page.getByRole('button', { name: /Confirm Payment/ }).click();

    // Success state
    await expect(page.getByText('Payment recorded — order closed')).toBeVisible();

    // Print Bill button must be present on success step
    await expect(page.getByRole('button', { name: /Print Bill/i })).toBeVisible();

    expect(errors).toHaveLength(0);
  });

  test('Print Bill button has at least 48px height on payment step (touch target)', async ({ page }) => {
    await page.goto(`/tables/${TABLE_ID}/order/${ORDER_ID}`);

    await expect(page.getByText('Chicken Karahi', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Close Order' }).click();
    await expect(page.getByText('Record Payment')).toBeVisible();

    const printBtn = page.getByRole('button', { name: /Print Bill/i });
    const box = await printBtn.boundingBox();

    expect(box?.height).toBeGreaterThanOrEqual(48);
  });

  test('clicking Print Bill on payment step does not throw JS errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto(`/tables/${TABLE_ID}/order/${ORDER_ID}`);

    await expect(page.getByText('Chicken Karahi', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Close Order' }).click();
    await expect(page.getByText('Record Payment')).toBeVisible();

    const printBtn = page.getByRole('button', { name: /Print Bill/i });
    await expect(printBtn).toBeVisible();

    // Click the button — triggers print dialog
    await printBtn.click();

    // Wait briefly to allow any async errors to surface
    await page.waitForTimeout(500);

    expect(errors).toHaveLength(0);
  });
});
