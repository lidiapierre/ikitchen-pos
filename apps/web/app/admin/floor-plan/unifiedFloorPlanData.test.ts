import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchUnifiedFloorPlanData } from './unifiedFloorPlanData'

const SUPABASE_URL = 'https://test.supabase.co'
const ACCESS_TOKEN = 'test-access-token'

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

beforeEach(() => {
  vi.restoreAllMocks()
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'test-key')
})

describe('fetchUnifiedFloorPlanData', () => {
  it('returns sections, tables with open orders, staff, and restaurant id', async (): Promise<void> => {
    let callIndex = 0
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      const responses = [mockSections, mockTables, mockOrders, mockUsers, mockRestaurants]
      const data = responses[callIndex] ?? []
      callIndex++
      return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }))
    }))

    const result = await fetchUnifiedFloorPlanData(SUPABASE_URL, ACCESS_TOKEN)

    expect(result.sections).toHaveLength(1)
    expect(result.sections[0].name).toBe('Main Hall')
    expect(result.tables).toHaveLength(2)
    expect(result.tables[0].open_order_id).toBe('order-1')
    expect(result.tables[1].open_order_id).toBeNull()
    expect(result.staffUsers).toHaveLength(1)
    expect(result.restaurantId).toBe('rest-1')
  })

  it('throws when no restaurant found', async (): Promise<void> => {
    let callIndex = 0
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      const responses = [mockSections, mockTables, mockOrders, mockUsers, []]
      const data = responses[callIndex] ?? []
      callIndex++
      return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }))
    }))

    await expect(fetchUnifiedFloorPlanData(SUPABASE_URL, ACCESS_TOKEN)).rejects.toThrow('No restaurant found')
  })

  it('throws on non-ok section response', async (): Promise<void> => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      return Promise.resolve(new Response('Forbidden', { status: 403 }))
    }))

    await expect(fetchUnifiedFloorPlanData(SUPABASE_URL, ACCESS_TOKEN)).rejects.toThrow('403')
  })

  it('uses accessToken as Bearer header', async (): Promise<void> => {
    const mockFetch = vi.fn().mockImplementation(() => {
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }))
    })
    vi.stubGlobal('fetch', mockFetch)

    // Will throw because restaurants is empty, but we can still check the calls
    try { await fetchUnifiedFloorPlanData(SUPABASE_URL, ACCESS_TOKEN) } catch { /* expected */ }

    const calls = mockFetch.mock.calls as Array<[string, RequestInit]>
    for (const [, init] of calls) {
      const h = init.headers as Record<string, string>
      expect(h['Authorization']).toBe(`Bearer ${ACCESS_TOKEN}`)
    }
  })
})
