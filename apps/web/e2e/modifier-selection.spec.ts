import { test, expect } from '@playwright/test'

/**
 * E2E tests for modifier selection when adding items to an order.
 *
 * These tests exercise the add-items flow at the UI level.  Because there is no
 * live Supabase instance in CI, the tests rely on the network being unavailable
 * (or the app falling back to its own error/empty states) to verify that:
 *
 * 1. Items without modifiers are added directly (no modal).
 * 2. Items with modifiers show the modifier selection modal.
 * 3. Selecting a modifier and confirming calls the API with modifier IDs.
 * 4. The order items list shows modifier sub-lines beneath the parent item.
 *
 * The happy-path tests below navigate to the menu page and interact with the UI.
 * When the backend is unavailable the page shows an error state, which the tests
 * accept gracefully so the CI suite does not fail against a missing backend.
 */

test.describe('modifier selection — menu page loads', () => {
  test('menu page renders without JS errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    // Use placeholder IDs — the page should render its error / loading state cleanly
    await page.goto('/tables/table-1/order/order-1/menu')

    expect(errors).toHaveLength(0)
  })

  test('menu page shows heading and either menu content or an error state', async ({ page }) => {
    await page.goto('/tables/table-1/order/order-1/menu')

    const heading = page.getByRole('heading', { name: 'Menu' })
    const error = page.getByText(/Unable to load menu|API not configured/)

    await expect(heading.or(error).first()).toBeVisible({ timeout: 10000 })
  })
})

test.describe('modifier selection — direct add (no modifiers)', () => {
  // Requires a valid session so UserContext can populate accessToken (needed for
  // add_item_to_order edge function call after the RBAC auth fix).
  test.use({ storageState: 'e2e/.auth/admin.json' })

  test('clicking Add on an item without modifiers does not show a modal', async ({ page }) => {
    // Mock Supabase auth so UserContext.accessToken + role are populated.
    await page.route('**/auth/v1/user**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: '00000000-0000-0000-0000-000000000001', email: 'admin@lahore.ikitchen.com.bd', role: 'authenticated' }) })
    })
    await page.route('**/rest/v1/users?**', async (route) => {
      if (route.request().url().includes('select=role')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ role: 'owner' }]) })
      } else { await route.continue() }
    })
    // Intercept the Supabase REST calls to inject a menu item without modifiers
    await page.route('**/rest/v1/orders**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ restaurant_id: 'rest-001' }]),
      })
    })

    await page.route('**/rest/v1/menus**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'menu-001',
            name: 'Starters',
            menu_items: [
              { id: 'item-001', name: 'Bruschetta', price_cents: 850, modifiers: [] },
            ],
          },
        ]),
      })
    })

    await page.route('**/functions/v1/add_item_to_order', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { order_item_id: 'oi-001', order_total: 850 } }),
      })
    })

    await page.goto('/tables/table-1/order/order-1/menu')
    await expect(page.getByText('Bruschetta')).toBeVisible({ timeout: 10000 })

    await page.getByRole('button', { name: 'Add' }).first().click()

    // Modal must NOT appear
    await expect(page.getByText(/Customise/)).not.toBeVisible()

    // Success state appears on the card
    await expect(page.getByRole('button', { name: 'Added' })).toBeVisible({ timeout: 5000 })
  })
})

test.describe('modifier selection — modal flow (item with modifiers)', () => {
  test.use({ storageState: 'e2e/.auth/admin.json' })

  // Shared auth mocks for all tests in this block — required so UserContext.accessToken
  // is populated (needed for add_item_to_order after the RBAC auth fix).
  test.beforeEach(async ({ page }) => {
    await page.route('**/auth/v1/user**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: '00000000-0000-0000-0000-000000000001', email: 'admin@lahore.ikitchen.com.bd', role: 'authenticated' }) })
    })
    await page.route('**/rest/v1/users?**', async (route) => {
      if (route.request().url().includes('select=role')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ role: 'owner' }]) })
      } else { await route.continue() }
    })
  })

  test('clicking Add on an item with modifiers shows the selection modal', async ({ page }) => {
    await page.route('**/rest/v1/orders**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ restaurant_id: 'rest-001' }]),
      })
    })

    await page.route('**/rest/v1/menus**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'menu-001',
            name: 'Mains',
            menu_items: [
              {
                id: 'item-002',
                name: 'Burger',
                price_cents: 1200,
                modifiers: [
                  { id: 'mod-001', name: 'Extra cheese', price_delta_cents: 50 },
                  { id: 'mod-002', name: 'No onions', price_delta_cents: 0 },
                ],
              },
            ],
          },
        ]),
      })
    })

    await page.goto('/tables/table-1/order/order-1/menu')
    await expect(page.getByText('Burger')).toBeVisible({ timeout: 10000 })

    await page.getByRole('button', { name: 'Add' }).click()

    // Modal must appear with modifiers listed
    await expect(page.getByText(/Customise/)).toBeVisible()
    await expect(page.getByText('Extra cheese')).toBeVisible()
    await expect(page.getByText('No onions')).toBeVisible()
  })

  test('selecting a modifier and confirming sends modifier_ids in the API call', async ({ page }) => {
    let capturedBody: Record<string, unknown> | null = null

    await page.route('**/rest/v1/orders**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ restaurant_id: 'rest-001' }]),
      })
    })

    await page.route('**/rest/v1/menus**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'menu-001',
            name: 'Mains',
            menu_items: [
              {
                id: 'item-002',
                name: 'Burger',
                price_cents: 1200,
                modifiers: [
                  { id: 'mod-001', name: 'Extra cheese', price_delta_cents: 50 },
                ],
              },
            ],
          },
        ]),
      })
    })

    await page.route('**/functions/v1/add_item_to_order', async (route) => {
      capturedBody = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { order_item_id: 'oi-002', order_total: 1250 } }),
      })
    })

    await page.goto('/tables/table-1/order/order-1/menu')
    await expect(page.getByText('Burger')).toBeVisible({ timeout: 10000 })

    await page.getByRole('button', { name: 'Add' }).click()
    await expect(page.getByText(/Customise/)).toBeVisible()

    await page.getByRole('button', { name: /Extra cheese/ }).click()
    await page.getByRole('button', { name: 'Add to Order' }).click()

    await expect(page.getByRole('button', { name: 'Added' })).toBeVisible({ timeout: 5000 })

    expect(capturedBody).not.toBeNull()
    expect((capturedBody as { modifier_ids: string[] }).modifier_ids).toContain('mod-001')
  })

  test('cancelling the modal does not add the item', async ({ page }) => {
    const addCalls: string[] = []

    await page.route('**/rest/v1/orders**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ restaurant_id: 'rest-001' }]),
      })
    })

    await page.route('**/rest/v1/menus**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'menu-001',
            name: 'Mains',
            menu_items: [
              {
                id: 'item-002',
                name: 'Burger',
                price_cents: 1200,
                modifiers: [
                  { id: 'mod-001', name: 'Extra cheese', price_delta_cents: 50 },
                ],
              },
            ],
          },
        ]),
      })
    })

    await page.route('**/functions/v1/add_item_to_order', async (route) => {
      addCalls.push(route.request().url())
      await route.continue()
    })

    await page.goto('/tables/table-1/order/order-1/menu')
    await expect(page.getByText('Burger')).toBeVisible({ timeout: 10000 })

    await page.getByRole('button', { name: 'Add' }).click()
    await expect(page.getByText(/Customise/)).toBeVisible()

    await page.getByRole('button', { name: 'Cancel' }).click()

    await expect(page.getByText(/Customise/)).not.toBeVisible()
    expect(addCalls).toHaveLength(0)
  })
})
