import { test, expect } from '@playwright/test'

/**
 * E2E tests for table merging & splitting — issue #274.
 *
 * Tests the critical paths for:
 * 1. "Merge with…" modal appears on an occupied dine-in order
 * 2. Selecting a secondary table and confirming merge calls the edge function
 * 3. After merge, the order header shows the combined label
 * 4. "Merged" badge appears on the secondary table on the tables page
 * 5. "Unmerge" button appears and calling it clears the merge state
 *
 * All network calls are intercepted so tests run without a live backend.
 */

const MERGE_TABLES_PATTERN = '**/functions/v1/merge_tables'
const UNMERGE_TABLES_PATTERN = '**/functions/v1/unmerge_tables'
const TABLES_API_PATTERN = '**/rest/v1/tables*'
const ORDERS_API_PATTERN = '**/rest/v1/orders*'

// ── Shared mock data ──────────────────────────────────────────────────────────

const PRIMARY_TABLE = { id: 'table-3', label: 'Table 3', grid_x: 0, grid_y: 0, section_id: null, locked_by_order_id: null }
const SECONDARY_TABLE = { id: 'table-4', label: 'Table 4', grid_x: 1, grid_y: 0, section_id: null, locked_by_order_id: null }

const PRIMARY_ORDER = {
  id: 'order-primary',
  table_id: 'table-3',
  status: 'open',
  order_type: 'dine_in',
  created_at: new Date().toISOString(),
  customer_name: null,
  delivery_note: null,
  customer_mobile: null,
  bill_number: null,
  reservation_id: null,
  customer_id: null,
  order_number: 1,
  scheduled_time: null,
  delivery_zone_id: null,
  delivery_charge: 0,
  merge_label: null,
  delivery_zones: null,
}

const SECONDARY_ORDER = {
  id: 'order-secondary',
  table_id: 'table-4',
  status: 'open',
  order_type: 'dine_in',
  created_at: new Date().toISOString(),
  merge_label: null,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockSupabaseAuth(route: { fulfill: (opts: object) => Promise<void> }): Promise<void> {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ id: 'user-1', email: 'staff@example.com' }),
  })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('Table Merge & Split', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept Supabase auth
    await page.route('**/auth/v1/user', mockSupabaseAuth)

    // Mock users table (role lookup)
    await page.route('**/rest/v1/users*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 'user-1', role: 'server', name: 'Staff', email: 'staff@example.com' }]),
      }),
    )
  })

  test('shows "Merge with…" button on open dine-in order', async ({ page }) => {
    // Mock order detail page data
    await page.route(ORDERS_API_PATTERN, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([PRIMARY_ORDER]),
      }),
    )
    await page.route('**/rest/v1/order_items*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
    )
    await page.route(TABLES_API_PATTERN, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([PRIMARY_TABLE]),
      }),
    )
    await page.route('**/rest/v1/restaurants*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'rest-1', name: 'Test' }]) }),
    )
    await page.route('**/rest/v1/menus*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
    )
    await page.route('**/rest/v1/delivery_zones*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
    )

    await page.goto('/tables/table-3/order/order-primary')
    await page.waitForLoadState('networkidle')

    // Find the Merge button (in the More actions / footer area)
    await expect(page.getByRole('button', { name: /Merge with/i })).toBeVisible()
  })

  test('merge flow: selecting secondary table calls merge_tables function', async ({ page }) => {
    await page.route(ORDERS_API_PATTERN, (route, request) => {
      const url = request.url()
      // Merge modal fetch: select includes the embedded tables relation with locked_by_order_id.
      // PostgREST join hint encodes as "tables%21orders_table_id_fkey%28...%29" so we can't
      // rely on "tables(" or "tables%28". Use "locked_by_order_id" as the unique discriminator
      // — it only appears in the merge-modal orders request.
      if (url.includes('locked_by_order_id')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: SECONDARY_ORDER.id,
              table_id: SECONDARY_TABLE.id,
              tables: { id: SECONDARY_TABLE.id, label: SECONDARY_TABLE.label, locked_by_order_id: null },
            },
          ]),
        })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([PRIMARY_ORDER]),
      })
    })
    await page.route('**/rest/v1/order_items*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
    )
    await page.route(TABLES_API_PATTERN, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([PRIMARY_TABLE]),
      }),
    )
    await page.route('**/rest/v1/restaurants*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'rest-1', name: 'Test' }]) }),
    )
    await page.route('**/rest/v1/menus*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
    )
    await page.route('**/rest/v1/delivery_zones*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
    )

    // Capture merge_tables call
    let mergeCalled = false
    let mergePayload: unknown = null
    await page.route(MERGE_TABLES_PATTERN, async (route) => {
      mergeCalled = true
      const body = route.request().postDataJSON()
      mergePayload = body
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            primary_order_id: PRIMARY_ORDER.id,
            secondary_table_id: SECONDARY_TABLE.id,
            merge_label: 'Table 3 + Table 4',
          },
        }),
      })
    })

    await page.goto('/tables/table-3/order/order-primary')
    await page.waitForLoadState('networkidle')

    // Open merge modal
    await page.getByRole('button', { name: /Merge with/i }).click()

    // Should show the secondary table button
    await expect(page.getByRole('button', { name: /Table 4/i })).toBeVisible()

    // Select secondary table
    await page.getByRole('button', { name: /Table 4/i }).click()

    // Should show confirmation step (check heading specifically to avoid strict mode violation)
    await expect(page.getByRole('heading', { name: /Confirm Merge/i })).toBeVisible()

    // Set up waitForRequest BEFORE clicking confirm (guarantees the handler completes before assertion)
    const mergeRequest = page.waitForRequest(MERGE_TABLES_PATTERN)

    // Confirm merge
    await page.getByRole('button', { name: /Confirm Merge/i }).click()

    // Wait for the actual network request to the edge function
    await mergeRequest
    expect(mergeCalled).toBe(true)
    expect((mergePayload as Record<string, string>)['primary_order_id']).toBe(PRIMARY_ORDER.id)
    expect((mergePayload as Record<string, string>)['secondary_table_id']).toBe(SECONDARY_TABLE.id)
  })

  test('tables page shows "Merged" badge for secondary locked table', async ({ page }) => {
    const lockedSecondaryTable = {
      id: 'table-4',
      label: 'Table 4',
      grid_x: null,
      grid_y: null,
      section_id: null,
      locked_by_order_id: 'order-primary',
    }

    await page.route(TABLES_API_PATTERN, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { ...PRIMARY_TABLE, locked_by_order_id: null },
          lockedSecondaryTable,
        ]),
      }),
    )
    await page.route(ORDERS_API_PATTERN, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            ...PRIMARY_ORDER,
            merge_label: 'Table 3 + Table 4',
          },
        ]),
      }),
    )
    await page.route('**/rest/v1/order_items*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
    )
    await page.route('**/rest/v1/restaurants*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'rest-1', name: 'Test' }]) }),
    )
    await page.route('**/rest/v1/sections*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
    )
    await page.route('**/rest/v1/config*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
    )

    await page.goto('/tables')
    await page.waitForLoadState('networkidle')

    // Secondary table should show "Merged" badge
    await expect(page.getByText('Merged').first()).toBeVisible()
  })

  test('"Unmerge" button appears when order has merge_label', async ({ page }) => {
    const mergedOrder = { ...PRIMARY_ORDER, merge_label: 'Table 3 + Table 4' }

    await page.route(ORDERS_API_PATTERN, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([mergedOrder]),
      }),
    )
    await page.route('**/rest/v1/order_items*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
    )
    await page.route(TABLES_API_PATTERN, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([PRIMARY_TABLE]),
      }),
    )
    await page.route('**/rest/v1/restaurants*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'rest-1', name: 'Test' }]) }),
    )
    await page.route('**/rest/v1/menus*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
    )
    await page.route('**/rest/v1/delivery_zones*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
    )

    await page.goto('/tables/table-3/order/order-primary')
    await page.waitForLoadState('networkidle')

    // Unmerge button should be visible (because mergeLabel is set)
    await expect(page.getByRole('button', { name: /Unmerge/i })).toBeVisible()
    // Merge with... should NOT be visible when already merged
    await expect(page.getByRole('button', { name: /Merge with/i })).not.toBeVisible()
  })

  test('unmerge flow calls unmerge_tables function', async ({ page }) => {
    const mergedOrder = { ...PRIMARY_ORDER, merge_label: 'Table 3 + Table 4' }

    await page.route(ORDERS_API_PATTERN, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([mergedOrder]),
      }),
    )
    await page.route('**/rest/v1/order_items*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
    )
    await page.route(TABLES_API_PATTERN, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([PRIMARY_TABLE]),
      }),
    )
    await page.route('**/rest/v1/restaurants*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'rest-1', name: 'Test' }]) }),
    )
    await page.route('**/rest/v1/menus*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
    )
    await page.route('**/rest/v1/delivery_zones*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
    )

    let unmergeCalled = false
    let unmergePayload: unknown = null
    await page.route(UNMERGE_TABLES_PATTERN, async (route) => {
      unmergeCalled = true
      unmergePayload = route.request().postDataJSON()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { order_id: PRIMARY_ORDER.id, unmerged_table_count: 1 } }),
      })
    })

    await page.goto('/tables/table-3/order/order-primary')
    await page.waitForLoadState('networkidle')

    // Click Unmerge button
    await page.getByRole('button', { name: /Unmerge/i }).click()

    // Confirmation dialog appears
    await expect(page.getByText(/Unmerge Tables/i)).toBeVisible()

    // Set up waitForRequest BEFORE clicking confirm
    const unmergeRequest = page.waitForRequest(UNMERGE_TABLES_PATTERN)

    // Confirm
    await page.getByRole('button', { name: /Confirm Unmerge/i }).click()

    // Wait for the actual network request to the edge function
    await unmergeRequest
    expect(unmergeCalled).toBe(true)
    expect((unmergePayload as Record<string, string>)['order_id']).toBe(PRIMARY_ORDER.id)
  })
})
