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
    let capturedUrl = ''
    await page.route('**/rest/v1/orders?**', async (route) => {
      capturedUrl = route.request().url()
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

    await page.goto('/receipts')
    // Wait for the orders fetch (triggered after userId resolves)
    await page.waitForRequest('**/rest/v1/orders?**', { timeout: 10000 })

    // Staff view must include server_id filter (exact ID comes from real session)
    expect(decodeURIComponent(capturedUrl)).toContain('server_id=eq.')
    expect(capturedUrl).not.toContain('server_id=eq.undefined')
    expect(capturedUrl).not.toContain('server_id=eq.null')
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
})
