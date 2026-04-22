import { test, expect } from '@playwright/test'

/**
 * E2E tests for the FeedbackWidget.
 *
 * These tests run as the authenticated admin user (storageState is set globally
 * in playwright.config.ts). The Slack webhook call is intercepted at the network
 * layer so tests work without a real Slack integration.
 */

test.describe('FeedbackWidget', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept the Slack webhook so we don't actually post during CI
    await page.route('https://hooks.slack.com/**', (route) => {
      void route.fulfill({ status: 200, body: 'ok' })
    })

    // Intercept the /api/feedback route to avoid needing the real Slack env var in E2E
    await page.route('**/api/feedback', (route) => {
      void route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      })
    })

    await page.goto('/tables')
  })

  test('floating Feedback button is visible on authenticated pages', async ({ page }) => {
    await expect(page.getByRole('button', { name: /open feedback form/i })).toBeVisible()
  })

  test('clicking Feedback button opens the modal', async ({ page }) => {
    await page.getByRole('button', { name: /open feedback form/i }).click()

    await expect(page.getByRole('heading', { name: /send feedback/i })).toBeVisible()
    await expect(page.getByPlaceholder(/describe the bug/i)).toBeVisible()
  })

  test('Cancel closes the modal', async ({ page }) => {
    await page.getByRole('button', { name: /open feedback form/i }).click()
    await expect(page.getByRole('heading', { name: /send feedback/i })).toBeVisible()

    await page.getByRole('button', { name: /cancel/i }).click()
    await expect(page.getByRole('heading', { name: /send feedback/i })).not.toBeVisible()
  })

  test('Submit is disabled when description is empty', async ({ page }) => {
    await page.getByRole('button', { name: /open feedback form/i }).click()
    await expect(page.getByRole('button', { name: /send feedback/i })).toBeDisabled()
  })

  test('happy path — fills form, submits, shows success state', async ({ page }) => {
    await page.getByRole('button', { name: /open feedback form/i }).click()

    await page.getByPlaceholder(/describe the bug/i).fill('The checkout button is unresponsive on tablet.')

    const submitBtn = page.getByRole('button', { name: /send feedback/i })
    await expect(submitBtn).not.toBeDisabled()
    await submitBtn.click()

    // Success state should appear
    await expect(page.getByText(/feedback sent/i)).toBeVisible({ timeout: 5000 })
  })

  test('feedback button is visible on the /admin route too', async ({ page }) => {
    await page.goto('/admin')
    await expect(page.getByRole('button', { name: /open feedback form/i })).toBeVisible()
  })
})
