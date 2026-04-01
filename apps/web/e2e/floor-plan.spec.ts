import { test, expect } from '@playwright/test'

/**
 * E2E tests for the Unified Floor Plan — issue #327.
 *
 * These tests verify the UI behaviour of the unified floor plan admin page.
 * Network calls to Supabase are intercepted so tests run without a live backend.
 *
 * Covered paths:
 * 1. Page loads, shows the section grid, "Unplaced" DnD sidebar, and
 *    "Unassigned Tables" panel in the left sidebar.
 * 2. Dragging an unplaced table from the DnD sidebar to a grid cell — verifies
 *    the update_table_position network call fires with correct coordinates.
 * 3. Dragging a placed table back to the DnD sidebar — verifies the
 *    update_table_position call fires with null coordinates (unplace).
 */

const UPDATE_POSITION_PATTERN = '**/functions/v1/update_table_position'

const MOCK_SECTION = {
  id: 'section-1',
  name: 'Main Room',
  restaurant_id: 'rest-1',
  assigned_server_id: null,
  sort_order: 0,
  grid_cols: 5,
  grid_rows: 4,
}

/** Placed on the grid at (0, 0) within the section */
const MOCK_TABLE_PLACED = {
  id: 'table-placed-1',
  label: 'T1',
  seat_count: 4,
  grid_x: 0,
  grid_y: 0,
  section_id: 'section-1',
}

/** Belongs to section-1 but has no grid coordinates → appears in "Unplaced" DnD sidebar */
const MOCK_TABLE_UNPLACED = {
  id: 'table-unplaced-1',
  label: 'T2',
  seat_count: 2,
  grid_x: null,
  grid_y: null,
  section_id: 'section-1',
}

/** No section at all → appears in "Unassigned Tables" left sidebar */
const MOCK_TABLE_UNASSIGNED = {
  id: 'table-unassigned-1',
  label: 'T3',
  seat_count: 3,
  grid_x: null,
  grid_y: null,
  section_id: null,
}

async function mockAuthApis(page: import('@playwright/test').Page): Promise<void> {
  // Inject a fake Supabase session into localStorage before the page loads
  await page.addInitScript(() => {
    const session = {
      access_token: 'test-access-token-floor-plan',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: 'test-refresh-token',
      user: {
        id: 'test-user-id',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'admin@lahore.ikitchen.com.bd',
      },
    }
    localStorage.setItem('sb-dmaogdwtgohrhbytxjqu-auth-token', JSON.stringify(session))
  })

  // Mock Supabase auth/v1/user
  await page.route('**/auth/v1/user**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'test-user-id',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'admin@lahore.ikitchen.com.bd',
      }),
    })
  })

  // Mock Supabase auth/v1/token (refresh)
  await page.route('**/auth/v1/token**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'test-access-token-floor-plan',
        token_type: 'bearer',
        expires_in: 3600,
        user: {
          id: 'test-user-id',
          aud: 'authenticated',
          role: 'authenticated',
          email: 'admin@lahore.ikitchen.com.bd',
        },
      }),
    })
  })

  // Mock rest/v1/users for getUserRole
  await page.route('**/rest/v1/users**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ role: 'owner' }]),
    })
  })
}

async function mockFloorPlanApis(page: import('@playwright/test').Page): Promise<void> {
  // Mock sections endpoint
  await page.route('**/rest/v1/sections**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([MOCK_SECTION]),
    })
  })

  // Mock tables endpoint
  await page.route('**/rest/v1/tables**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([MOCK_TABLE_PLACED, MOCK_TABLE_UNPLACED, MOCK_TABLE_UNASSIGNED]),
    })
  })

  // Mock orders endpoint (fetchUnifiedFloorPlanData fetches this in parallel)
  await page.route('**/rest/v1/orders**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  })

  // Mock restaurants endpoint
  await page.route('**/rest/v1/restaurants**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: 'rest-1' }]),
    })
  })
}

test.describe('Floor Plan Builder', () => {
  test('page loads and shows grid and unplaced sidebar', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await mockAuthApis(page)
    await mockFloorPlanApis(page)

    await page.goto('/admin/floor-plan')

    // Heading should be visible
    await expect(page.getByRole('heading', { name: 'Floor Plan' })).toBeVisible({ timeout: 10000 })

    // Section name should appear (as tab or header)
    await expect(page.getByText('Main Room').first()).toBeVisible()

    // The "Unplaced" DnD sidebar within the section grid should be visible
    await expect(page.getByText('Unplaced').first()).toBeVisible()

    // The unplaced table (T2, section-1 but no coords) should appear in the Unplaced sidebar
    await expect(page.getByText('T2').first()).toBeVisible()

    // The placed table (T1) label should be visible on the grid
    await expect(page.getByText('T1').first()).toBeVisible()

    // The unassigned table (T3, no section) should appear in the "Unassigned Tables" left sidebar
    await expect(page.getByText('Unassigned Tables')).toBeVisible()
    await expect(page.getByText('T3').first()).toBeVisible()

    // Grid size inputs should be present in the section header
    const gridInputs = page.locator('input[type="number"]')
    await expect(gridInputs.first()).toBeVisible()

    expect(errors).toHaveLength(0)
  })

  test('dragging a table from sidebar to grid fires update_table_position', async ({ page }) => {
    await mockAuthApis(page)
    await mockFloorPlanApis(page)

    // Track the update_table_position request
    const updateRequests: Array<{ table_id: string; grid_x: number | null; grid_y: number | null }> = []
    await page.route(UPDATE_POSITION_PATTERN, async (route) => {
      const request = route.request()
      const body = JSON.parse(request.postData() ?? '{}') as { table_id: string; grid_x: number | null; grid_y: number | null }
      updateRequests.push(body)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      })
    })

    await page.goto('/admin/floor-plan')
    await expect(page.getByRole('heading', { name: 'Floor Plan' })).toBeVisible({ timeout: 10000 })

    // Find the unplaced table T2 in the DnD sidebar
    const sidebarTable = page.getByText('T2').first()
    await expect(sidebarTable).toBeVisible()

    // Find an empty grid cell to drop onto — cell-1-0 (col 1, row 0) to avoid the placed T1 at 0-0
    const targetCell = page.locator('[data-testid="cell-1-0"]').first()

    // Use bounding boxes to perform the drag via mouse events
    const sourceBox = await sidebarTable.boundingBox()
    const targetBox = await targetCell.boundingBox()

    if (sourceBox && targetBox) {
      const startX = sourceBox.x + sourceBox.width / 2
      const startY = sourceBox.y + sourceBox.height / 2
      const endX = targetBox.x + targetBox.width / 2
      const endY = targetBox.y + targetBox.height / 2

      await page.mouse.move(startX, startY)
      await page.mouse.down()
      // Move gradually to allow dnd-kit to detect the drag
      await page.mouse.move(startX + 5, startY + 5, { steps: 3 })
      await page.mouse.move(endX, endY, { steps: 10 })
      await page.mouse.up()
    }

    // Wait for the network call to fire and complete
    await page.waitForResponse(UPDATE_POSITION_PATTERN, { timeout: 5000 })

    // Verify the request was made with grid coordinates (non-null x and y)
    expect(updateRequests).toHaveLength(1)
    const req = updateRequests[0]
    expect(req.table_id).toBe(MOCK_TABLE_UNPLACED.id)
    expect(typeof req.grid_x).toBe('number')
    expect(typeof req.grid_y).toBe('number')
  })

  test('dragging a placed table to sidebar fires update_table_position with null coords', async ({ page }) => {
    await mockAuthApis(page)
    await mockFloorPlanApis(page)

    // Track the update_table_position request
    const updateRequests: Array<{ table_id: string; grid_x: number | null; grid_y: number | null }> = []
    await page.route(UPDATE_POSITION_PATTERN, async (route) => {
      const request = route.request()
      const body = JSON.parse(request.postData() ?? '{}') as { table_id: string; grid_x: number | null; grid_y: number | null }
      updateRequests.push(body)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      })
    })

    await page.goto('/admin/floor-plan')
    await expect(page.getByRole('heading', { name: 'Floor Plan' })).toBeVisible({ timeout: 10000 })

    // Find placed table T1 on the grid at cell-0-0
    const placedTable = page.getByText('T1').first()
    await expect(placedTable).toBeVisible()

    // Find the DnD sidebar drop zone (the "Unplaced" panel within the section grid)
    const sidebar = page.getByText('Unplaced').first().locator('../..')
    const sidebarBox = await sidebar.boundingBox()
    const sourceBox = await placedTable.boundingBox()

    if (sourceBox && sidebarBox) {
      const startX = sourceBox.x + sourceBox.width / 2
      const startY = sourceBox.y + sourceBox.height / 2
      const endX = sidebarBox.x + sidebarBox.width / 2
      const endY = sidebarBox.y + sidebarBox.height / 2

      await page.mouse.move(startX, startY)
      await page.mouse.down()
      await page.mouse.move(startX + 5, startY + 5, { steps: 3 })
      await page.mouse.move(endX, endY, { steps: 10 })
      await page.mouse.up()
    }

    // Wait for the network call to fire and complete
    await page.waitForResponse(UPDATE_POSITION_PATTERN, { timeout: 5000 })

    // Verify the request was made with null coordinates (unplace)
    expect(updateRequests).toHaveLength(1)
    const req = updateRequests[0]
    expect(req.table_id).toBe(MOCK_TABLE_PLACED.id)
    expect(req.grid_x).toBeNull()
    expect(req.grid_y).toBeNull()
  })
})
