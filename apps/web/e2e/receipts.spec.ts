/**
 * E2E tests for /receipts — Bill Receipt History (issue #395)
 *
 * Covers:
 * - Staff view: shift receipts filtered by server_id (shows own orders only)
 * - Admin view: full history with date filter and daily totals
 * - Re-print modal opens with correct receipt data
 *
 * All Supabase API calls are mocked via page.route() to avoid real DB dependency.
 */

import { test, expect } from '@playwright/test'

test.use({ viewport: { width: 1280, height: 800 } })

const TODAY = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD in local TZ

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

/** Mocks used in all tests */
async function setupAuthAndConfig(
  page: import('@playwright/test').Page,
  role: 'owner' | 'server' = 'server',
) {
  const userId = role === 'owner' ? 'user-admin-1' : 'user-staff-1'

  // Auth
  await page.route('**/auth/v1/user**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: userId, email: `${role}@test.com`, role: 'authenticated' }),
    })
  })

  // User role lookup
  await page.route('**/rest/v1/users?**', async (route) => {
    const url = route.request().url()
    if (url.includes('select=role')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ role }]),
      })
    } else if (url.includes('select=id%2Cname%2Cemail')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: userId, name: 'Test User', email: `${role}@test.com` }]),
      })
    } else {
      await route.continue()
    }
  })

  // Restaurant config
  await page.route('**/rest/v1/config?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ key: 'restaurant_address', value: 'Test Address' }]),
    })
  })

  // VAT
  await page.route('**/rest/v1/vat_rates?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ rate: 0, tax_inclusive: false }]),
    })
  })

  // Restaurants
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
    await setupAuthAndConfig(page, 'server')
  })

  test('shows shift receipts page for staff', async ({ page }) => {
    await page.route('**/rest/v1/orders?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([PAID_ORDER]),
      })
    })

    await page.goto('/receipts')

    await expect(page.getByRole('heading', { name: 'Shift Receipts' })).toBeVisible()
    await expect(page.getByText("Today's receipts — your orders only")).toBeVisible()
  })

  test('displays receipt entry with bill number, table, and total', async ({ page }) => {
    await page.route('**/rest/v1/orders?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([PAID_ORDER]),
      })
    })

    await page.goto('/receipts')

    // Bill number
    await expect(page.getByText('RN0001234')).toBeVisible()
    // Table
    await expect(page.getByText('T3')).toBeVisible()
    // Total (৳ 1,200.00 or similar)
    await expect(page.getByText(/1,200/)).toBeVisible()
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

    await expect(page.getByText('No receipts found')).toBeVisible()
    await expect(page.getByText(/No receipts found for your current shift/)).toBeVisible()
  })

  test('staff view requests orders filtered by server_id', async ({ page }) => {
    let capturedUrl = ''
    await page.route('**/rest/v1/orders?**', async (route) => {
      capturedUrl = route.request().url()
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })

    // Set localStorage shift so staff self-filter triggers immediately
    await page.goto('/receipts')
    await page.evaluate(() => {
      localStorage.setItem('ikitchen_active_shift', JSON.stringify({
        shift_id: 'shift-1',
        started_at: new Date().toISOString(),
      }))
    })
    await page.reload()
    await page.waitForLoadState('networkidle')

    expect(capturedUrl).toContain('server_id=eq.user-staff-1')
  })
})

// ─── Admin tests ──────────────────────────────────────────────────────────────

test.describe('Admin (owner) view', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthAndConfig(page, 'owner')
  })

  test('shows Bill History heading and date filter for admin', async ({ page }) => {
    await page.route('**/rest/v1/orders?**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })

    await page.goto('/receipts')

    await expect(page.getByRole('heading', { name: 'Bill History' })).toBeVisible()
    // Admin sees a date input
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

    // Total: 120000 + 80000 = 200000 = ৳ 2,000.00
    await expect(page.getByText(/2,000/)).toBeVisible()
    // Count
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

  test('re-print modal opens when Printer button clicked', async ({ page }) => {
    await page.route('**/rest/v1/orders?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([PAID_ORDER]),
      })
    })

    // Mock the re-print order detail fetch
    await page.route('**/rest/v1/orders?id=eq.*', async (route) => {
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

    // Click the reprint button
    await page.getByRole('button', { name: 'Re-print receipt' }).first().click()

    // Modal should appear with dialog role
    await expect(page.getByRole('dialog')).toBeVisible()
    // Re-print button in modal
    await expect(page.getByRole('button', { name: 'Re-print' })).toBeVisible()
  })

  test('closes re-print modal when Close button clicked', async ({ page }) => {
    await page.route('**/rest/v1/orders?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([PAID_ORDER]),
      })
    })

    await page.route('**/rest/v1/orders?id=eq.*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ ...PAID_ORDER, tables: { label: 'T3' }, delivery_zones: null }]),
      })
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

    await page.getByRole('button', { name: 'Close' }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
  })

  test('receipt row expands to show payment breakdown on chevron click', async ({ page }) => {
    await page.route('**/rest/v1/orders?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([PAID_ORDER]),
      })
    })

    await page.goto('/receipts')

    // Expand the row
    await page.getByRole('button', { name: 'Expand receipt details' }).click()

    // Expanded detail should show payment breakdown
    await expect(page.getByText('Payment breakdown')).toBeVisible()
    await expect(page.getByText('Total Paid')).toBeVisible()
  })
})
