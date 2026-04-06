import { test, expect } from '@playwright/test';

const TABLE_ID = 'aaaaaaaa-0000-0000-0000-000000000030';
const ORDER_ID = 'bbbbbbbb-0000-0000-0000-000000000030';
const ORDER_ITEM_ID = 'cccccccc-0000-0000-0000-000000000030';

/**
 * E2E tests for the Print Bill flow — issue #180
 *
 * Covers:
 * 1. "Print Bill" button is visible on the payment step (before payment is recorded)
 * 2. "Print Bill" button is visible on the success state (after payment is recorded)
 * 3. Clicking "Print Bill" does not throw any JS errors
 * 4. "Print Bill" touch target is at least 48px tall
 *
 * All Supabase / edge-function calls are intercepted and mocked.
 */
test.describe('Print Bill flow', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' });

  test.beforeEach(async ({ page }) => {
    // ── Auth ──────────────────────────────────────────────────────────────────
    await page.route('**/auth/v1/user**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '00000000-0000-0000-0000-000000000001',
          email: 'admin@lahore.ikitchen.com.bd',
          role: 'authenticated',
        }),
      });
    });

    await page.route('**/rest/v1/users?**', async (route) => {
      const url = route.request().url();
      if (url.includes('select=role')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{ role: 'owner' }]),
        });
      } else {
        await route.continue();
      }
    });

    // ── Tables ─────────────────────────────────────────────────────────────────
    await page.route('**/rest/v1/tables**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: TABLE_ID, label: 'T30' }]),
      });
    });

    // ── Orders ─────────────────────────────────────────────────────────────────
    await page.route('**/rest/v1/orders**', async (route) => {
      const url = route.request().url();
      if (url.includes('select=restaurant_id')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{ restaurant_id: 'restaurant-e2e-print' }]),
        });
      } else if (url.includes('select=covers')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{ covers: 1 }]),
        });
      } else if (url.includes('select=status')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{ status: 'open' }]),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{
            id: ORDER_ID,
            table_id: TABLE_ID,
            status: 'open',
            covers: 1,
            discount_type: null,
            discount_value: null,
            discount_amount_cents: 0,
            order_comp: false,
            restaurant_id: 'restaurant-e2e-print',
          }]),
        });
      }
    });

    // ── Order items ───────────────────────────────────────────────────────────
    await page.route('**/rest/v1/order_items**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: ORDER_ITEM_ID,
            order_id: ORDER_ID,
            quantity: 1,
            unit_price_cents: 45000,
            modifier_ids: [],
            sent_to_kitchen: true,
            comp: false,
            comp_reason: null,
            seat: null,
            menu_items: { name: 'Special Platter' },
          },
        ]),
      });
    });

    // ── close_order edge function ─────────────────────────────────────────────
    await page.route('**/functions/v1/close_order**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { final_total_cents: 45000 } }),
      });
    });

    // ── record_payment edge function ──────────────────────────────────────────
    await page.route('**/functions/v1/record_payment**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { payment_id: 'pay-e2e-print', change_due: 0 } }),
      });
    });

    // ── Printers + menus (printer routing — return empty so fallback to browser print) ─
    await page.route('**/rest/v1/printers**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route('**/rest/v1/menus**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
  });

  test('Print Bill button is visible on the payment step', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto(`/tables/${TABLE_ID}/order/${ORDER_ID}`);

    await expect(page.getByText('Special Platter', { exact: true }).last()).toBeVisible();

    // Advance to payment step
    await page.getByRole('button', { name: 'Close Order' }).click();
    await expect(page.getByText('Bill Preview')).toBeVisible();
    await page.getByRole('button', { name: 'Proceed to Payment' }).click();
    await expect(page.getByText('Record Payment')).toBeVisible();

    // Print Bill must be visible before payment is recorded
    await expect(page.getByRole('button', { name: /Print Bill/i })).toBeVisible();

    expect(errors).toHaveLength(0);
  });

  test('Print Bill button is visible on the success state after card payment', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto(`/tables/${TABLE_ID}/order/${ORDER_ID}`);

    await expect(page.getByText('Special Platter', { exact: true }).last()).toBeVisible();

    // Close order → card payment → success
    await page.getByRole('button', { name: 'Close Order' }).click();
    await expect(page.getByText('Bill Preview')).toBeVisible();
    await page.getByRole('button', { name: 'Proceed to Payment' }).click();
    await expect(page.getByText('Record Payment')).toBeVisible();

    await page.getByRole('button', { name: 'Card' }).click();
    await page.getByRole('button', { name: /Confirm Payment/ }).click();

    await expect(page.getByText('Payment recorded — order closed')).toBeVisible();

    // Print Bill must still be visible on the success step
    await expect(page.getByRole('button', { name: /Print Bill/i })).toBeVisible();

    expect(errors).toHaveLength(0);
  });

  test('clicking Print Bill on payment step does not throw JS errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto(`/tables/${TABLE_ID}/order/${ORDER_ID}`);

    await expect(page.getByText('Special Platter', { exact: true }).last()).toBeVisible();

    await page.getByRole('button', { name: 'Close Order' }).click();
    await expect(page.getByText('Bill Preview')).toBeVisible();
    await page.getByRole('button', { name: 'Proceed to Payment' }).click();
    await expect(page.getByText('Record Payment')).toBeVisible();

    const printBtn = page.getByRole('button', { name: /Print Bill/i });
    await expect(printBtn).toBeVisible();

    // Click triggers window.print() — should not throw
    await printBtn.click();

    // Allow any async errors to surface
    await page.waitForTimeout(500);

    expect(errors).toHaveLength(0);
  });

  test('clicking Print Bill on success state does not throw JS errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto(`/tables/${TABLE_ID}/order/${ORDER_ID}`);

    await expect(page.getByText('Special Platter', { exact: true }).last()).toBeVisible();

    await page.getByRole('button', { name: 'Close Order' }).click();
    await expect(page.getByText('Bill Preview')).toBeVisible();
    await page.getByRole('button', { name: 'Proceed to Payment' }).click();
    await expect(page.getByText('Record Payment')).toBeVisible();

    await page.getByRole('button', { name: 'Card' }).click();
    await page.getByRole('button', { name: /Confirm Payment/ }).click();

    await expect(page.getByText('Payment recorded — order closed')).toBeVisible();

    const printBtn = page.getByRole('button', { name: /Print Bill/i });
    await expect(printBtn).toBeVisible();

    await printBtn.click();

    await page.waitForTimeout(500);

    expect(errors).toHaveLength(0);
  });

  test('Print Bill button has at least 48px touch target on payment step', async ({ page }) => {
    await page.goto(`/tables/${TABLE_ID}/order/${ORDER_ID}`);

    await expect(page.getByText('Special Platter', { exact: true }).last()).toBeVisible();

    await page.getByRole('button', { name: 'Close Order' }).click();
    await expect(page.getByText('Bill Preview')).toBeVisible();
    await page.getByRole('button', { name: 'Proceed to Payment' }).click();
    await expect(page.getByText('Record Payment')).toBeVisible();

    const printBtn = page.getByRole('button', { name: /Print Bill/i });
    const box = await printBtn.boundingBox();

    expect(box?.height).toBeGreaterThanOrEqual(48);
  });
});
