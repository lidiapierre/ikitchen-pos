import { test, expect } from '@playwright/test';

const TABLE_ID = 'aaaaaaaa-0000-0000-0000-000000000020';
const ORDER_ID = 'bbbbbbbb-0000-0000-0000-000000000020';
const ORDER_ITEM_ID = 'cccccccc-0000-0000-0000-000000000020';

/**
 * E2E tests for numeric quantity input with increase/decrease — issue #368
 *
 * Covers:
 * 1. Tapping the quantity badge opens a numeric input
 * 2. Pressing + increases quantity and calls the edge function
 * 3. Pressing − decreases quantity and calls the edge function
 * 4. Pressing − on qty 1 opens the void dialog (void-on-zero)
 * 5. Editing quantity via keyboard (Enter commits, Escape cancels)
 * 6. Optimistic rollback on edge function failure
 *
 * All Supabase / edge-function calls are intercepted and mocked.
 */

/** Shared mock for a single order item with configurable quantity. */
function makeOrderItem(quantity: number) {
  return [
    {
      id: ORDER_ITEM_ID,
      order_id: ORDER_ID,
      quantity,
      unit_price_cents: 12000,
      modifier_ids: [],
      sent_to_kitchen: false,
      comp: false,
      comp_reason: null,
      seat: null,
      menu_items: { name: 'Chicken Biryani' },
    },
  ];
}

test.describe('numeric quantity input', () => {
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
        body: JSON.stringify([{ id: TABLE_ID, label: 'T20' }]),
      });
    });

    // ── Orders ────────────────────────────────────────────────────────────────
    await page.route('**/rest/v1/orders**', async (route) => {
      const url = route.request().url();
      if (url.includes('select=restaurant_id')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{ restaurant_id: 'restaurant-e2e-qty' }]),
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
            restaurant_id: 'restaurant-e2e-qty',
          }]),
        });
      }
    });

    // ── Peripheral stubs (printers / menus) ──────────────────────────────────
    await page.route('**/rest/v1/printers**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route('**/rest/v1/menus**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    // ── update_order_item_quantity edge function (happy-path default) ─────────
    await page.route('**/functions/v1/update_order_item_quantity**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    // ── void_item edge function stub ─────────────────────────────────────────
    await page.route('**/functions/v1/void_item**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });
  });

  test('tapping quantity badge reveals numeric input', async ({ page }) => {
    await page.route('**/rest/v1/order_items**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeOrderItem(2)),
      });
    });

    await page.goto(`/tables/${TABLE_ID}/order/${ORDER_ID}`);
    await expect(page.getByText('Chicken Biryani', { exact: true }).last()).toBeVisible();

    // Quantity badge is visible; numeric input is not yet
    const qtyButton = page.getByRole('button', { name: /Quantity 2, tap to edit/i });
    await expect(qtyButton).toBeVisible();
    await expect(page.getByRole('spinbutton')).not.toBeVisible();

    // Tap the badge
    await qtyButton.click();

    // Numeric input should appear with pre-filled value
    const input = page.locator('input[inputmode="numeric"]');
    await expect(input).toBeVisible();
    await expect(input).toHaveValue('2');
  });

  test('pressing + increases quantity and calls edge function', async ({ page }) => {
    await page.route('**/rest/v1/order_items**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeOrderItem(2)),
      });
    });

    await page.goto(`/tables/${TABLE_ID}/order/${ORDER_ID}`);
    await expect(page.getByText('Chicken Biryani', { exact: true }).last()).toBeVisible();

    const increaseBtn = page.getByRole('button', { name: /increase quantity/i });

    // Set up request listener before the click so we catch the debounced call
    // (handleQtyButton fires the API after a 400 ms idle window — issue #389)
    const updateRequestPromise = page.waitForRequest('**/functions/v1/update_order_item_quantity**');
    await increaseBtn.click();

    // Wait for the debounce to fire and capture the outgoing request
    const updateRequest = await updateRequestPromise;
    const patchBody = JSON.parse(updateRequest.postData() ?? '{}') as { order_item_id: string; quantity: number };

    // Edge function must have been called with qty 3
    expect(patchBody).toMatchObject({ order_item_id: ORDER_ITEM_ID, quantity: 3 });

    // Optimistic UI: quantity badge already shows 3 (updated immediately on tap)
    await expect(page.getByRole('button', { name: /Quantity 3, tap to edit/i })).toBeVisible();
  });

  test('pressing − decreases quantity and calls edge function', async ({ page }) => {
    await page.route('**/rest/v1/order_items**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeOrderItem(3)),
      });
    });

    await page.goto(`/tables/${TABLE_ID}/order/${ORDER_ID}`);
    await expect(page.getByText('Chicken Biryani', { exact: true }).last()).toBeVisible();

    const decreaseBtn = page.getByRole('button', { name: /decrease quantity/i });

    // Set up request listener before the click (debounce — issue #389)
    const updateRequestPromise = page.waitForRequest('**/functions/v1/update_order_item_quantity**');
    await decreaseBtn.click();

    const updateRequest = await updateRequestPromise;
    const patchBody = JSON.parse(updateRequest.postData() ?? '{}') as { order_item_id: string; quantity: number };

    expect(patchBody).toMatchObject({ order_item_id: ORDER_ITEM_ID, quantity: 2 });
    await expect(page.getByRole('button', { name: /Quantity 2, tap to edit/i })).toBeVisible();
  });

  test('pressing − on qty 1 opens void dialog (void-on-zero)', async ({ page }) => {
    await page.route('**/rest/v1/order_items**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeOrderItem(1)),
      });
    });

    await page.goto(`/tables/${TABLE_ID}/order/${ORDER_ID}`);
    await expect(page.getByText('Chicken Biryani', { exact: true }).last()).toBeVisible();

    const decreaseBtn = page.getByRole('button', { name: /decrease quantity/i });
    await decreaseBtn.click();

    // Void dialog should appear instead of calling the quantity edge function
    await expect(page.getByRole('heading', { name: 'Void Item' })).toBeVisible();
  });

  test('keyboard edit: Enter commits new quantity', async ({ page }) => {
    let patchBody: unknown;

    await page.route('**/rest/v1/order_items**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeOrderItem(2)),
      });
    });

    await page.route('**/functions/v1/update_order_item_quantity**', async (route) => {
      patchBody = JSON.parse(route.request().postData() ?? '{}');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    await page.goto(`/tables/${TABLE_ID}/order/${ORDER_ID}`);
    await expect(page.getByText('Chicken Biryani', { exact: true }).last()).toBeVisible();

    // Open input
    await page.getByRole('button', { name: /Quantity 2, tap to edit/i }).click();
    const input = page.locator('input[inputmode="numeric"]');
    await expect(input).toBeVisible();

    // Clear and type new value, then press Enter
    await input.fill('5');
    await input.press('Enter');

    expect(patchBody).toMatchObject({ order_item_id: ORDER_ITEM_ID, quantity: 5 });
    await expect(page.getByRole('button', { name: /Quantity 5, tap to edit/i })).toBeVisible();
  });

  test('keyboard edit: Escape cancels without API call', async ({ page }) => {
    let updateCalled = false;

    await page.route('**/rest/v1/order_items**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeOrderItem(2)),
      });
    });

    await page.route('**/functions/v1/update_order_item_quantity**', async (route) => {
      updateCalled = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    await page.goto(`/tables/${TABLE_ID}/order/${ORDER_ID}`);
    await expect(page.getByText('Chicken Biryani', { exact: true }).last()).toBeVisible();

    // Open input, type something, then cancel
    await page.getByRole('button', { name: /Quantity 2, tap to edit/i }).click();
    const input = page.locator('input[inputmode="numeric"]');
    await input.fill('9');
    await input.press('Escape');

    // Input must be dismissed without calling the edge function
    expect(updateCalled).toBe(false);
    await expect(input).not.toBeVisible();
    // Original quantity unchanged
    await expect(page.getByRole('button', { name: /Quantity 2, tap to edit/i })).toBeVisible();
  });

  test('optimistic rollback on edge function failure', async ({ page }) => {
    await page.route('**/rest/v1/order_items**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeOrderItem(2)),
      });
    });

    // Edge function returns an error
    await page.route('**/functions/v1/update_order_item_quantity**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      });
    });

    await page.goto(`/tables/${TABLE_ID}/order/${ORDER_ID}`);
    await expect(page.getByText('Chicken Biryani', { exact: true }).last()).toBeVisible();

    // Try to increase — should optimistically show 3 then roll back to 2
    await page.getByRole('button', { name: /increase quantity/i }).click();

    // After rollback, quantity is back to 2
    await expect(page.getByRole('button', { name: /Quantity 2, tap to edit/i })).toBeVisible();
  });
});
