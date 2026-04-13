/**
 * E2E tests for /receipts — Bill Receipt History (issue #395)
 *
 * Covers:
 * - Staff view: shift receipts filtered by server_id (shows own orders only)
 * - Admin view: full history with date filter and daily totals
 * - Re-print modal opens with correct receipt data
 *
 * All Supabase API calls are mocked via page.route() to avoid real DB dependency.
 * viewport: 1280x800 (per CLAUDE.md requirement)
 */

import { test, expect } from '@playwright/test'

test.use({ viewport: { width: 1280, height: 800 }, storageState: 'e2e/.auth/admin.json' })

const PAID_ORDER = {
  id: 'order-test-1',
  bill_number: 'RN0001234',
  order_number: 7,
  created_at: new Date().toISOString(),
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

/** Shared auth + config mocks */
async function setupMocks(
  page: import('@playwright/test').Page,
  role: 'owner' | 'server' = 'server',
) {
  const userId = role === 'owner' ? 'user-admin-1' : 'user-staff-1'

  await page.route('**/auth/v1/user**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: userId, email: `${role}@test.com`, role: 'authenticated' }),
    })
  })

  await page.route('**/rest/v1/users?**', async (route) => {
    const url = route.request().url()
    if (url.includes('select=role')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ role }]),
      })
    } else if (url.includes('select=id')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: userId, name: role === 'owner' ? 'Admin User' : 'Staff User', email: `${role}@test.com` }]),
      })
    } else {
      await route.continue()
    }
  })

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
}

// ─── Staff tests ─────────────────────────────────────────────────────────────

test.describe('Staff (server) view', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page, 'server')
  })

  test('shows Shift Receipts heading for staff', async ({ page }) => {
    await page.route('**/rest/v1/orders?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([PAID_ORDER]),
      })
    })

    await page.goto('/receipts')

    await expect(page.getByRole('heading', { name: 'Shift Receipts' })).toBeVisible()
  })

  test('displays receipt entry with bill number and table', async ({ page }) => {
    await page.route('**/rest/v1/orders?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([PAID_ORDER]),
      })
    })

    await page.goto('/receipts')

    await expect(page.getByText('RN0001234')).toBeVisible()
    await expect(page.getByText('T3')).toBeVisible()
    // Use first match to avoid strict mode violation (summary card + row)
    await expect(page.getByText(/1,200/).first()).toBeVisible()
  })

  test('shows Receipts link in navigation header', async ({ page }) => {
    await page.route('**/rest/v1/orders?**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })

    await page.goto('/receipts')

    const receiptsLink = page.getByRole('link', { name: /Receipts/i })
    await expect(receiptsLink).toBeVisible()
    await expect(receiptsLink).toHaveAttribute('href', '/receipts')
  })

  test('shows empty state when no receipts found', async ({ page }) => {
    await page.route('**/rest/v1/orders?**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })

    await page.goto('/receipts')

    // Use exact text match to avoid strict mode violation with subtitle text
    await expect(page.getByText('No receipts found', { exact: true })).toBeVisible()
    await expect(page.getByText(/No receipts found for your current shift/)).toBeVisible()
  })

  test('receipt row expands to show payment breakdown', async ({ page }) => {
    await page.route('**/rest/v1/orders?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([PAID_ORDER]),
      })
    })

    await page.goto('/receipts')

    await page.getByRole('button', { name: 'Expand receipt details' }).click()

    await expect(page.getByText('Payment breakdown')).toBeVisible()
    await expect(page.getByText('Total Paid')).toBeVisible()
  })
})

// ─── Admin tests ──────────────────────────────────────────────────────────────

test.describe('Admin (owner) view', () => {
  test.beforeEach(async ({ page }) => {
    await setupMocks(page, 'owner')
  })

  test('shows Bill History heading and date filter for admin', async ({ page }) => {
    await page.route('**/rest/v1/orders?**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })

    await page.goto('/receipts')

    await expect(page.getByRole('heading', { name: 'Bill History' })).toBeVisible()
    await expect(page.getByRole('checkbox', { name: 'Date range' })).toBeVisible()
  })

  test('shows daily total and order count in summary card', async ({ page }) => {
    await page.route('**/rest/v1/orders?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          PAID_ORDER,
          { ...PAID_ORDER, id: 'order-test-2', final_total_cents: 80000, bill_number: 'RN0001235' },
        ]),
      })
    })

    await page.goto('/receipts')

    // Total: ৳ 2,000.00 — use first() to avoid strict mode violation
    await expect(page.getByText(/2,000/).first()).toBeVisible()
    await expect(page.getByText('2 bills')).toBeVisible()
  })

  test('enables date range mode when checkbox checked', async ({ page }) => {
    await page.route('**/rest/v1/orders?**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })

    await page.goto('/receipts')

    const rangeCheckbox = page.getByRole('checkbox', { name: 'Date range' })
    await rangeCheckbox.check()

    // Two date inputs should appear (from / to)
    await expect(page.locator('input[type="date"]').first()).toBeVisible()
    await expect(page.locator('input[type="date"]').nth(1)).toBeVisible()
  })

  test('re-print modal opens and shows Re-print button', async ({ page }) => {
    await page.route('**/rest/v1/orders?**', async (route) => {
      // Route must match list query (no id= filter) vs single-order query
      const url = route.request().url()
      if (url.includes('id=eq.')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{
            bill_number: 'RN0001234',
            order_number: 7,
            created_at: new Date().toISOString(),
            final_total_cents: 120000,
            discount_amount_cents: 0,
            order_comp: false,
            order_type: 'dine_in',
            customer_name: null,
            customer_mobile: null,
            delivery_note: null,
            delivery_charge: 0,
            service_charge_cents: 0,
            tables: { label: 'T3' },
            delivery_zones: null,
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

    await page.route('**/rest/v1/order_items?**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })

    await page.route('**/rest/v1/payments?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ method: 'cash', amount_cents: 120000, tendered_amount_cents: 150000 }]),
      })
    })

    await page.goto('/receipts')

    // Click the reprint icon button on the receipt row
    await page.getByRole('button', { name: 'Re-print receipt' }).first().click()

    // Dialog should appear
    await expect(page.getByRole('dialog')).toBeVisible()
    // Modal has bill number heading
    await expect(page.getByText('RN0001234').first()).toBeVisible()
    // Re-print button inside modal (use the one inside the dialog)
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
            bill_number: 'RN0001234', order_number: 7, created_at: new Date().toISOString(),
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

    await page.route('**/rest/v1/order_items?**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })

    await page.route('**/rest/v1/payments?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ method: 'cash', amount_cents: 120000, tendered_amount_cents: 150000 }]),
      })
    })

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
            bill_number: 'RN0001234', order_number: 7, created_at: new Date().toISOString(),
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

    await page.route('**/rest/v1/order_items?**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })

    await page.route('**/rest/v1/payments?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ method: 'cash', amount_cents: 120000, tendered_amount_cents: null }]),
      })
    })

    await page.goto('/receipts')

    await page.getByRole('button', { name: 'Re-print receipt' }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).not.toBeVisible()
  })
})
