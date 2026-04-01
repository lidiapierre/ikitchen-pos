import { test, expect } from '@playwright/test';

const TABLE_ID = 'aaaaaaaa-0000-0000-0000-000000000050';
const ORDER_ID = 'bbbbbbbb-0000-0000-0000-000000000050';
const ORDER_ITEM_ID = 'cccccccc-0000-0000-0000-000000000050';

/**
 * KOT reprint E2E tests — issue #157
 *
 * Verifies that the "Reprint KOT" button appears on the order detail page when
 * there are items and that clicking it does not throw JS errors.
 */
test.describe('KOT reprint button', () => {
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
        body: JSON.stringify([{ id: TABLE_ID, label: 'T50' }]),
      });
    });

    // ── Orders ────────────────────────────────────────────────────────────────
    await page.route('**/rest/v1/orders**', async (route) => {
      const url = route.request().url();
      if (url.includes('select=restaurant_id')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{ restaurant_id: 'restaurant-e2e-kot' }]),
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
            restaurant_id: 'restaurant-e2e-kot',
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
            unit_price_cents: 1000,
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
            menu_items: { name: 'Test Dish', menu_id: null },
          },
        ]),
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

    // ── Restaurant config ─────────────────────────────────────────────────────
    await page.route('**/rest/v1/config**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
  });

  test('Reprint KOT button is visible on order detail page when order has items', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto(`/tables/${TABLE_ID}/order/${ORDER_ID}`);
    await expect(page.getByText('Test Dish', { exact: true }).last()).toBeVisible();
    await expect(page.getByRole('button', { name: /Reprint KOT/i })).toBeVisible();

    expect(errors).toHaveLength(0);
  });

  test('clicking Reprint KOT does not throw JS errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto(`/tables/${TABLE_ID}/order/${ORDER_ID}`);
    await expect(page.getByText('Test Dish', { exact: true }).last()).toBeVisible();

    const reprintBtn = page.getByRole('button', { name: /Reprint KOT/i });
    await expect(reprintBtn).toBeVisible();
    await reprintBtn.click();

    await page.waitForTimeout(500);
    expect(errors).toHaveLength(0);
  });

  test('Reprint KOT button has at least 48px height (touch target)', async ({ page }) => {
    await page.goto(`/tables/${TABLE_ID}/order/${ORDER_ID}`);
    await expect(page.getByText('Test Dish', { exact: true }).last()).toBeVisible();

    const box = await page.getByRole('button', { name: /Reprint KOT/i }).boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(48);
  });

  test('Reprint KOT does not call mark-items-sent-to-kitchen API', async ({ page }) => {
    let kotApiCalled = false;

    await page.route('**/functions/v1/mark-items-sent-to-kitchen**', async (route) => {
      kotApiCalled = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.goto(`/tables/${TABLE_ID}/order/${ORDER_ID}`);
    await expect(page.getByText('Test Dish', { exact: true }).last()).toBeVisible();

    await page.getByRole('button', { name: /Reprint KOT/i }).click();
    await page.waitForTimeout(600);

    expect(kotApiCalled).toBe(false);
  });
});
