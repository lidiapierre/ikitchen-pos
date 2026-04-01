import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchUnifiedFloorPlanData } from './unifiedFloorPlanData'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyChain = any

/** Build a thenable query mock that resolves with { data, error } */
function makeQuery(data: unknown, error: unknown = null): AnyChain {
  const builder: AnyChain = {
    select: () => builder,
    order: () => builder,
    in: () => builder,
    eq: () => builder,
    limit: () => builder,
    then: (onFulfilled: (v: { data: unknown; error: unknown }) => unknown) =>
      Promise.resolve({ data, error }).then(onFulfilled),
    catch: (onRejected: (e: unknown) => unknown) =>
      Promise.resolve({ data, error }).catch(onRejected),
  }
  return builder
}

const mockSections = [
  { id: 'sec-1', name: 'Main Hall', restaurant_id: 'rest-1', assigned_server_id: null, sort_order: 0, grid_cols: 8, grid_rows: 6 },
]
const mockTables = [
  { id: 'table-1', label: 'T1', seat_count: 4, grid_x: 0, grid_y: 0, section_id: 'sec-1' },
  { id: 'table-2', label: 'T2', seat_count: 2, grid_x: null, grid_y: null, section_id: null },
]
const mockOrders = [
  { id: 'order-1', table_id: 'table-1' },
]
const mockUsers = [
  { id: 'user-1', name: 'Alice', email: 'alice@test.com', role: 'server' },
]
const mockRestaurants = [
  { id: 'rest-1' },
]

function setupMock(overrides: Partial<Record<string, unknown>> = {}): void {
  vi.mocked(supabase.from).mockImplementation((table: string): AnyChain => {
    const defaults: Record<string, unknown> = {
      sections: mockSections,
      tables: mockTables,
      orders: mockOrders,
      users: mockUsers,
      restaurants: mockRestaurants,
    }
    const data = table in overrides ? overrides[table] : defaults[table] ?? []
    return makeQuery(data)
  })
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('fetchUnifiedFloorPlanData', () => {
  it('returns sections, tables with open orders, staff, and restaurant id', async (): Promise<void> => {
    setupMock()

    const result = await fetchUnifiedFloorPlanData()

    expect(result.sections).toHaveLength(1)
    expect(result.sections[0].name).toBe('Main Hall')
    expect(result.tables).toHaveLength(2)
    expect(result.tables[0].open_order_id).toBe('order-1')
    expect(result.tables[1].open_order_id).toBeNull()
    expect(result.staffUsers).toHaveLength(1)
    expect(result.restaurantId).toBe('rest-1')
  })

  it('throws when no restaurant found', async (): Promise<void> => {
    setupMock({ restaurants: [] })

    await expect(fetchUnifiedFloorPlanData()).rejects.toThrow('No restaurant found')
  })

  it('throws on section query error', async (): Promise<void> => {
    vi.mocked(supabase.from).mockImplementation((table: string): AnyChain => {
      if (table === 'sections') return makeQuery(null, { message: 'permission denied' })
      return makeQuery([])
    })

    await expect(fetchUnifiedFloorPlanData()).rejects.toThrow('permission denied')
  })

  it('throws on tables query error', async (): Promise<void> => {
    vi.mocked(supabase.from).mockImplementation((table: string): AnyChain => {
      if (table === 'tables') return makeQuery(null, { message: 'tables fetch failed' })
      if (table === 'sections') return makeQuery(mockSections)
      return makeQuery([])
    })

    await expect(fetchUnifiedFloorPlanData()).rejects.toThrow('tables fetch failed')
  })
})
