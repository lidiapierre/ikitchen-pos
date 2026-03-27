import { test, expect } from '@playwright/test';

const TABLE_ID = 'aaaaaaaa-0000-0000-0000-000000000010';
const ORDER_ID = 'bbbbbbbb-0000-0000-0000-000000000010';
const ORDER_ITEM_ID_1 = 'cccccccc-0000-0000-0000-000000000010';
const ORDER_ITEM_ID_2 = 'cccccccc-0000-0000-0000-000000000011';

/**
 * E2E tests for the void item flow — issue #180
 *
 * Covers:
 * 1. Void dialog opens when Void button is clicked
 * 2. Void dialog can be cancelled without side-effects
 * 3. Confirming void with a reason removes the item from the order
 *
 * All Supabase / edge-function calls are intercepted and mocked.
 */
test.describe('void item flow', () => {
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
        body: JSON.stringify([{ id: TABLE_ID, label: 'T10' }]),
      });
    });

    // ── Orders ─────────────────────────────────────────────────────────────────
    await page.route('**/rest/v1/orders**', async (route) => {
      const url = route.request().url();
      if (url.includes('select=restaurant_id')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{ restaurant_id: 'restaurant-e2e-void' }]),
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
            restaurant_id: 'restaurant-e2e-void',
          }]),
        });
      }
    });

    // ── void_item edge function ───────────────────────────────────────────────
    await page.route('**/functions/v1/void_item**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
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

  test('void dialog opens when Void button is clicked', async ({ page }) => {
    await page.route('**/rest/v1/order_items**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: ORDER_ITEM_ID_1,
            order_id: ORDER_ID,
            quantity: 1,
            unit_price_cents: 10000,
            modifier_ids: [],
            sent_to_kitchen: false,
            comp: false,
            comp_reason: null,
            seat: null,
            menu_items: { name: 'Chicken Tikka' },
          },
        ]),
      });
    });

    await page.goto(`/tables/${TABLE_ID}/order/${ORDER_ID}`);

    await expect(page.getByText('Chicken Tikka', { exact: true })).toBeVisible();

    const voidButton = page.getByRole('button', { name: 'Void' }).first();
    await expect(voidButton).toBeVisible();
    await voidButton.click();

    await expect(page.getByRole('heading', { name: 'Void Item' })).toBeVisible();
  });

  test('cancelling void dialog keeps all items in the order', async ({ page }) => {
    await page.route('**/rest/v1/order_items**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: ORDER_ITEM_ID_1,
            order_id: ORDER_ID,
            quantity: 2,
            unit_price_cents: 10000,
            modifier_ids: [],
            sent_to_kitchen: false,
            comp: false,
            comp_reason: null,
            seat: null,
            menu_items: { name: 'Chicken Tikka' },
          },
          {
            id: ORDER_ITEM_ID_2,
            order_id: ORDER_ID,
            quantity: 1,
            unit_price_cents: 15000,
            modifier_ids: [],
            sent_to_kitchen: false,
            comp: false,
            comp_reason: null,
            seat: null,
            menu_items: { name: 'Butter Chicken' },
          },
        ]),
      });
    });

    await page.goto(`/tables/${TABLE_ID}/order/${ORDER_ID}`);

    await expect(page.getByText('Chicken Tikka', { exact: true })).toBeVisible();
    await expect(page.getByText('Butter Chicken', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Void' }).first().click();
    await expect(page.getByRole('heading', { name: 'Void Item' })).toBeVisible();

    // Cancel the dialog
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();

    // Both items must still be present
    await expect(page.getByText('Chicken Tikka', { exact: true })).toBeVisible();
    await expect(page.getByText('Butter Chicken', { exact: true })).toBeVisible();
  });

  test('confirming void with reason removes item from order', async ({ page }) => {
    let voidCalled = false;

    await page.route('**/rest/v1/order_items**', async (route) => {
      if (voidCalled) {
        // After void: only Butter Chicken remains
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: ORDER_ITEM_ID_2,
              order_id: ORDER_ID,
              quantity: 1,
              unit_price_cents: 15000,
              modifier_ids: [],
              sent_to_kitchen: false,
              comp: false,
              comp_reason: null,
              seat: null,
              menu_items: { name: 'Butter Chicken' },
            },
          ]),
        });
      } else {
        // Before void: 2 items
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: ORDER_ITEM_ID_1,
              order_id: ORDER_ID,
              quantity: 2,
              unit_price_cents: 10000,
              modifier_ids: [],
              sent_to_kitchen: false,
              comp: false,
              comp_reason: null,
              seat: null,
              menu_items: { name: 'Chicken Tikka' },
            },
            {
              id: ORDER_ITEM_ID_2,
              order_id: ORDER_ID,
              quantity: 1,
              unit_price_cents: 15000,
              modifier_ids: [],
              sent_to_kitchen: false,
              comp: false,
              comp_reason: null,
              seat: null,
              menu_items: { name: 'Butter Chicken' },
            },
          ]),
        });
      }
    });

    // Override the void_item route to track when it's called
    await page.route('**/functions/v1/void_item**', async (route) => {
      voidCalled = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    await page.goto(`/tables/${TABLE_ID}/order/${ORDER_ID}`);

    await expect(page.getByText('Chicken Tikka', { exact: true })).toBeVisible();
    await expect(page.getByText('Butter Chicken', { exact: true })).toBeVisible();

    // Open void dialog for first item
    await page.getByRole('button', { name: 'Void' }).first().click();
    await expect(page.getByRole('heading', { name: 'Void Item' })).toBeVisible();

    // Enter a reason
    await page.getByLabel(/reason/i).fill('Customer changed mind');

    // Confirm void
    await page.getByRole('button', { name: 'Confirm Void' }).click();

    // Chicken Tikka should be gone; Butter Chicken should remain
    await expect(page.getByText('Butter Chicken', { exact: true })).toBeVisible();
    await expect(page.getByText('Chicken Tikka', { exact: true })).not.toBeVisible();
  });
});
