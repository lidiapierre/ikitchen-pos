import { test, expect } from '@playwright/test'

// Requires a valid session so UserContext can populate accessToken
// (needed for open_shift / close_shift edge function calls after RBAC auth fix).
test.use({ storageState: 'e2e/.auth/admin.json' })

test.beforeEach(async ({ page }) => {
  // Mock Supabase auth so UserContext.accessToken + role are populated.
  await page.route('**/auth/v1/user**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: '25842b19-b4c9-493c-ac46-724088180929', email: 'admin@lahore.ikitchen.com.bd', role: 'authenticated' }),
    })
  })
  await page.route('**/rest/v1/users?**', async (route) => {
    const url = route.request().url()
    if (url.includes('select=role')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ role: 'owner' }]) })
    } else {
      await route.continue()
    }
  })

  // Mock shifts REST endpoint — default: no active shift
  await page.route('**/rest/v1/shifts**', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  })

  // Mock open_shift edge function
  await page.route('**/functions/v1/open_shift', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          shift_id: 'test-shift-uuid-1234',
          started_at: new Date().toISOString(),
        },
      }),
    })
  })

  // Mock close_shift edge function
  await page.route('**/functions/v1/close_shift', (route) => {
    void route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          shift_id: 'test-shift-uuid-1234',
          ended_at: new Date().toISOString(),
          summary: {},
        },
      }),
    })
  })

  // Clear localStorage before each test
  await page.goto('/shifts')
  await page.evaluate(() => { localStorage.removeItem('ikitchen_active_shift') })
  await page.reload()
})

test('shifts page loads and shows no active shift', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Shift Management' })).toBeVisible()
  await expect(page.getByTestId('shift-none')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open Shift' })).toBeVisible()
})

test('admin can open a shift', async ({ page }) => {
  await page.getByRole('button', { name: 'Open Shift' }).click()

  await expect(page.getByTestId('shift-open')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Shift Open' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Close Shift' })).toBeVisible()
})

test('admin can close a shift and see summary', async ({ page }) => {
  // Open a shift first
  await page.getByRole('button', { name: 'Open Shift' }).click()
  await expect(page.getByTestId('shift-open')).toBeVisible()

  // Close the shift
  await page.getByRole('button', { name: 'Close Shift' }).click()

  await expect(page.getByTestId('shift-summary')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Shift Closed' })).toBeVisible()
  await expect(page.getByText('Started')).toBeVisible()
  await expect(page.getByText('Ended')).toBeVisible()
  await expect(page.getByText('Duration')).toBeVisible()
})

test('shifts page is reachable from tables page in one tap', async ({ page }) => {
  await page.goto('/tables')
  await page.getByRole('link', { name: 'Shifts' }).click()
  await expect(page).toHaveURL('/shifts')
  await expect(page.getByRole('heading', { name: 'Shift Management' })).toBeVisible()
})

test('Open Shift and Close Shift buttons meet 48px touch target', async ({ page }) => {
  const openBtn = page.getByRole('button', { name: 'Open Shift' })
  const openBox = await openBtn.boundingBox()
  expect(openBox).not.toBeNull()
  expect(openBox!.height).toBeGreaterThanOrEqual(48)
  expect(openBox!.width).toBeGreaterThanOrEqual(48)

  // Open a shift so the Close Shift button becomes visible
  await openBtn.click()
  await expect(page.getByTestId('shift-open')).toBeVisible()

  const closeBtn = page.getByRole('button', { name: 'Close Shift' })
  const closeBox = await closeBtn.boundingBox()
  expect(closeBox).not.toBeNull()
  expect(closeBox!.height).toBeGreaterThanOrEqual(48)
  expect(closeBox!.width).toBeGreaterThanOrEqual(48)
})
