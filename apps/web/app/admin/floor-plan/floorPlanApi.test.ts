import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchTablePositions, saveTablePosition } from './floorPlanApi'

const SUPABASE_URL = 'https://test.supabase.co'
const API_KEY = 'test-api-key'
const ACCESS_TOKEN = 'test-access-token'

const mockTables = [
  { id: 'table-1', label: 'Table 1', seat_count: 4, grid_x: 2, grid_y: 3 },
  { id: 'table-2', label: 'Table 2', seat_count: 2, grid_x: null, grid_y: null },
]

beforeEach(() => {
  vi.restoreAllMocks()
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
})

describe('saveTablePosition', () => {
  it('calls the correct endpoint with correct payload', async (): Promise<void> => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    )
    vi.stubGlobal('fetch', mockFetch)

    await saveTablePosition(SUPABASE_URL, ACCESS_TOKEN, 'table-1', 5, 3)

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

    await saveTablePosition(SUPABASE_URL, ACCESS_TOKEN, 'table-1', null, null)

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
      saveTablePosition(SUPABASE_URL, ACCESS_TOKEN, '', null, null),
    ).rejects.toThrow('table_id is required')
  })

  it('throws with status code when body has no error field', async (): Promise<void> => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('Internal Server Error', { status: 500 }),
    ))

    await expect(
      saveTablePosition(SUPABASE_URL, ACCESS_TOKEN, 'table-1', 0, 0),
    ).rejects.toThrow('500')
  })
})
