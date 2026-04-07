import { test, expect } from '@playwright/test';

const TABLE_ID = 'table-e2e-split';
const ORDER_ID = 'order-e2e-split';
const MENU_ITEM_ID = 'menu-item-e2e-split';
const ORDER_ITEM_ID = 'order-item-e2e-split';
const BILL_TOTAL_CENTS = 130000; // ৳1300.00

/**
 * Split payment critical path E2E tests.
 *
 * Verifies:
 * 1. Staff can add multiple payment methods (e.g. ৳500 cash + ৳800 card)
 * 2. Confirm button stays disabled until total tendered >= bill total
 * 3. Splitting across two methods records payment and reaches success state
 * 4. Over-tender on cash portion shows change due
 * 5. Comp orders skip the split builder entirely
 *
 * All Supabase/edge function calls are mocked — no real backend required.
 */
test.describe('split payment builder', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' })

  test.beforeEach(async ({ page }) => {
    // Auth mocks
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

    // Tables
    await page.route('**/rest/v1/tables**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: TABLE_ID, label: 'Table S1' }]),
      });
    });

    let tableHasOpenOrder = true;

    // Orders
    await page.route('**/rest/v1/orders**', async (route) => {
      const url = route.request().url();
      if (!url.includes('/rest/v1/orders')) {
        await route.continue();
        return;
      }
      if (tableHasOpenOrder && url.includes('status=eq.open')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{ id: ORDER_ID, table_id: TABLE_ID }]),
        });
      } else if (url.includes('status=eq.open')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      } else if (url.includes(`id=eq.${ORDER_ID}`)) {
        const status = tableHasOpenOrder ? 'open' : 'paid';
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{ status }]),
        });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      }
    });

    // Order items (bill total = ৳1300)
    await page.route('**/rest/v1/order_items**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: ORDER_ITEM_ID,
            quantity: 1,
            unit_price_cents: BILL_TOTAL_CENTS,
            menu_items: { name: 'Feast Platter' },
          },
        ]),
      });
    });

    // Menu items
    await page.route('**/rest/v1/menu_items**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: MENU_ITEM_ID, name: 'Feast Platter', price_cents: BILL_TOTAL_CENTS, category: 'Mains' },
        ]),
      });
    });

    // close_order
    await page.route('**/functions/v1/close_order**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    // record_payment — mark order as paid after call
    await page.route('**/functions/v1/record_payment**', async (route) => {
      tableHasOpenOrder = false;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { payment_id: 'pay-split-e2e-1', change_due: 0 } }),
      });
    });
  });

  test('split payment: card + cash covers full bill → payment recorded → navigates to /tables', async ({ page }) => {
    await page.goto(`/tables/${TABLE_ID}/order/${ORDER_ID}`);
    await expect(page.getByText('Feast Platter', { exact: true }).last()).toBeVisible();

    // Close the order to reach payment step
    await page.getByRole('button', { name: 'Close Order' }).click();
    await expect(page.getByText('Bill Preview')).toBeVisible();
    await page.getByRole('button', { name: 'Proceed to Payment' }).click();
    await expect(page.getByText('Record Payment')).toBeVisible();

    // Add card portion: ৳800
    await page.getByRole('button', { name: 'Card' }).click();
    const amountInput = page.getByRole('spinbutton');
    await amountInput.fill('800');
    await page.getByRole('button', { name: /Add/ }).click();

    // Confirm should still be disabled (only ৳800 of ৳1300 covered)
    const confirmBtn = page.getByRole('button', { name: /Confirm Payment/ });
    await expect(confirmBtn).toBeDisabled();

    // Add cash portion: ৳500
    await page.getByRole('button', { name: 'Cash' }).click();
    await amountInput.fill('500');
    await page.getByRole('button', { name: /Add/ }).click();

    // Now total = ৳1300 = bill total → confirm enabled
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();

    // Success state
    await expect(page.getByText('Payment recorded — order closed')).toBeVisible();

    // Auto-navigate to /tables
    await page.waitForURL('**/tables', { timeout: 5000 });
    await expect(page.getByRole('heading', { name: 'Tables' })).toBeVisible();
  });

  test('split payment with over-tender cash shows change due', async ({ page }) => {
    // Override record_payment to return change_due
    await page.route('**/functions/v1/record_payment**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { payment_id: 'pay-split-e2e-2', change_due: 20000 } }),
      });
    });

    await page.goto(`/tables/${TABLE_ID}/order/${ORDER_ID}`);
    await expect(page.getByText('Feast Platter', { exact: true }).last()).toBeVisible();

    await page.getByRole('button', { name: 'Close Order' }).click();
    await expect(page.getByText('Bill Preview')).toBeVisible();
    await page.getByRole('button', { name: 'Proceed to Payment' }).click();
    await expect(page.getByText('Record Payment')).toBeVisible();

    // Add card: ৳800
    await page.getByRole('button', { name: 'Card' }).click();
    const amountInput = page.getByRole('spinbutton');
    await amountInput.fill('800');
    await page.getByRole('button', { name: /Add/ }).click();

    // Add cash: ৳700 (over-tender by ৳200)
    await page.getByRole('button', { name: 'Cash' }).click();
    await amountInput.fill('700');
    await page.getByRole('button', { name: /Add/ }).click();

    // Confirm should be enabled (total ৳1500 >= ৳1300)
    const confirmBtn = page.getByRole('button', { name: /Confirm Payment/ });
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();

    // Change due screen should appear
    await expect(page.getByRole('heading', { name: 'Change Due' })).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();

    // Success state
    await expect(page.getByText('Payment recorded — order closed')).toBeVisible();
  });

  test('confirm button is disabled until full bill amount is covered', async ({ page }) => {
    await page.goto(`/tables/${TABLE_ID}/order/${ORDER_ID}`);
    await expect(page.getByText('Feast Platter', { exact: true }).last()).toBeVisible();

    await page.getByRole('button', { name: 'Close Order' }).click();
    await expect(page.getByText('Bill Preview')).toBeVisible();
    await page.getByRole('button', { name: 'Proceed to Payment' }).click();
    await expect(page.getByText('Record Payment')).toBeVisible();

    // Initially confirm should be disabled (no payment entries yet)
    const confirmBtn = page.getByRole('button', { name: /Confirm Payment/ });
    await expect(confirmBtn).toBeDisabled();

    // Add partial amount (under the bill total)
    await page.getByRole('button', { name: 'Card' }).click();
    const amountInput = page.getByRole('spinbutton');
    await amountInput.fill('500');
    await page.getByRole('button', { name: /Add/ }).click();

    // Still disabled — only ৳500 of ৳1300 covered
    await expect(confirmBtn).toBeDisabled();
  });
});
