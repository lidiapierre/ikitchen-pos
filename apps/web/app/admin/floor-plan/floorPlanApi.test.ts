import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  fetchTablePositions,
  saveTablePosition,
  fetchFloorPlanConfig,
  invalidateTablePositionsCache,
  invalidateFloorPlanConfigCache,
} from './floorPlanApi'

const SUPABASE_URL = 'https://test.supabase.co'
const ACCESS_TOKEN = 'test-access-token'
const RESTAURANT_ID = 'rest-1'

const mockTables = [
  { id: 'table-1', label: 'Table 1', seat_count: 4, grid_x: 2, grid_y: 3 },
  { id: 'table-2', label: 'Table 2', seat_count: 2, grid_x: null, grid_y: null },
]

beforeEach(() => {
  vi.restoreAllMocks()
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'test-publishable-key')
  invalidateTablePositionsCache(SUPABASE_URL)
  invalidateFloorPlanConfigCache(SUPABASE_URL, RESTAURANT_ID)
})

describe('fetchTablePositions', () => {
  it('returns tables with correct shape', async (): Promise<void> => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockTables), { status: 200 }),
    ))
    const result = await fetchTablePositions(SUPABASE_URL, ACCESS_TOKEN)
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ id: 'table-1', label: 'Table 1', seat_count: 4, grid_x: 2, grid_y: 3 })
    expect(result[1]).toMatchObject({ id: 'table-2', label: 'Table 2', seat_count: 2, grid_x: null, grid_y: null })
  })

  it('calls correct endpoint with correct headers', async (): Promise<void> => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(mockTables), { status: 200 }))
    vi.stubGlobal('fetch', mockFetch)
    await fetchTablePositions(SUPABASE_URL, ACCESS_TOKEN)
    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/rest/v1/tables')
    expect((init.headers as Record<string, string>)['apikey']).toBe('test-publishable-key')
    expect((init.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${ACCESS_TOKEN}`)
  })

  it('throws on non-ok response', async (): Promise<void> => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 })))
    await expect(fetchTablePositions(SUPABASE_URL, ACCESS_TOKEN)).rejects.toThrow('401')
  })

  it('second call within TTL returns cached value', async (): Promise<void> => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(mockTables), { status: 200 }))
    vi.stubGlobal('fetch', mockFetch)
    const first = await fetchTablePositions(SUPABASE_URL, ACCESS_TOKEN)
    const second = await fetchTablePositions(SUPABASE_URL, ACCESS_TOKEN)
    expect(mockFetch).toHaveBeenCalledOnce()
    expect(second).toStrictEqual(first)
  })
})

describe('saveTablePosition', () => {
  it('calls the correct endpoint with correct payload', async (): Promise<void> => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }))
    vi.stubGlobal('fetch', mockFetch)
    await saveTablePosition(SUPABASE_URL, ACCESS_TOKEN, 'table-1', 5, 3)
    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${SUPABASE_URL}/functions/v1/update_table_position`)
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${ACCESS_TOKEN}`)
    const body = JSON.parse(init.body as string) as { table_id: string; grid_x: number | null; grid_y: number | null }
    expect(body).toEqual({ table_id: 'table-1', grid_x: 5, grid_y: 3 })
  })

  it('sends null positions when clearing a table', async (): Promise<void> => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }))
    vi.stubGlobal('fetch', mockFetch)
    await saveTablePosition(SUPABASE_URL, ACCESS_TOKEN, 'table-1', null, null)
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as { grid_x: number | null; grid_y: number | null }
    expect(body.grid_x).toBeNull()
    expect(body.grid_y).toBeNull()
  })

  it('throws on non-ok response with error message', async (): Promise<void> => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'table_id is required' }), { status: 400 })))
    await expect(saveTablePosition(SUPABASE_URL, ACCESS_TOKEN, '', null, null)).rejects.toThrow('table_id is required')
  })

  it('throws with status code when body has no error field', async (): Promise<void> => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Internal Server Error', { status: 500 })))
    await expect(saveTablePosition(SUPABASE_URL, ACCESS_TOKEN, 'table-1', 0, 0)).rejects.toThrow('500')
  })

  it('triggers cache invalidation', async (): Promise<void> => {
    let fetchCount = 0
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      fetchCount++
      if ((url as string).includes('update_table_position')) {
        return Promise.resolve(new Response('{}', { status: 200 }))
      }
      return Promise.resolve(new Response(JSON.stringify(mockTables), { status: 200 }))
    }))
    await fetchTablePositions(SUPABASE_URL, ACCESS_TOKEN)
    expect(fetchCount).toBe(1)
    await fetchTablePositions(SUPABASE_URL, ACCESS_TOKEN)
    expect(fetchCount).toBe(1)
    await saveTablePosition(SUPABASE_URL, ACCESS_TOKEN, 'table-1', 1, 2)
    expect(fetchCount).toBe(2)
    await fetchTablePositions(SUPABASE_URL, ACCESS_TOKEN)
    expect(fetchCount).toBe(3)
  })
})

describe('fetchFloorPlanConfig', () => {
  it('parses config rows', async (): Promise<void> => {
    const configRows = [{ key: 'floor_plan_cols', value: '12' }, { key: 'floor_plan_rows', value: '8' }]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(configRows), { status: 200 })))
    const result = await fetchFloorPlanConfig(SUPABASE_URL, ACCESS_TOKEN, RESTAURANT_ID, { cols: 10, rows: 6 })
    expect(result).toEqual({ cols: 12, rows: 8 })
  })

  it('returns defaults on non-ok response', async (): Promise<void> => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Forbidden', { status: 403 })))
    const result = await fetchFloorPlanConfig(SUPABASE_URL, ACCESS_TOKEN, RESTAURANT_ID, { cols: 10, rows: 6 })
    expect(result).toEqual({ cols: 10, rows: 6 })
  })

  it('handles zero values correctly', async (): Promise<void> => {
    const configRows = [{ key: 'floor_plan_cols', value: '0' }, { key: 'floor_plan_rows', value: '0' }]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(configRows), { status: 200 })))
    const result = await fetchFloorPlanConfig(SUPABASE_URL, ACCESS_TOKEN, RESTAURANT_ID, { cols: 10, rows: 6 })
    expect(result).toEqual({ cols: 0, rows: 0 })
  })
})

describe('invalidateTablePositionsCache', () => {
  it('is exported and callable', () => {
    expect(() => invalidateTablePositionsCache(SUPABASE_URL)).not.toThrow()
  })
})

describe('invalidateFloorPlanConfigCache', () => {
  it('is exported and callable', () => {
    expect(() => invalidateFloorPlanConfigCache(SUPABASE_URL, RESTAURANT_ID)).not.toThrow()
  })
})
