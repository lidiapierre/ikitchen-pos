import { test, expect, type BrowserContext } from '@playwright/test'

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://dmaogdwtgohrhbytxjqu.supabase.co'

/**
 * Create a fresh browser context with NO auth cookies to simulate an
 * unauthenticated visitor. The default storageState (admin session) is
 * intentionally overridden per-test where needed.
 */
async function unauthenticatedContext(
  browser: import('@playwright/test').Browser,
): Promise<BrowserContext> {
  return browser.newContext({ storageState: { cookies: [], origins: [] } })
}

// These tests run without auth — use the bare browser fixture
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Auth redirect — unauthenticated', () => {
  test('unauthenticated visit to /tables redirects to /login', async ({ page }) => {
    await page.goto('/tables')
    await expect(page).toHaveURL(/\/login/)
    await expect(page.locator('h1')).toContainText('Lahore by iKitchen')
  })

  test('unauthenticated visit to /admin redirects to /login', async ({ page }) => {
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/login/)
  })

  test('login page shows sign-in form and no registration link', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
    await expect(page.getByText(/sign up|register|create account/i)).not.toBeVisible()
  })

  test('failed login shows error message', async ({ page }) => {
    await page.route(`${SUPABASE_URL}/auth/v1/token**`, (route) => {
      void route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'invalid_grant',
          error_description: 'Invalid login credentials',
        }),
      })
    })

    await page.goto('/login')
    await page.getByLabel(/email/i).fill('wrong@example.com')
    await page.getByLabel(/password/i).fill('wrongpassword')
    await page.getByRole('button', { name: /sign in/i }).click()

    // Use a specific selector to avoid matching Next.js router announcer
    await expect(page.locator('[role="alert"]:not([id="__next-route-announcer__"])')).toContainText(
      /invalid email or password/i,
    )
  })
})
