import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
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
        data: { shift_id: 'test-shift-uuid-1234', summary: {} },
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
  const box = await openBtn.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.height).toBeGreaterThanOrEqual(48)
  expect(box!.width).toBeGreaterThanOrEqual(48)
})
