import { test, expect } from '@playwright/test';

/**
 * Pre-payment bill (due bill) E2E tests — issue #370
 *
 * Verifies that:
 * - "Print Bill (DUE)" button appears on dine-in order detail (step=order) before payment
 * - "Print Bill (DUE)" button appears on takeaway order detail (step=order) before payment
 * - "Print Bill (DUE)" button does NOT appear for delivery orders
 * - "Mark as Due" button appears on dine-in order detail
 * - "Mark as Due" button does NOT appear for takeaway orders
 * - After clicking "Mark as Due", the order shows a BILL DUE status badge and "Settle Bill"
 */

const TABLE_ID = 'aaaaaaaa-0000-0000-0000-000000001370';
const DINE_IN_ORDER_ID = 'bbbbbbbb-0000-0000-0001-000000001370';
const TAKEAWAY_ORDER_ID = 'bbbbbbbb-0000-0000-0002-000000001370';
const DELIVERY_ORDER_ID = 'bbbbbbbb-0000-0000-0003-000000001370';
const ORDER_ITEM_ID = 'cccccccc-0000-0000-0000-000000001370';

function buildOrderRoutes(page: import('@playwright/test').Page, orderId: string, orderType: string, status = 'open') {
  page.route('**/rest/v1/orders**', async (route) => {
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
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ status }]),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: orderId,
          table_id: TABLE_ID,
          status,
          order_type: orderType,
          customer_name: orderType === 'takeaway' ? 'Test Customer' : null,
          customer_mobile: null,
          delivery_note: null,
          discount_amount_cents: 0,
          order_comp: false,
          final_total_cents: null,
          service_charge_cents: 0,
          bill_number: null,
          reservation_id: null,
          order_number: 1,
          scheduled_time: null,
          delivery_charge: 0,
          delivery_zone_name: null,
          customer_id: null,
          merge_label: null,
          locked_by_order_id: null,
          primary_table_id: null,
        }]),
      });
    }
  });
}

test.describe('Pre-payment bill (due bill) — issue #370', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' });

  test.beforeEach(async ({ page }) => {
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
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: '00000000-0000-0000-0000-000000000001', name: 'Admin', email: 'admin@lahore.ikitchen.com.bd', role: 'owner', active: true }]) });
      }
    });

    await page.route('**/rest/v1/tables**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: TABLE_ID, label: 'T99', grid_x: null, grid_y: null, section_id: null, locked_by_order_id: null }]),
      });
    });

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
          name: 'Chicken Karahi',
          quantity: 2,
          unit_price_cents: 1500,
          voided: false,
          comp: false,
          comp_reason: null,
          sent_to_kitchen: true,
          modifier_ids: [],
          modifier_names: [],
          seat: null,
          course: 'main',
          course_status: 'waiting',
          menuId: null,
          printerType: 'kitchen',
          item_discount_type: null,
          item_discount_value: null,
          notes: null,
        }]),
      });
    });

    await page.route('**/rest/v1/config**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await page.route('**/rest/v1/printers**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await page.route('**/rest/v1/sections**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await page.route('**/rest/v1/reservations**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await page.route('**/functions/v1/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { status: 'due' } }),
      });
    });
  });

  test('shows "Print Bill (DUE)" button on dine-in order before payment', async ({ page }) => {
    buildOrderRoutes(page, DINE_IN_ORDER_ID, 'dine_in');
    await page.goto(`/tables/${TABLE_ID}/order/${DINE_IN_ORDER_ID}`);
    await page.waitForSelector('text=Add Items');
    await expect(page.getByText('Print Bill (DUE)')).toBeVisible();
  });

  test('shows "Mark as Due" button on dine-in order', async ({ page }) => {
    buildOrderRoutes(page, DINE_IN_ORDER_ID, 'dine_in');
    await page.goto(`/tables/${TABLE_ID}/order/${DINE_IN_ORDER_ID}`);
    await page.waitForSelector('text=Add Items');
    await expect(page.getByText('Mark as Due')).toBeVisible();
  });

  test('shows "Print Bill (DUE)" button on takeaway order', async ({ page }) => {
    buildOrderRoutes(page, TAKEAWAY_ORDER_ID, 'takeaway');
    await page.goto(`/tables/${TABLE_ID}/order/${TAKEAWAY_ORDER_ID}`);
    await page.waitForSelector('text=Add Items');
    await expect(page.getByText('Print Bill (DUE)')).toBeVisible();
  });

  test('does NOT show "Mark as Due" button on takeaway order', async ({ page }) => {
    buildOrderRoutes(page, TAKEAWAY_ORDER_ID, 'takeaway');
    await page.goto(`/tables/${TABLE_ID}/order/${TAKEAWAY_ORDER_ID}`);
    await page.waitForSelector('text=Add Items');
    await expect(page.getByText('Mark as Due')).not.toBeVisible();
  });

  test('does NOT show "Print Bill (DUE)" on delivery order', async ({ page }) => {
    buildOrderRoutes(page, DELIVERY_ORDER_ID, 'delivery');
    await page.goto(`/tables/${TABLE_ID}/order/${DELIVERY_ORDER_ID}`);
    await page.waitForSelector('text=Add Items');
    await expect(page.getByText('Print Bill (DUE)')).not.toBeVisible();
  });

  test('"Mark as Due" transitions order to show BILL DUE badge and "Settle Bill" button', async ({ page }) => {
    buildOrderRoutes(page, DINE_IN_ORDER_ID, 'dine_in');
    await page.goto(`/tables/${TABLE_ID}/order/${DINE_IN_ORDER_ID}`);
    await page.waitForSelector('text=Mark as Due');

    await page.click('text=Mark as Due');
    await expect(page.getByText(/BILL DUE/)).toBeVisible();
    await expect(page.getByText('Settle Bill')).toBeVisible();
    await expect(page.getByText('Close Order')).not.toBeVisible();
  });
});
