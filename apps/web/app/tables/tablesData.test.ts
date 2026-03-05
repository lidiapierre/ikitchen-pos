import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchTables } from './tablesData'

const BASE_URL = 'https://example.supabase.co'
const API_KEY = 'test-api-key'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('fetchTables', () => {
  it('returns tables with open_order_id when an open order exists', async (): Promise<void> => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve([
            { id: 'table-uuid-1', label: 'Table 1', orders: [{ id: 'order-uuid-1' }] },
            { id: 'table-uuid-2', label: 'Table 2', orders: [] },
          ]),
      }),
    )

    const result = await fetchTables(BASE_URL, API_KEY)

    expect(result).toEqual([
      { id: 'table-uuid-1', label: 'Table 1', open_order_id: 'order-uuid-1' },
      { id: 'table-uuid-2', label: 'Table 2', open_order_id: null },
    ])
  })

  it('sends a GET request to the correct REST endpoint', async (): Promise<void> => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    })
    vi.stubGlobal('fetch', mockFetch)

    await fetchTables(BASE_URL, API_KEY)

    const [url] = mockFetch.mock.calls[0] as [string]
    expect(url).toContain(`${BASE_URL}/rest/v1/tables`)
    expect(url).toContain('select=id%2Clabel%2Corders%28id%29')
    expect(url).toContain('orders.status=eq.open')
  })

  it('sends the correct auth headers', async (): Promise<void> => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    })
    vi.stubGlobal('fetch', mockFetch)

    await fetchTables(BASE_URL, API_KEY)

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>)['apikey']).toBe(API_KEY)
    expect((init.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${API_KEY}`)
  })

  it('returns an empty array when there are no tables', async (): Promise<void> => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      }),
    )

    const result = await fetchTables(BASE_URL, API_KEY)
    expect(result).toEqual([])
  })

  it('throws when the response is not ok', async (): Promise<void> => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: () => Promise.resolve('Invalid API key'),
      }),
    )

    await expect(fetchTables(BASE_URL, API_KEY)).rejects.toThrow(
      'Failed to fetch tables: 401 Unauthorized — Invalid API key',
    )
  })

  it('propagates network errors', async (): Promise<void> => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    await expect(fetchTables(BASE_URL, API_KEY)).rejects.toThrow('Network error')
  })
})
