import { test, expect } from '@playwright/test'

/**
 * E2E tests for menu item search on the order menu page.
 *
 * Because there is no live Supabase instance in CI, the page renders its
 * error / loading state when fetching menu data. The tests verify:
 *
 * 1. The search input is present and auto-focused on page load.
 * 2. Typing into the search input updates its value.
 * 3. The clear (×) button appears when text is entered and clears the input.
 * 4. The page handles the no-backend state gracefully (no JS errors).
 *
 * Full search-result filtering is covered by unit tests in menuSearch.test.ts.
 */

test.describe('menu search — UI', () => {
  test('search input is present on menu page', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto('/tables/table-1/order/order-1/menu')

    const searchInput = page.getByRole('textbox', { name: /search menu items/i })
    await expect(searchInput).toBeVisible({ timeout: 10000 })

    expect(errors).toHaveLength(0)
  })

  test('search input accepts text and shows clear button', async ({ page }) => {
    await page.goto('/tables/table-1/order/order-1/menu')

    const searchInput = page.getByRole('textbox', { name: /search menu items/i })
    await expect(searchInput).toBeVisible({ timeout: 10000 })

    await searchInput.fill('Biryani')
    await expect(searchInput).toHaveValue('Biryani')

    const clearButton = page.getByRole('button', { name: /clear search/i })
    await expect(clearButton).toBeVisible()
  })

  test('clear button resets the search input', async ({ page }) => {
    await page.goto('/tables/table-1/order/order-1/menu')

    const searchInput = page.getByRole('textbox', { name: /search menu items/i })
    await expect(searchInput).toBeVisible({ timeout: 10000 })

    await searchInput.fill('Karahi')
    await expect(searchInput).toHaveValue('Karahi')

    const clearButton = page.getByRole('button', { name: /clear search/i })
    await clearButton.click()

    await expect(searchInput).toHaveValue('')
    await expect(clearButton).not.toBeVisible()
  })

  test('search input is auto-focused on page load', async ({ page }) => {
    await page.goto('/tables/table-1/order/order-1/menu')

    const searchInput = page.getByRole('textbox', { name: /search menu items/i })
    await expect(searchInput).toBeVisible({ timeout: 10000 })

    await expect(searchInput).toBeFocused()
  })
})
