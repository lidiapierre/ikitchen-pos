import { test, expect } from '@playwright/test';

const TABLE_ID = 'aaaaaaaa-0000-0000-0000-000000000020';
const ORDER_ID = 'bbbbbbbb-0000-0000-0000-000000000020';
const ORDER_ITEM_ID = 'cccccccc-0000-0000-0000-000000000020';

/**
 * E2E tests for the payment flow — issue #180
 *
 * Covers:
 * 1. Cash payment: close order → select cash → enter amount → confirm → change shown → success state
 * 2. Card payment: close order → select card → confirm → direct success state (no change step)
 * 3. Payment step shows "Record Payment" heading after Close Order is clicked
 *
 * All Supabase / edge-function calls are intercepted and mocked.
 */
test.describe('payment flow', () => {
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
        body: JSON.stringify([{ id: TABLE_ID, label: 'T20' }]),
      });
    });

    // ── Orders ─────────────────────────────────────────────────────────────────
    await page.route('**/rest/v1/orders**', async (route) => {
      const url = route.request().url();
      if (url.includes('select=restaurant_id')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{ restaurant_id: 'restaurant-e2e-pay' }]),
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
            restaurant_id: 'restaurant-e2e-pay',
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
            quantity: 2,
            unit_price_cents: 17500,
            modifier_ids: [],
            sent_to_kitchen: true,
            comp: false,
            comp_reason: null,
            seat: null,
            menu_items: { name: 'Lamb Karahi' },
          },
        ]),
      });
    });

    // ── close_order edge function ─────────────────────────────────────────────
    await page.route('**/functions/v1/close_order**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { final_total_cents: 35000 } }),
      });
    });

    // ── record_payment edge function ──────────────────────────────────────────
    await page.route('**/functions/v1/record_payment**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        // change_due 2000 cents = ৳20.00 (tendered 37000 cents, total 35000 cents)
        body: JSON.stringify({ success: true, data: { payment_id: 'pay-e2e-20', change_due: 2000 } }),
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

  test('Close Order button is visible on an open order', async ({ page }) => {
    await page.goto(`/tables/${TABLE_ID}/order/${ORDER_ID}`);

    await expect(page.getByText('Lamb Karahi', { exact: true }).last()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close Order' })).toBeVisible();
  });

  test('clicking Close Order shows the Bill Preview heading', async ({ page }) => {
    await page.goto(`/tables/${TABLE_ID}/order/${ORDER_ID}`);

    await expect(page.getByText('Lamb Karahi', { exact: true }).last()).toBeVisible();

    await page.getByRole('button', { name: 'Close Order' }).click();

    await expect(page.getByText('Bill Preview')).toBeVisible();
    await page.getByRole('button', { name: 'Proceed to Payment' }).click();
    await expect(page.getByText('Record Payment')).toBeVisible();
  });

  test('cash payment: enter amount → confirm → change shown → Done → success state', async ({ page }) => {
    await page.goto(`/tables/${TABLE_ID}/order/${ORDER_ID}`);

    await expect(page.getByText('Lamb Karahi', { exact: true }).last()).toBeVisible();

    // Close order → payment step
    await page.getByRole('button', { name: 'Close Order' }).click();
    await expect(page.getByText('Bill Preview')).toBeVisible();
    await page.getByRole('button', { name: 'Proceed to Payment' }).click();
    await expect(page.getByText('Record Payment')).toBeVisible();

    // Cash is the default method; enter tendered amount (total = ৳350, we pay ৳370)
    await page.getByRole('spinbutton').fill('370');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByRole('button', { name: /Confirm Payment/ }).click();

    // Change due screen (change_due = 2000 cents = ৳20.00)
    await expect(page.getByRole('heading', { name: 'Change Due' })).toBeVisible();
    await expect(page.getByRole('paragraph').filter({ hasText: /20\.00/ })).toBeVisible();

    // Dismiss the change screen
    await page.getByRole('button', { name: 'Done' }).click();

    // Final success state
    await expect(page.getByText('Payment recorded — order closed')).toBeVisible();
  });

  test('card payment: select card → confirm → success state without change step', async ({ page }) => {
    // For card payments record_payment returns change_due = 0 → no Change Due screen
    await page.route('**/functions/v1/record_payment**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { payment_id: 'pay-e2e-card', change_due: 0 } }),
      });
    });

    await page.goto(`/tables/${TABLE_ID}/order/${ORDER_ID}`);

    await expect(page.getByText('Lamb Karahi', { exact: true }).last()).toBeVisible();

    await page.getByRole('button', { name: 'Close Order' }).click();
    await expect(page.getByText('Bill Preview')).toBeVisible();
    await page.getByRole('button', { name: 'Proceed to Payment' }).click();
    await expect(page.getByText('Record Payment')).toBeVisible();

    // Split payment builder: select Card, enter full amount (bill = ৳350), add, then confirm
    await page.getByRole('button', { name: 'Card' }).click();
    await page.getByRole('spinbutton').fill('350');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByRole('button', { name: /Confirm Payment/ }).click();

    // No change due step — goes directly to success
    await expect(page.getByText('Payment recorded — order closed')).toBeVisible();
  });
});
