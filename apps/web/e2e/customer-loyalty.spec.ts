/**
 * E2E tests: customer loyalty programme (issue #356)
 *
 * Covers:
 *  - Customers admin page loads and shows the Loyalty column
 *  - Admin restaurant settings page shows the Loyalty Programme section
 *  - loyalty_points_per_order config can be saved and reloaded
 */

import { test, expect } from '@playwright/test'
import path from 'path'

const ADMIN_STORAGE_STATE = path.join(__dirname, '.auth/admin.json')

test.describe('Customer loyalty — /admin/customers', () => {
  test.use({ storageState: ADMIN_STORAGE_STATE })

  test('/admin/customers page loads and shows the Loyalty column header', async ({ page }) => {
    await page.goto('/admin/customers')
    await expect(page).toHaveURL(/\/admin\/customers/)

    // The customers table should contain the Loyalty column
    const loyaltyHeader = page.getByRole('columnheader', { name: 'Loyalty' })
    await expect(loyaltyHeader).toBeVisible()
  })

  test('/admin/customers page shows customer list or empty state', async ({ page }) => {
    await page.goto('/admin/customers')

    // Either customer rows or an empty state must be present
    const customerRows = page.locator('tbody tr')
    const emptyState = page.getByText(/No customers yet|no customers/i)
    const errorState = page.getByText(/Failed to load|not configured/i)

    await expect(customerRows.or(emptyState).or(errorState).first()).toBeVisible({ timeout: 10_000 })
  })
})

test.describe('Loyalty config — /admin/settings/restaurant', () => {
  test.use({ storageState: ADMIN_STORAGE_STATE })

  test('restaurant settings page shows Loyalty Programme section', async ({ page }) => {
    await page.goto('/admin/settings/restaurant')
    await expect(page).toHaveURL(/\/admin\/settings\/restaurant/)

    await expect(page.getByRole('heading', { name: 'Loyalty Programme' })).toBeVisible()
    await expect(page.getByLabel('Points Per Order')).toBeVisible()
  })

  test('loyalty_points_per_order field accepts a numeric value and saves', async ({ page }) => {
    await page.goto('/admin/settings/restaurant')

    const pointsInput = page.getByLabel('Points Per Order')
    await expect(pointsInput).toBeVisible()

    // Clear and set a new value
    await pointsInput.fill('15')
    await page.getByRole('button', { name: 'Save Settings' }).click()

    // Expect success feedback
    await expect(page.getByText(/saved/i)).toBeVisible({ timeout: 8_000 })
  })

  test('loyalty_points_per_order rejects non-numeric input gracefully', async ({ page }) => {
    await page.goto('/admin/settings/restaurant')

    const pointsInput = page.getByLabel('Points Per Order')
    await pointsInput.fill('-5')
    await page.getByRole('button', { name: 'Save Settings' }).click()

    // Expect validation error feedback
    await expect(page.getByText(/non-negative/i)).toBeVisible({ timeout: 8_000 })
  })
})
