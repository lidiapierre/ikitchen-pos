import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  fetchTablePositions,
  saveTablePosition,
  fetchFloorPlanConfig,
  invalidateTablePositionsCache,
  invalidateFloorPlanConfigCache,
} from './floorPlanApi'

const SUPABASE_URL = 'https://test.supabase.co'
const API_KEY = 'test-api-key'
const ACCESS_TOKEN = 'test-access-token'
const RESTAURANT_ID = 'rest-1'

const mockTables = [
  { id: 'table-1', label: 'Table 1', seat_count: 4, grid_x: 2, grid_y: 3 },
  { id: 'table-2', label: 'Table 2', seat_count: 2, grid_x: null, grid_y: null },
]

beforeEach(() => {
  vi.restoreAllMocks()
  // Clear caches so tests don't bleed into each other
  invalidateTablePositionsCache(SUPABASE_URL, API_KEY)
  invalidateFloorPlanConfigCache(SUPABASE_URL, RESTAURANT_ID)
})

describe('fetchTablePositions', () => {
  it('returns tables with correct shape', async (): Promise<void> => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockTables), { status: 200 }),
    ))

    const result = await fetchTablePositions(SUPABASE_URL, API_KEY)
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({
      id: 'table-1',
      label: 'Table 1',
      seat_count: 4,
      grid_x: 2,
      grid_y: 3,
    })
    expect(result[1]).toMatchObject({
      id: 'table-2',
      label: 'Table 2',
      seat_count: 2,
      grid_x: null,
      grid_y: null,
    })
  })

  it('calls correct endpoint with correct headers', async (): Promise<void> => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockTables), { status: 200 }),
    )
    vi.stubGlobal('fetch', mockFetch)

    await fetchTablePositions(SUPABASE_URL, API_KEY)

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/rest/v1/tables')
    expect(url).toContain('select=id,label,seat_count,grid_x,grid_y')
    expect(url).toContain('order=label.asc')
    expect((init.headers as Record<string, string>)['apikey']).toBe(API_KEY)
    expect((init.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${API_KEY}`)
  })

  it('throws on non-ok response', async (): Promise<void> => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('Unauthorized', { status: 401 }),
    ))

    await expect(fetchTablePositions(SUPABASE_URL, API_KEY)).rejects.toThrow('401')
  })

  it('second call within TTL returns cached value (no second fetch)', async (): Promise<void> => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockTables), { status: 200 }),
    )
    vi.stubGlobal('fetch', mockFetch)

    // First call — hits network
    const first = await fetchTablePositions(SUPABASE_URL, API_KEY)
    // Second call — should use cache, no additional fetch
    const second = await fetchTablePositions(SUPABASE_URL, API_KEY)

    expect(mockFetch).toHaveBeenCalledOnce()
    expect(second).toStrictEqual(first)
  })
})

describe('saveTablePosition', () => {
  it('calls the correct endpoint with correct payload', async (): Promise<void> => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    )
    vi.stubGlobal('fetch', mockFetch)

    await saveTablePosition(SUPABASE_URL, API_KEY, ACCESS_TOKEN, 'table-1', 5, 3)

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${SUPABASE_URL}/functions/v1/update_table_position`)
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${ACCESS_TOKEN}`)

    const body = JSON.parse(init.body as string) as {
      table_id: string
      grid_x: number | null
      grid_y: number | null
    }
    expect(body.table_id).toBe('table-1')
    expect(body.grid_x).toBe(5)
    expect(body.grid_y).toBe(3)
  })

  it('sends null positions when clearing a table', async (): Promise<void> => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    )
    vi.stubGlobal('fetch', mockFetch)

    await saveTablePosition(SUPABASE_URL, API_KEY, ACCESS_TOKEN, 'table-1', null, null)

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as {
      table_id: string
      grid_x: number | null
      grid_y: number | null
    }
    expect(body.grid_x).toBeNull()
    expect(body.grid_y).toBeNull()
  })

  it('throws on non-ok response with error message from body', async (): Promise<void> => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'table_id is required' }), { status: 400 }),
    ))

    await expect(
      saveTablePosition(SUPABASE_URL, API_KEY, ACCESS_TOKEN, '', null, null),
    ).rejects.toThrow('table_id is required')
  })

  it('throws with status code when body has no error field', async (): Promise<void> => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('Internal Server Error', { status: 500 }),
    ))

    await expect(
      saveTablePosition(SUPABASE_URL, API_KEY, ACCESS_TOKEN, 'table-1', 0, 0),
    ).rejects.toThrow('500')
  })

  it('triggers cache invalidation so next fetchTablePositions goes to network again', async (): Promise<void> => {
    let fetchCount = 0
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      fetchCount++
      if ((url as string).includes('update_table_position')) {
        return Promise.resolve(new Response('{}', { status: 200 }))
      }
      return Promise.resolve(new Response(JSON.stringify(mockTables), { status: 200 }))
    }))

    // Populate cache
    await fetchTablePositions(SUPABASE_URL, API_KEY)
    expect(fetchCount).toBe(1)

    // Verify cache is hot — no additional fetch
    await fetchTablePositions(SUPABASE_URL, API_KEY)
    expect(fetchCount).toBe(1)

    // Save should invalidate cache
    await saveTablePosition(SUPABASE_URL, API_KEY, ACCESS_TOKEN, 'table-1', 1, 2)
    expect(fetchCount).toBe(2) // save itself

    // Next fetchTablePositions must hit the network again
    await fetchTablePositions(SUPABASE_URL, API_KEY)
    expect(fetchCount).toBe(3)
  })
})

describe('fetchFloorPlanConfig', () => {
  it('hits the correct PostgREST URL with in.() params and parses both rows', async (): Promise<void> => {
    const configRows = [
      { key: 'floor_plan_cols', value: '12' },
      { key: 'floor_plan_rows', value: '8' },
    ]
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(configRows), { status: 200 }),
    )
    vi.stubGlobal('fetch', mockFetch)

    const result = await fetchFloorPlanConfig(SUPABASE_URL, API_KEY, RESTAURANT_ID, { cols: 10, rows: 6 })

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url] = mockFetch.mock.calls[0] as [string]
    const decodedUrl = decodeURIComponent(url)
    expect(decodedUrl).toContain('/rest/v1/config')
    expect(decodedUrl).toContain('in.(floor_plan_cols,floor_plan_rows)')
    expect(decodedUrl).toContain(`eq.${RESTAURANT_ID}`)

    expect(result).toEqual({ cols: 12, rows: 8 })
  })

  it('returns defaults on a non-ok response', async (): Promise<void> => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('Forbidden', { status: 403 }),
    ))

    const defaults = { cols: 10, rows: 6 }
    const result = await fetchFloorPlanConfig(SUPABASE_URL, API_KEY, RESTAURANT_ID, defaults)
    expect(result).toEqual(defaults)
  })

  it('returns defaults for missing keys (empty rows array)', async (): Promise<void> => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    ))

    const defaults = { cols: 10, rows: 6 }
    const result = await fetchFloorPlanConfig(SUPABASE_URL, API_KEY, RESTAURANT_ID, defaults)
    expect(result).toEqual(defaults)
  })

  it('correctly handles cols=0 (zero is valid, not treated as falsy)', async (): Promise<void> => {
    // Ensure Number.isNaN check is used: zero should be preserved, not replaced with default
    const configRows = [
      { key: 'floor_plan_cols', value: '0' },
      { key: 'floor_plan_rows', value: '0' },
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(configRows), { status: 200 }),
    ))

    const result = await fetchFloorPlanConfig(SUPABASE_URL, API_KEY, RESTAURANT_ID, { cols: 10, rows: 6 })
    // 0 is a valid integer (not NaN) — should be kept as-is, not replaced with default
    expect(result).toEqual({ cols: 0, rows: 0 })
  })
})

describe('invalidateTablePositionsCache', () => {
  it('is exported and callable', () => {
    expect(() => invalidateTablePositionsCache(SUPABASE_URL, API_KEY)).not.toThrow()
  })
})

describe('invalidateFloorPlanConfigCache', () => {
  it('is exported and callable', () => {
    expect(() => invalidateFloorPlanConfigCache(SUPABASE_URL, RESTAURANT_ID)).not.toThrow()
  })
})
