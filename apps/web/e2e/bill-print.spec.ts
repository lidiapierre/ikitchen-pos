import { test, expect } from '@playwright/test';

const TABLE_ID = 'aaaaaaaa-0000-0000-0000-000000000040';
const ORDER_ID = 'bbbbbbbb-0000-0000-0000-000000000040';
const ORDER_ITEM_ID = 'cccccccc-0000-0000-0000-000000000040';

/**
 * Bill print E2E tests — issue #145
 *
 * Verifies that the "Print Bill" button appears on both the payment step and
 * the success state, and that clicking it does not throw JS errors.
 */
test.describe('Print Bill button', () => {
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

    // ── Tables ────────────────────────────────────────────────────────────────
    await page.route('**/rest/v1/tables**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: TABLE_ID, label: 'T40' }]),
      });
    });

    // ── Orders ────────────────────────────────────────────────────────────────
    await page.route('**/rest/v1/orders**', async (route) => {
      const url = route.request().url();
      if (url.includes('select=restaurant_id')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{ restaurant_id: 'restaurant-e2e-bill' }]),
        });
      } else if (url.includes('select=covers')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{ covers: 2 }]),
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
            covers: 2,
            discount_type: null,
            discount_value: null,
            discount_amount_cents: 0,
            order_comp: false,
            restaurant_id: 'restaurant-e2e-bill',
            order_type: 'dine_in',
            customer_name: null,
            delivery_note: null,
            customer_mobile: null,
            bill_number: null,
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
            unit_price_cents: 1500,
            modifier_ids: [],
            sent_to_kitchen: true,
            comp: false,
            comp_reason: null,
            seat: null,
            course: 'main',
            course_status: 'fired',
            item_discount_type: null,
            item_discount_value: null,
      notes: null,
            menu_items: { name: 'Chicken Karahi', menu_id: null },
          },
        ]),
      });
    });

    // ── Edge functions ────────────────────────────────────────────────────────
    await page.route('**/functions/v1/close_order**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { final_total_cents: 3000 } }),
      });
    });

    await page.route('**/functions/v1/record_payment**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { payment_id: 'pay-e2e-bill', change_due: 0 } }),
      });
    });

    // ── Printer routing stubs ─────────────────────────────────────────────────
    await page.route('**/rest/v1/printers**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route('**/rest/v1/printer_configs**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route('**/rest/v1/menus**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    // ── Restaurant config (BIN, register name, address) ───────────────────────
    await page.route('**/rest/v1/config**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
  });

  test('Print Bill button is visible on the payment step', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto(`/tables/${TABLE_ID}/order/${ORDER_ID}`);
    await expect(page.getByText('Chicken Karahi', { exact: true }).last()).toBeVisible();

    await page.getByRole('button', { name: 'Close Order' }).click();
    await expect(page.getByText('Bill Preview')).toBeVisible();
    await page.getByRole('button', { name: 'Proceed to Payment' }).click();
    await expect(page.getByText('Record Payment')).toBeVisible();

    await expect(page.getByRole('button', { name: /Print Bill/i })).toBeVisible();
    expect(errors).toHaveLength(0);
  });

  test('Print Bill button is visible on the success step after card payment', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto(`/tables/${TABLE_ID}/order/${ORDER_ID}`);
    await expect(page.getByText('Chicken Karahi', { exact: true }).last()).toBeVisible();

    await page.getByRole('button', { name: 'Close Order' }).click();
    await expect(page.getByText('Bill Preview')).toBeVisible();
    await page.getByRole('button', { name: 'Proceed to Payment' }).click();
    await expect(page.getByText('Record Payment')).toBeVisible();
    // Split payment builder: select Card, enter full amount (bill = ৳30.00), add, then confirm
    await page.getByRole('button', { name: 'Card' }).click();
    await page.getByRole('spinbutton').fill('30');
    await page.getByRole('button', { name: 'Add' }).click();
    await page.getByRole('button', { name: /Confirm Payment/ }).click();
    await expect(page.getByText('Payment recorded — order closed')).toBeVisible();

    await expect(page.getByRole('button', { name: /Print Bill/i })).toBeVisible();
    expect(errors).toHaveLength(0);
  });

  test('Print Bill button has at least 48px height on payment step (touch target)', async ({ page }) => {
    await page.goto(`/tables/${TABLE_ID}/order/${ORDER_ID}`);
    await expect(page.getByText('Chicken Karahi', { exact: true }).last()).toBeVisible();

    await page.getByRole('button', { name: 'Close Order' }).click();
    await expect(page.getByText('Bill Preview')).toBeVisible();
    await page.getByRole('button', { name: 'Proceed to Payment' }).click();
    await expect(page.getByText('Record Payment')).toBeVisible();

    const box = await page.getByRole('button', { name: /Print Bill/i }).boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(48);
  });

  test('clicking Print Bill on payment step does not throw JS errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto(`/tables/${TABLE_ID}/order/${ORDER_ID}`);
    await expect(page.getByText('Chicken Karahi', { exact: true }).last()).toBeVisible();

    await page.getByRole('button', { name: 'Close Order' }).click();
    await expect(page.getByText('Bill Preview')).toBeVisible();
    await page.getByRole('button', { name: 'Proceed to Payment' }).click();
    await expect(page.getByText('Record Payment')).toBeVisible();

    await page.getByRole('button', { name: /Print Bill/i }).click();
    await page.waitForTimeout(500);

    expect(errors).toHaveLength(0);
  });
});
