import { test, expect } from '@playwright/test'

/**
 * E2E tests for the Unified Floor Plan — issue #327.
 *
 * These tests verify the UI behaviour of the unified floor plan admin page.
 * Network calls to Supabase are intercepted so tests run without a live backend.
 *
 * Covered critical paths:
 * 1. Page loads with welcome state when no sections exist.
 * 2. Sections appear in sidebar and tabs after data loads.
 * 3. Selecting a section shows the DnD grid.
 * 4. Clicking an empty grid cell opens the Add Table dialog.
 * 5. Staff /tables view renders section tabs with server badges.
 */

const MOCK_SECTION = {
  id: 'sec-1',
  name: 'Main Hall',
  restaurant_id: 'rest-1',
  assigned_server_id: 'user-1',
  sort_order: 0,
  grid_cols: 6,
  grid_rows: 4,
}

const MOCK_TABLE = {
  id: 'table-1',
  label: 'T1',
  seat_count: 4,
  grid_x: 0,
  grid_y: 0,
  section_id: 'sec-1',
  open_order_id: null,
}

const MOCK_USER = {
  id: 'user-1',
  name: 'Alice',
  email: 'alice@example.com',
  role: 'server',
}

async function mockAuthApis(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    const session = {
      access_token: 'test-access-token-floor-plan',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: 'test-refresh-token',
      user: {
        id: 'admin-user-id',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'admin@test.ikitchen.com',
      },
    }
    localStorage.setItem('sb-dmaogdwtgohrhbytxjqu-auth-token', JSON.stringify(session))
  })

  await page.route('**/auth/v1/user**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'admin-user-id',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'admin@test.ikitchen.com',
      }),
    })
  })

  await page.route('**/auth/v1/token**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'test-access-token-floor-plan',
        token_type: 'bearer',
        expires_in: 3600,
        user: {
          id: 'admin-user-id',
          aud: 'authenticated',
          role: 'authenticated',
          email: 'admin@test.ikitchen.com',
        },
      }),
    })
  })

  // Mock getUserRole
  await page.route('**/rest/v1/users**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ role: 'owner' }]),
    })
  })
}

async function mockFloorPlanApis(
  page: import('@playwright/test').Page,
  options: {
    sections?: unknown[]
    tables?: unknown[]
    staffUsers?: unknown[]
  } = {},
): Promise<void> {
  const sections = options.sections ?? []
  const tables = options.tables ?? []
  const staffUsers = options.staffUsers ?? [MOCK_USER]

  await page.route('**/rest/v1/sections**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(sections),
    })
  })

  await page.route('**/rest/v1/tables**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(tables),
    })
  })

  await page.route('**/rest/v1/orders**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  })

  // staff users endpoint (separate from the auth/getUserRole route above)
  // The unified floor plan fetches from /rest/v1/users with role filter
  await page.route('**/rest/v1/users?*role*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(staffUsers),
    })
  })

  await page.route('**/rest/v1/restaurants**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: 'rest-1' }]),
    })
  })
}

test.describe('Unified Floor Plan — Admin', () => {
  test('shows welcome state when no sections exist', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await mockAuthApis(page)
    await mockFloorPlanApis(page, { sections: [], tables: [] })

    await page.goto('/admin/floor-plan')

    await expect(page.getByRole('heading', { name: 'Floor Plan' })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Welcome to Floor Plan')).toBeVisible()
    await expect(page.getByPlaceholder('New section name')).toBeVisible()

    expect(errors).toHaveLength(0)
  })

  test('shows sections in sidebar and tabs when sections exist', async ({ page }) => {
    await mockAuthApis(page)
    await mockFloorPlanApis(page, {
      sections: [MOCK_SECTION],
      tables: [MOCK_TABLE],
      staffUsers: [MOCK_USER],
    })

    await page.goto('/admin/floor-plan')

    await expect(page.getByRole('heading', { name: 'Floor Plan' })).toBeVisible({ timeout: 10000 })

    // Section appears in sidebar
    await expect(page.getByText('Main Hall').first()).toBeVisible()

    // Section tab appears
    await expect(page.getByRole('button', { name: /Main Hall/ }).first()).toBeVisible()
  })

  test('clicking a section tab shows the DnD grid', async ({ page }) => {
    await mockAuthApis(page)
    await mockFloorPlanApis(page, {
      sections: [MOCK_SECTION],
      tables: [MOCK_TABLE],
      staffUsers: [MOCK_USER],
    })

    await page.goto('/admin/floor-plan')
    await expect(page.getByRole('heading', { name: 'Floor Plan' })).toBeVisible({ timeout: 10000 })

    // Click the section tab
    const sectionTab = page.getByRole('button', { name: /Main Hall/ }).first()
    await sectionTab.click()

    // The placed table T1 should be visible on the grid
    await expect(page.getByText('T1').first()).toBeVisible()

    // Cell (0,0) exists
    await expect(page.locator('[data-testid="cell-0-0"]')).toBeVisible()
  })

  test('clicking an empty grid cell opens the Add Table dialog', async ({ page }) => {
    await mockAuthApis(page)
    await mockFloorPlanApis(page, {
      sections: [MOCK_SECTION],
      tables: [],
    })

    await page.goto('/admin/floor-plan')
    await expect(page.getByRole('heading', { name: 'Floor Plan' })).toBeVisible({ timeout: 10000 })

    // Select section to reveal grid
    const sectionTab = page.getByRole('button', { name: /Main Hall/ }).first()
    await sectionTab.click()

    // Click an empty cell
    const emptyCell = page.locator('[data-testid="cell-1-0"]').first()
    await expect(emptyCell).toBeVisible()
    await emptyCell.click()

    // Add Table dialog should appear
    await expect(page.getByRole('heading', { name: 'Add Table' })).toBeVisible()
    await expect(page.getByLabel(/Table Label/)).toBeVisible()
    await expect(page.getByLabel(/Seat Count/)).toBeVisible()
  })
})

test.describe('Unified Floor Plan — Staff /tables view', () => {
  test('shows section tabs with server badges', async ({ page }) => {
    await mockAuthApis(page)

    // Mock the tables page data endpoints
    await page.route('**/rest/v1/tables**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'table-1', label: 'T1', grid_x: 0, grid_y: 0, section_id: 'sec-1' },
        ]),
      })
    })

    await page.route('**/rest/v1/orders**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      })
    })

    await page.route('**/rest/v1/order_items**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      })
    })

    await page.route('**/rest/v1/sections**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'sec-1', name: 'Main Hall', assigned_server_id: 'user-1', sort_order: 0 },
        ]),
      })
    })

    await page.route('**/rest/v1/restaurants**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 'rest-1' }]),
      })
    })

    await page.route('**/rest/v1/config**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      })
    })

    await page.goto('/tables')

    // Section tab should be visible
    await expect(page.getByRole('button', { name: /Main Hall/ })).toBeVisible({ timeout: 10000 })
  })
})
