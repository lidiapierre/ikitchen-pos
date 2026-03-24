import { test, expect } from '@playwright/test'

test.describe('Auth redirect', () => {
  test('unauthenticated visit to /tables redirects to /login', async ({ page }) => {
    // Intercept Supabase auth token call to simulate unauthenticated state
    await page.route('**/auth/v1/token**', (route) => {
      void route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials' }),
      })
    })

    await page.route('**/auth/v1/user**', (route) => {
      void route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'JWT expired' }),
      })
    })

    await page.goto('/tables')
    await expect(page).toHaveURL(/\/login/)
    await expect(page.locator('h1')).toContainText('Lahore by iKitchen')
  })
})
