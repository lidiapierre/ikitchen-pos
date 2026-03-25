import { test, expect } from '@playwright/test'

/**
 * E2E tests for menu item availability toggle ("86'd items") — issue #182.
 *
 * These tests verify the UI behaviour of the availability toggle without a
 * live backend. They cover:
 *
 * 1. The availability toggle is present on the admin edit form.
 * 2. The toggle changes visual state (aria-checked) when clicked.
 * 3. On the order menu page, items rendered with available=false are
 *    visually greyed out and show an "Unavailable" badge.
 * 4. Unavailable items cannot be clicked (button is disabled).
 *
 * Full round-trip (toggle → DB → order menu) is covered by integration
 * tests that require a live Supabase instance.
 */

test.describe('item availability — admin toggle UI', () => {
  test('availability switch is present on the edit form', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto('/admin/menu/new')

    // The toggle should be rendered (even while the form loads)
    const toggle = page.getByRole('switch', { name: /toggle item availability/i })
    await expect(toggle).toBeVisible({ timeout: 10000 })

    expect(errors).toHaveLength(0)
  })

  test('availability switch defaults to "on" (available)', async ({ page }) => {
    await page.goto('/admin/menu/new')

    const toggle = page.getByRole('switch', { name: /toggle item availability/i })
    await expect(toggle).toBeVisible({ timeout: 10000 })

    await expect(toggle).toHaveAttribute('aria-checked', 'true')
  })

  test('clicking availability switch toggles its state', async ({ page }) => {
    await page.goto('/admin/menu/new')

    const toggle = page.getByRole('switch', { name: /toggle item availability/i })
    await expect(toggle).toBeVisible({ timeout: 10000 })
    await expect(toggle).toHaveAttribute('aria-checked', 'true')

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'false')

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
  })
})

test.describe('item availability — order menu page', () => {
  test('menu page loads without JS errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto('/tables/table-1/order/order-1/menu')

    // Wait for the page to settle (search input is a good indicator)
    const searchInput = page.getByRole('textbox', { name: /search menu items/i })
    await expect(searchInput).toBeVisible({ timeout: 10000 })

    expect(errors).toHaveLength(0)
  })

  test('unavailable item card has greyed-out styling and Unavailable badge', async ({ page }) => {
    /**
     * We inject a mock menu category into the page via route interception
     * so we can test the UI rendering of an unavailable item without a DB.
     */
    await page.route('**/rest/v1/orders**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ restaurant_id: 'rest-1' }]),
      })
    })

    await page.route('**/rest/v1/menus**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'menu-1',
            name: 'Mains',
            menu_items: [
              {
                id: 'item-available',
                name: 'Chicken Tikka',
                price_cents: 1200,
                available: true,
                modifiers: [],
              },
              {
                id: 'item-unavailable',
                name: 'Lamb Chops',
                price_cents: 1800,
                available: false,
                modifiers: [],
              },
            ],
          },
        ]),
      })
    })

    await page.goto('/tables/table-1/order/order-1/menu')

    // Wait for items to render
    await expect(page.getByText('Chicken Tikka')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Lamb Chops')).toBeVisible()

    // Unavailable item should show the badge
    await expect(page.getByText('Unavailable')).toBeVisible()

    // Unavailable item's card should have opacity class
    const unavailableCard = page.getByText('Lamb Chops').locator('..').locator('..')
    await expect(unavailableCard).toHaveClass(/opacity-40/)
  })

  test('unavailable item Add button is disabled', async ({ page }) => {
    await page.route('**/rest/v1/orders**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ restaurant_id: 'rest-1' }]),
      })
    })

    await page.route('**/rest/v1/menus**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'menu-1',
            name: 'Mains',
            menu_items: [
              {
                id: 'item-unavailable',
                name: 'Lamb Chops',
                price_cents: 1800,
                available: false,
                modifiers: [],
              },
            ],
          },
        ]),
      })
    })

    await page.goto('/tables/table-1/order/order-1/menu')

    await expect(page.getByText('Lamb Chops')).toBeVisible({ timeout: 10000 })

    // The button should be disabled
    const addButton = page.getByRole('button', { name: /86|unavailable/i })
    await expect(addButton).toBeDisabled()
  })

  test('available item Add button is enabled', async ({ page }) => {
    await page.route('**/rest/v1/orders**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ restaurant_id: 'rest-1' }]),
      })
    })

    await page.route('**/rest/v1/menus**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'menu-1',
            name: 'Mains',
            menu_items: [
              {
                id: 'item-available',
                name: 'Chicken Tikka',
                price_cents: 1200,
                available: true,
                modifiers: [],
              },
            ],
          },
        ]),
      })
    })

    await page.goto('/tables/table-1/order/order-1/menu')

    await expect(page.getByText('Chicken Tikka')).toBeVisible({ timeout: 10000 })

    const addButton = page.getByRole('button', { name: /^add$/i })
    await expect(addButton).toBeEnabled()
  })
})
