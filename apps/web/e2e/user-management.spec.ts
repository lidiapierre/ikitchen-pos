import { test, expect } from '@playwright/test'
import path from 'path'

const ADMIN_STORAGE_STATE = path.join(__dirname, '../e2e/.auth/admin.json')

test.describe('User management — /admin/users', () => {
  test.use({ storageState: ADMIN_STORAGE_STATE })

  test('admin nav includes a Users link', async ({ page }) => {
    await page.goto('/admin')
    const usersLink = page.getByRole('link', { name: 'Users' })
    await expect(usersLink).toBeVisible()
    await expect(usersLink).toHaveAttribute('href', '/admin/users')
  })

  test('/admin/users page loads and shows the Staff Accounts heading', async ({ page }) => {
    await page.goto('/admin/users')
    await expect(page).toHaveURL(/\/admin\/users/)
    await expect(page.getByRole('heading', { name: 'Staff Accounts' })).toBeVisible()
  })

  test('/admin/users shows the Add Staff button', async ({ page }) => {
    await page.goto('/admin/users')
    await expect(page.getByRole('button', { name: '+ Add Staff' })).toBeVisible()
  })

  test('clicking Add Staff opens the create form', async ({ page }) => {
    await page.goto('/admin/users')
    await page.getByRole('button', { name: '+ Add Staff' }).click()

    await expect(page.getByRole('heading', { name: 'New Staff Account' })).toBeVisible()
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel(/Name/)).toBeVisible()
    await expect(page.getByLabel('Role')).toBeVisible()
  })

  test('create form shows validation errors when submitted empty', async ({ page }) => {
    await page.goto('/admin/users')
    await page.getByRole('button', { name: '+ Add Staff' }).click()

    // Submit without filling in any fields
    await page.getByRole('button', { name: 'Create Account' }).click()

    await expect(page.getByText('A valid email is required')).toBeVisible()
    await expect(page.getByText('Role is required')).toBeVisible()
  })

  test('admin creates a new staff user and user appears in the list', async ({ page }) => {
    // Use a timestamped email to avoid conflicts between test runs
    const ts = Date.now()
    const testEmail = `e2e-staff-${ts}@test.ikitchen.com`

    await page.goto('/admin/users')

    // Open form
    await page.getByRole('button', { name: '+ Add Staff' }).click()

    // Fill in the form
    await page.getByLabel('Email').fill(testEmail)
    await page.getByLabel(/Name/).fill('E2E Test Staff')
    await page.getByLabel('Role').selectOption('server')

    // Submit
    await page.getByRole('button', { name: 'Create Account' }).click()

    // Should show success feedback
    await expect(
      page.getByRole('status').filter({ hasText: testEmail }),
    ).toBeVisible({ timeout: 10000 })

    // New user should appear in the list
    await expect(page.getByText(testEmail)).toBeVisible()
    await expect(page.getByText('E2E Test Staff')).toBeVisible()
  })

  test('deactivate button is present for non-owner users in the list', async ({ page }) => {
    await page.goto('/admin/users')

    // Wait for users to load
    await expect(page.getByRole('heading', { name: 'Staff Accounts' })).toBeVisible()

    // There should be at least one Deactivate or Reactivate button if any non-owner users exist
    // This is a soft check — if no staff exist yet, the list may be empty
    const deactivateButtons = page.getByRole('button', { name: /Deactivate|Reactivate/ })
    const emptyState = page.getByText('No staff accounts yet')
    await expect(deactivateButtons.first().or(emptyState)).toBeVisible()
  })
})
