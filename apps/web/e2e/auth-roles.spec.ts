import { test, expect } from '@playwright/test'
import path from 'path'

const STAFF_STORAGE_STATE = path.join(__dirname, '../e2e/.auth/staff.json')
const ADMIN_STORAGE_STATE = path.join(__dirname, '../e2e/.auth/admin.json')

test.describe('Role-based access — staff user (role: server)', () => {
  test.use({ storageState: STAFF_STORAGE_STATE })

  test('staff user on /tables sees no Admin button', async ({ page }) => {
    await page.goto('/tables')
    await expect(page).toHaveURL(/\/tables/)
    await expect(page.getByRole('link', { name: 'Admin' })).not.toBeVisible()
  })

  test('staff user navigating directly to /admin is redirected to /tables', async ({ page }) => {
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/tables/)
  })
})

test.describe('Role-based access — admin user (role: owner)', () => {
  test.use({ storageState: ADMIN_STORAGE_STATE })

  test('admin user on /tables sees Admin button in header', async ({ page }) => {
    await page.goto('/tables')
    await expect(page).toHaveURL(/\/tables/)
    await expect(page.getByRole('link', { name: 'Admin' })).toBeVisible()
  })

  test('admin user can access /admin directly', async ({ page }) => {
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/admin/)
    // Should not be redirected away
    await expect(page).not.toHaveURL(/\/login/)
    await expect(page).not.toHaveURL(/\/tables/)
  })

  test('Admin button links to /admin', async ({ page }) => {
    await page.goto('/tables')
    const adminLink = page.getByRole('link', { name: 'Admin' })
    await expect(adminLink).toHaveAttribute('href', '/admin')
  })
})
