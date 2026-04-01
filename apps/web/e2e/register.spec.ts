import { test, expect } from '@playwright/test'

/**
 * E2E tests for the /register page (super-admin restaurant provisioning).
 * Viewport: 1280x800 (set globally in playwright.config.ts).
 */

test.describe('/register page — unauthenticated', () => {
  // Override the default authenticated storageState for this describe block
  test.use({ storageState: { cookies: [], origins: [] } })

  test('unauthenticated user sees login prompt', async ({ page }) => {
    await page.goto('/register')

    // The page is accessible (middleware lets unauthenticated users through)
    await expect(page).toHaveURL(/\/register/)

    // The form shows a "please log in" message for unauthenticated visitors
    await expect(page.getByText(/please log in to complete registration/i)).toBeVisible()
  })

  test('page heading "Set up your restaurant" is visible', async ({ page }) => {
    await page.goto('/register')

    await expect(page.getByRole('heading', { name: /set up your restaurant/i })).toBeVisible()
  })
})

test.describe('/register page — authenticated super-admin', () => {
  // Uses the default authenticated admin storageState from playwright.config.ts

  test('authenticated super-admin sees the restaurant name input', async ({ page }) => {
    await page.goto('/register')

    // Page heading should still be present
    await expect(page.getByRole('heading', { name: /set up your restaurant/i })).toBeVisible()

    // The provisioning form should render with the restaurant name field
    // (public variant skips the permission check and shows the form directly)
    await expect(page.getByLabel(/restaurant name/i)).toBeVisible()
  })
})
