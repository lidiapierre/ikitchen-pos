import { test, expect } from '@playwright/test';

/**
 * Pre-payment bill (due bill) E2E tests — issue #370
 *
 * Verifies that:
 * - "Print Bill (DUE)" button appears on dine-in order detail before payment
 * - "Print Bill (DUE)" button appears on takeaway order detail before payment
 * - "Print Bill (DUE)" button does NOT appear for delivery orders
 * - "Mark as Due" button appears on dine-in order detail
 * - "Mark as Due" button does NOT appear for takeaway orders
 * - After clicking "Mark as Due", the order shows a BILL DUE status badge and "Settle Bill"
 *
 * Test approach: mocked Supabase/edge-function routes (no real network traffic).
 * Pattern mirrors apps/web/e2e/bill-print.spec.ts.
 */

const TABLE_ID = 'aaaaaaaa-0000-0000-0000-000000001370';
const DINE_IN_ORDER_ID = 'bbbbbbbb-0000-0000-0001-000000001370';
const TAKEAWAY_ORDER_ID = 'bbbbbbbb-0000-0000-0002-000000001370';
const DELIVERY_ORDER_ID = 'bbbbbbbb-0000-0000-0003-000000001370';
const ORDER_ITEM_ID = 'cccccccc-0000-0000-0000-000000001370';

/** Returns an order mock row for the given type and status. */
function makeOrderRow(orderId: string, orderType: string, status: string) {
  return {
    id: orderId,
    table_id: TABLE_ID,
    status,
    covers: 2,
    discount_type: null,
    discount_value: null,
    discount_amount_cents: 0,
    order_comp: false,
    restaurant_id: 'restaurant-e2e-1370',
    order_type: orderType,
    customer_name: orderType === 'takeaway' ? 'Test Customer' : null,
    delivery_note: null,
    customer_mobile: null,
    bill_number: null,
    reservation_id: null,
    customer_id: null,
    order_number: 1,
    scheduled_time: null,
    delivery_zone_id: null,
    delivery_charge: 0,
    merge_label: null,
    delivery_zones: null,
  };
}

test.describe('Pre-payment bill (due bill) — issue #370', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' });

  /**
   * Helper: set up all the mocked routes for an order detail page.
   * @param orderId  The specific order ID the test will navigate to.
   * @param orderType  'dine_in' | 'takeaway' | 'delivery'
   * @param initialStatus  Initial order status (default 'open')
   */
  async function setupRoutes(
    page: import('@playwright/test').Page,
    orderId: string,
    orderType: string,
    initialStatus = 'open',
  ): Promise<void> {
    // Auth
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
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ role: 'owner' }]) });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{
          id: '00000000-0000-0000-0000-000000000001',
          name: 'Admin',
          email: 'admin@lahore.ikitchen.com.bd',
          role: 'owner',
          active: true,
        }]) });
      }
    });

    // Tables
    await page.route('**/rest/v1/tables**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: TABLE_ID, label: 'T99', grid_x: null, grid_y: null, section_id: null, locked_by_order_id: null }]),
      });
    });

    // Orders — same pattern as bill-print.spec.ts
    await page.route('**/rest/v1/orders**', async (route) => {
      const url = route.request().url();
      const method = route.request().method();

      if (method === 'PATCH') {
        await route.fulfill({ status: 204 });
        return;
      }

      if (url.includes('select=restaurant_id')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{ restaurant_id: 'restaurant-e2e-1370' }]),
        });
      } else if (url.includes('select=covers')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{ covers: 2 }]),
        });
      } else if (url.includes('select=status')) {
        // fetchOrderSummary (loadOrderStatus) — return status + order_type
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{ status: initialStatus, order_type: orderType }]),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([makeOrderRow(orderId, orderType, initialStatus)]),
        });
      }
    });

    // Order items — must use menu_items nested object (Supabase join format)
    await page.route('**/rest/v1/order_items**', async (route) => {
      const method = route.request().method();
      if (method === 'PATCH' || method === 'POST') {
        await route.fulfill({ status: 201 });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: ORDER_ITEM_ID,
          order_id: orderId,
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
        }]),
      });
    });

    // Edge functions (mark_order_due and others)
    await page.route('**/functions/v1/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { status: 'due' } }),
      });
    });

    // Printer routing stubs
    await page.route('**/rest/v1/printers**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route('**/rest/v1/printer_configs**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route('**/rest/v1/menus**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    // Restaurant config
    await page.route('**/rest/v1/config**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    // Other misc stubs
    await page.route('**/rest/v1/sections**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route('**/rest/v1/reservations**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.route('**/rest/v1/modifiers**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
  }

  test('shows "Print Bill (DUE)" button on dine-in order before payment', async ({ page }) => {
    await setupRoutes(page, DINE_IN_ORDER_ID, 'dine_in');
    await page.goto(`/tables/${TABLE_ID}/order/${DINE_IN_ORDER_ID}`);
    await expect(page.getByText('Chicken Karahi', { exact: true }).last()).toBeVisible();
    await expect(page.getByText('Print Bill (DUE)', { exact: true })).toBeVisible();
  });

  test('shows "Mark as Due" button on dine-in order', async ({ page }) => {
    await setupRoutes(page, DINE_IN_ORDER_ID, 'dine_in');
    await page.goto(`/tables/${TABLE_ID}/order/${DINE_IN_ORDER_ID}`);
    await expect(page.getByText('Chicken Karahi', { exact: true }).last()).toBeVisible();
    await expect(page.getByText('⏳ Mark as Due')).toBeVisible();
  });

  test('shows "Print Bill (DUE)" button on takeaway order', async ({ page }) => {
    await setupRoutes(page, TAKEAWAY_ORDER_ID, 'takeaway');
    await page.goto(`/tables/${TABLE_ID}/order/${TAKEAWAY_ORDER_ID}`);
    await expect(page.getByText('Chicken Karahi', { exact: true }).last()).toBeVisible();
    await expect(page.getByText('Print Bill (DUE)', { exact: true })).toBeVisible();
  });

  test('does NOT show "Mark as Due" button on takeaway order', async ({ page }) => {
    await setupRoutes(page, TAKEAWAY_ORDER_ID, 'takeaway');
    await page.goto(`/tables/${TABLE_ID}/order/${TAKEAWAY_ORDER_ID}`);
    await expect(page.getByText('Chicken Karahi', { exact: true }).last()).toBeVisible();
    await expect(page.getByText('⏳ Mark as Due')).not.toBeVisible();
  });

  test('does NOT show "Print Bill (DUE)" on delivery order', async ({ page }) => {
    await setupRoutes(page, DELIVERY_ORDER_ID, 'delivery');
    await page.goto(`/tables/${TABLE_ID}/order/${DELIVERY_ORDER_ID}`);
    await expect(page.getByText('Chicken Karahi', { exact: true }).last()).toBeVisible();
    await expect(page.getByText('Print Bill (DUE)', { exact: true })).not.toBeVisible();
  });

  test('"Mark as Due" transitions order to show BILL DUE badge and "Settle Bill" button', async ({ page }) => {
    await setupRoutes(page, DINE_IN_ORDER_ID, 'dine_in');
    await page.goto(`/tables/${TABLE_ID}/order/${DINE_IN_ORDER_ID}`);
    await expect(page.getByText('Chicken Karahi', { exact: true }).last()).toBeVisible();

    // Click Mark as Due
    await page.getByText('⏳ Mark as Due').click();

    // BILL DUE status badge should appear and Close Order should become Settle Bill
    await expect(page.getByText(/BILL DUE/)).toBeVisible();
    await expect(page.getByText('💰 Settle Bill')).toBeVisible();
  });
});
