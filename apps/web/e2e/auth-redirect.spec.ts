import { test, expect } from '@playwright/test'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://dmaogdwtgohrhbytxjqu.supabase.co'

/** Stub all Supabase auth endpoints to simulate an unauthenticated session */
async function stubUnauthenticated(page: import('@playwright/test').Page): Promise<void> {
  await page.route(`${SUPABASE_URL}/auth/v1/**`, (route) => {
    void route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'JWT expired' }),
    })
  })
}

/** Stub all Supabase auth endpoints to simulate an authenticated session */
async function stubAuthenticated(page: import('@playwright/test').Page): Promise<void> {
  await page.route(`${SUPABASE_URL}/auth/v1/user`, (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: '25842b19-b4c9-493c-ac46-724088180929',
        email: 'admin@lahore.ikitchen.com.bd',
        role: 'authenticated',
      }),
    })
  })
}

test.describe('Auth redirect', () => {
  test('unauthenticated visit to /tables redirects to /login', async ({ page }) => {
    await stubUnauthenticated(page)
    await page.goto('/tables')
    await expect(page).toHaveURL(/\/login/)
    await expect(page.locator('h1')).toContainText('Lahore by iKitchen')
  })

  test('unauthenticated visit to /admin redirects to /login', async ({ page }) => {
    await stubUnauthenticated(page)
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/login/)
  })

  test('login page shows sign-in form and no registration link', async ({ page }) => {
    await stubUnauthenticated(page)
    await page.goto('/login')
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
    await expect(page.getByText(/sign up|register|create account/i)).not.toBeVisible()
  })

  test('failed login shows error message', async ({ page }) => {
    await page.route(`${SUPABASE_URL}/auth/v1/token**`, (route) => {
      void route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials' }),
      })
    })

    await page.goto('/login')
    await page.getByLabel(/email/i).fill('wrong@example.com')
    await page.getByLabel(/password/i).fill('wrongpassword')
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page.getByRole('alert')).toContainText(/invalid email or password/i)
  })
})
