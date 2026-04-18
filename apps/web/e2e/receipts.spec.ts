/**
 * E2E tests for /receipts — Bill Receipt History (issue #395)
 *
 * Uses real auth sessions (admin.json / staff.json) from global-setup,
 * and mocks only the data endpoints (orders, payments) to avoid DB dependency.
 * This is consistent with how auth-roles.spec.ts works.
 *
 * viewport: 1280x800 (per CLAUDE.md requirement)
 */

import { test, expect } from '@playwright/test'
import path from 'path'

const ADMIN_STORAGE_STATE = path.join(__dirname, '../e2e/.auth/admin.json')
const STAFF_STORAGE_STATE = path.join(__dirname, '../e2e/.auth/staff.json')

const TODAY_ISO = new Date().toISOString()

const PAID_ORDER = {
  id: 'order-test-1',
  bill_number: 'RN0001234',
  order_number: 7,
  created_at: TODAY_ISO,
  final_total_cents: 120000,
  discount_amount_cents: 0,
  order_comp: false,
  order_type: 'dine_in',
  server_id: 'user-staff-1',
  customer_name: null,
  customer_mobile: null,
  delivery_note: null,
  delivery_charge: 0,
  service_charge_cents: 0,
  vat_cents: 0,
  tables: { label: 'T3' },
  delivery_zones: null,
  payments: [{ method: 'cash', amount_cents: 120000, tendered_amount_cents: 150000 }],
}

/** Mock only the data endpoints; auth uses real session from storageState */
async function mockDataEndpoints(page: import('@playwright/test').Page, orders = [PAID_ORDER]): Promise<void> {
  // Orders list
  await page.route('**/rest/v1/orders?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(orders),
    })
  })

  // Config / VAT / restaurants for receipt config
  await page.route('**/rest/v1/config?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ key: 'restaurant_address', value: 'Test Address' }]),
    })
  })
  await page.route('**/rest/v1/vat_rates?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ rate: 0, tax_inclusive: false }]),
    })
  })
  await page.route('**/rest/v1/restaurants?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ name: 'Test Restaurant' }]),
    })
  })
  // Users lookup (server name display)
  await page.route('**/rest/v1/users?**', async (route) => {
    await route.continue()
  })
}

async function mockReprintEndpoints(page: import('@playwright/test').Page): Promise<void> {
  await page.route('**/rest/v1/order_items?**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })

  await page.route('**/rest/v1/payments?order_id=eq.*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ method: 'cash', amount_cents: 120000, tendered_amount_cents: 150000 }]),
    })
  })
}

// ─── Staff (server) tests ─────────────────────────────────────────────────────

test.describe('Staff (server) view', () => {
  test.use({ storageState: STAFF_STORAGE_STATE })

  test('shows Shift Receipts heading for staff', async ({ page }) => {
    await mockDataEndpoints(page, [])
    await page.goto('/receipts')

    await expect(page.getByRole('heading', { name: 'Shift Receipts' })).toBeVisible()
  })

  test('shows empty state when no receipts found', async ({ page }) => {
    await mockDataEndpoints(page, [])
    await page.goto('/receipts')

    await expect(page.getByText('No receipts found', { exact: true })).toBeVisible()
    await expect(page.getByText(/No receipts found for your current shift/)).toBeVisible()
  })

  test('shows Receipts link in navigation header', async ({ page }) => {
    await mockDataEndpoints(page, [])
    await page.goto('/receipts')

    const receiptsLink = page.getByRole('link', { name: /Receipts/i })
    await expect(receiptsLink).toBeVisible()
    await expect(receiptsLink).toHaveAttribute('href', '/receipts')
  })

  test('staff orders query URL includes server_id filter', async ({ page }) => {
    await page.route('**/rest/v1/orders?**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })
    await page.route('**/rest/v1/users?**', async (route) => { await route.continue() })
    await page.route('**/rest/v1/config?**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })
    await page.route('**/rest/v1/vat_rates?**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })
    await page.route('**/rest/v1/restaurants?**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })

    // Start waiting for the request BEFORE navigation so we don't miss it.
    // Using waitForRequest returns the Request object directly — avoids the
    // race condition where a captured-URL closure variable isn't set yet.
    const ordersRequestPromise = page.waitForRequest('**/rest/v1/orders?**', { timeout: 15000 })
    await page.goto('/receipts')
    const ordersRequest = await ordersRequestPromise

    // Staff view must include server_id filter (exact ID comes from real session)
    const url = decodeURIComponent(ordersRequest.url())
    expect(url).toContain('server_id=eq.')
    expect(url).not.toContain('server_id=eq.undefined')
    expect(url).not.toContain('server_id=eq.null')
  })

  test('displays receipt entry with bill number and table', async ({ page }) => {
    await mockDataEndpoints(page, [PAID_ORDER])
    await page.goto('/receipts')

    await expect(page.getByText('RN0001234')).toBeVisible()
    await expect(page.getByText('T3')).toBeVisible()
    await expect(page.getByText(/1,200/).first()).toBeVisible()
  })

  test('receipt row expands to show payment breakdown', async ({ page }) => {
    await mockDataEndpoints(page, [PAID_ORDER])
    await page.goto('/receipts')

    await page.getByRole('button', { name: 'Expand receipt details' }).click()

    await expect(page.getByText('Payment breakdown')).toBeVisible()
    await expect(page.getByText('Total Paid')).toBeVisible()
  })

  test('Back to POS button is visible to staff', async ({ page }) => {
    await mockDataEndpoints(page, [])
    await page.goto('/receipts')

    await expect(page.getByRole('button', { name: 'Back to POS' })).toBeVisible()
  })

  test('order type filter tabs are visible to staff', async ({ page }) => {
    await mockDataEndpoints(page, [])
    await page.goto('/receipts')

    await expect(page.getByRole('button', { name: 'All' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Dine-in' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Takeaway' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Delivery' })).toBeVisible()
  })
})

// ─── Admin (owner) tests ──────────────────────────────────────────────────────

test.describe('Admin (owner) view', () => {
  test.use({ storageState: ADMIN_STORAGE_STATE })

  test('shows Bill History heading and date filter for admin', async ({ page }) => {
    await mockDataEndpoints(page, [])
    await page.goto('/receipts')

    await expect(page.getByRole('heading', { name: 'Bill History' })).toBeVisible()
    await expect(page.getByRole('checkbox', { name: 'Date range' })).toBeVisible()
  })

  test('shows daily total and order count in summary card', async ({ page }) => {
    await mockDataEndpoints(page, [
      PAID_ORDER,
      { ...PAID_ORDER, id: 'order-test-2', final_total_cents: 80000, bill_number: 'RN0001235' },
    ])
    await page.goto('/receipts')

    // Total: 120000 + 80000 = 200000 = ৳ 2,000.00
    await expect(page.getByText(/2,000/).first()).toBeVisible()
    await expect(page.getByText('2 bills')).toBeVisible()
  })

  test('enables date range mode when checkbox checked', async ({ page }) => {
    await mockDataEndpoints(page, [])
    await page.goto('/receipts')

    const rangeCheckbox = page.getByRole('checkbox', { name: 'Date range' })
    await rangeCheckbox.check()

    await expect(page.locator('input[type="date"]').first()).toBeVisible()
    await expect(page.locator('input[type="date"]').nth(1)).toBeVisible()
  })

  test('re-print modal opens and shows Re-print button', async ({ page }) => {
    // Override the orders route to handle both list and single-order fetches
    await page.route('**/rest/v1/orders?**', async (route) => {
      const url = route.request().url()
      if (url.includes('id=eq.')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{
            bill_number: 'RN0001234', order_number: 7, created_at: TODAY_ISO,
            final_total_cents: 120000, discount_amount_cents: 0, order_comp: false,
            order_type: 'dine_in', customer_name: null, customer_mobile: null,
            delivery_note: null, delivery_charge: 0, service_charge_cents: 0,
            tables: { label: 'T3' }, delivery_zones: null,
          }]),
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([PAID_ORDER]),
        })
      }
    })

    await page.route('**/rest/v1/config?**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })
    await page.route('**/rest/v1/vat_rates?**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })
    await page.route('**/rest/v1/restaurants?**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })
    await page.route('**/rest/v1/users?**', async (route) => { await route.continue() })
    await mockReprintEndpoints(page)

    await page.goto('/receipts')

    await page.getByRole('button', { name: 'Re-print receipt' }).first().click()

    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Re-print' })).toBeVisible()
  })

  test('closes re-print modal when Close button clicked', async ({ page }) => {
    await page.route('**/rest/v1/orders?**', async (route) => {
      const url = route.request().url()
      if (url.includes('id=eq.')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{
            bill_number: 'RN0001234', order_number: 7, created_at: TODAY_ISO,
            final_total_cents: 120000, discount_amount_cents: 0, order_comp: false,
            order_type: 'dine_in', customer_name: null, customer_mobile: null,
            delivery_note: null, delivery_charge: 0, service_charge_cents: 0,
            tables: { label: 'T3' }, delivery_zones: null,
          }]),
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([PAID_ORDER]),
        })
      }
    })

    await page.route('**/rest/v1/config?**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })
    await page.route('**/rest/v1/vat_rates?**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })
    await page.route('**/rest/v1/restaurants?**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })
    await page.route('**/rest/v1/users?**', async (route) => { await route.continue() })
    await mockReprintEndpoints(page)

    await page.goto('/receipts')

    await page.getByRole('button', { name: 'Re-print receipt' }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
  })

  test('Back to POS button navigates to /tables', async ({ page }) => {
    await mockDataEndpoints(page, [])
    await page.goto('/receipts')

    const backBtn = page.getByRole('button', { name: 'Back to POS' })
    await expect(backBtn).toBeVisible()
    await backBtn.click()

    await expect(page).toHaveURL(/\/tables/)
  })

  test('Back to POS button has adequate touch target (min 48px)', async ({ page }) => {
    await mockDataEndpoints(page, [])
    await page.goto('/receipts')

    const backBtn = page.getByRole('button', { name: 'Back to POS' })
    const box = await backBtn.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.height).toBeGreaterThanOrEqual(48)
  })

  test('order type filter tabs are visible', async ({ page }) => {
    await mockDataEndpoints(page, [])
    await page.goto('/receipts')

    await expect(page.getByRole('button', { name: 'All' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Dine-in' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Takeaway' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Delivery' })).toBeVisible()
  })

  test('order type filter tabs have adequate touch targets (min 48px)', async ({ page }) => {
    await mockDataEndpoints(page, [])
    await page.goto('/receipts')

    for (const label of ['All', 'Dine-in', 'Takeaway', 'Delivery']) {
      const btn = page.getByRole('button', { name: label })
      const box = await btn.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.height).toBeGreaterThanOrEqual(48)
    }
  })

  test('order type filter hides non-matching receipts', async ({ page }) => {
    const takeawayOrder = {
      ...PAID_ORDER,
      id: 'order-takeaway-1',
      order_type: 'takeaway',
      bill_number: 'RN0009999',
      tables: (null as unknown) as typeof PAID_ORDER['tables'],
    }
    await mockDataEndpoints(page, [PAID_ORDER, takeawayOrder])
    await page.goto('/receipts')

    // Both orders visible initially
    await expect(page.getByText('RN0001234')).toBeVisible()
    await expect(page.getByText('RN0009999')).toBeVisible()

    // Filter to Dine-in only
    await page.getByRole('button', { name: 'Dine-in' }).click()
    await expect(page.getByText('RN0001234')).toBeVisible()
    await expect(page.getByText('RN0009999')).not.toBeVisible()

    // Reset to All
    await page.getByRole('button', { name: 'All' }).click()
    await expect(page.getByText('RN0009999')).toBeVisible()
  })

  test('order type filter updates bill count summary', async ({ page }) => {
    const takeawayOrder = {
      ...PAID_ORDER,
      id: 'order-takeaway-2',
      order_type: 'takeaway',
      bill_number: 'RN0009998',
      tables: (null as unknown) as typeof PAID_ORDER['tables'],
    }
    await mockDataEndpoints(page, [PAID_ORDER, takeawayOrder])
    await page.goto('/receipts')

    // Initially 2 of 2
    await expect(page.getByText('2 bills')).toBeVisible()

    // Filter to Dine-in — shows 1 of 2
    await page.getByRole('button', { name: 'Dine-in' }).click()
    await expect(page.getByText('1 of 2 bills')).toBeVisible()
  })

  test('empty state shows type-specific message when order type filter active', async ({ page }) => {
    // Only dine_in orders — filter to Delivery should show empty state
    await mockDataEndpoints(page, [PAID_ORDER])
    await page.goto('/receipts')

    await page.getByRole('button', { name: 'Delivery' }).click()

    await expect(page.getByText('No match', { exact: true })).toBeVisible()
    await expect(page.getByText(/No Delivery orders found/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Show all types' })).toBeVisible()
  })

  test('Escape key closes re-print modal', async ({ page }) => {
    await page.route('**/rest/v1/orders?**', async (route) => {
      const url = route.request().url()
      if (url.includes('id=eq.')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{
            bill_number: 'RN0001234', order_number: 7, created_at: TODAY_ISO,
            final_total_cents: 120000, discount_amount_cents: 0, order_comp: false,
            order_type: 'dine_in', customer_name: null, customer_mobile: null,
            delivery_note: null, delivery_charge: 0, service_charge_cents: 0,
            tables: { label: 'T3' }, delivery_zones: null,
          }]),
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([PAID_ORDER]),
        })
      }
    })

    await page.route('**/rest/v1/config?**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })
    await page.route('**/rest/v1/vat_rates?**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })
    await page.route('**/rest/v1/restaurants?**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })
    await page.route('**/rest/v1/users?**', async (route) => { await route.continue() })
    await mockReprintEndpoints(page)

    await page.goto('/receipts')

    await page.getByRole('button', { name: 'Re-print receipt' }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).not.toBeVisible()
  })

  test('Re-print button applies print-area class to BillPrintView wrapper (issue #431)', async ({ page }) => {
    // Regression test: the hidden print wrapper must receive the `print-area` class
    // when Re-print is clicked so that globals.css @media print reveals the receipt.
    // Before the fix the wrapper had no class, so body * { visibility: hidden } hid
    // everything and nothing appeared in the print preview.
    await page.route('**/rest/v1/orders?**', async (route) => {
      const url = route.request().url()
      if (url.includes('id=eq.')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{
            bill_number: 'RN0001234', order_number: 7, created_at: TODAY_ISO,
            final_total_cents: 120000, discount_amount_cents: 0, order_comp: false,
            order_type: 'dine_in', customer_name: null, customer_mobile: null,
            delivery_note: null, delivery_charge: 0, service_charge_cents: 0,
            tables: { label: 'T3' }, delivery_zones: null,
          }]),
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([PAID_ORDER]),
        })
      }
    })
    await page.route('**/rest/v1/config?**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })
    await page.route('**/rest/v1/vat_rates?**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })
    await page.route('**/rest/v1/restaurants?**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })
    await page.route('**/rest/v1/users?**', async (route) => { await route.continue() })
    await mockReprintEndpoints(page)

    // Intercept window.print so the browser doesn't open a real print dialog
    await page.addInitScript(() => { window.print = () => {} })

    await page.goto('/receipts')
    await page.getByRole('button', { name: 'Re-print receipt' }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await page.getByRole('dialog').getByRole('button', { name: 'Re-print' }).click()

    // After clicking Re-print the wrapper div must have the print-area class so that
    // globals.css @media print makes it visible.
    const wrapper = page.locator('[aria-hidden="true"].print-area').first()
    await expect(wrapper).toBeAttached()
  })
})
