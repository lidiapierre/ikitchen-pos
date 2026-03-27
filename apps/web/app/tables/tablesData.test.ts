import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchTables } from './tablesData'

const BASE_URL = 'https://example.supabase.co'
const API_KEY = 'test-api-key'

function mockFetch(responses: { ok: boolean; status?: number; statusText?: string; body: unknown }[]): void {
  let callCount = 0
  vi.stubGlobal('fetch', vi.fn(async () => {
    const res = responses[callCount++]
    return {
      ok: res.ok,
      status: res.status ?? 200,
      statusText: res.statusText ?? 'OK',
      json: async () => res.body,
      text: async () => String(res.body),
    }
  }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchTables', () => {
  it('returns tables with open_order_id and order_item_count populated when an open order exists', async (): Promise<void> => {
    mockFetch([
      { ok: true, body: [{ id: 'table-1', label: 'Table 1' }, { id: 'table-2', label: 'Table 2' }] },
      { ok: true, body: [{ id: 'order-1', table_id: 'table-1', status: 'open', created_at: '2026-03-27T08:00:00Z' }] },
      { ok: true, body: [{ order_id: 'order-1' }, { order_id: 'order-1' }] }, // 2 non-voided items
    ])

    const result = await fetchTables(BASE_URL, API_KEY)

    expect(result).toEqual([
      { id: 'table-1', label: 'Table 1', open_order_id: 'order-1', order_status: 'open', order_created_at: '2026-03-27T08:00:00Z', order_item_count: 2 },
      { id: 'table-2', label: 'Table 2', open_order_id: null, order_status: null, order_created_at: null, order_item_count: null },
    ])
  })

  it('returns order_item_count: 0 when order exists but has no non-voided items', async (): Promise<void> => {
    mockFetch([
      { ok: true, body: [{ id: 'table-1', label: 'Table 1' }] },
      { ok: true, body: [{ id: 'order-1', table_id: 'table-1', status: 'open', created_at: '2026-03-27T08:00:00Z' }] },
      { ok: true, body: [] }, // no non-voided items
    ])

    const result = await fetchTables(BASE_URL, API_KEY)
    expect(result[0].order_item_count).toBe(0)
  })

  it('returns all tables as empty (order_item_count: null) when no open orders exist', async (): Promise<void> => {
    mockFetch([
      { ok: true, body: [{ id: 'table-1', label: 'Table 1' }, { id: 'table-2', label: 'Table 2' }] },
      { ok: true, body: [] },
      // no 3rd fetch — items fetch is skipped when there are no orders
    ])

    const result = await fetchTables(BASE_URL, API_KEY)

    expect(result).toEqual([
      { id: 'table-1', label: 'Table 1', open_order_id: null, order_status: null, order_created_at: null, order_item_count: null },
      { id: 'table-2', label: 'Table 2', open_order_id: null, order_status: null, order_created_at: null, order_item_count: null },
    ])
  })

  it('populates order_status from the order record', async (): Promise<void> => {
    mockFetch([
      { ok: true, body: [{ id: 'table-1', label: 'Table 1' }] },
      { ok: true, body: [{ id: 'order-1', table_id: 'table-1', status: 'pending_payment', created_at: '2026-03-27T08:00:00Z' }] },
      { ok: true, body: [{ order_id: 'order-1' }] },
    ])

    const result = await fetchTables(BASE_URL, API_KEY)

    expect(result[0].order_status).toBe('pending_payment')
    expect(result[0].order_created_at).toBe('2026-03-27T08:00:00Z')
    expect(result[0].order_item_count).toBe(1)
  })

  it('sends correct apikey and Authorization headers', async (): Promise<void> => {
    // Use a typed mock that accepts fetch-compatible arguments
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve({
      ok: true,
      json: async () => [] as unknown[],
      text: async () => '[]',
    }))
    vi.stubGlobal('fetch', fetchMock)

    await fetchTables(BASE_URL, API_KEY)

    for (const [, init] of fetchMock.mock.calls) {
      const headers = (init?.headers ?? {}) as Record<string, string>
      expect(headers.apikey).toBe(API_KEY)
      expect(headers.Authorization).toBe(`Bearer ${API_KEY}`)
    }
  })

  it('queries tables with select=id,label', async (): Promise<void> => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve({
      ok: true,
      json: async () => [] as unknown[],
      text: async () => '[]',
    }))
    vi.stubGlobal('fetch', fetchMock)

    await fetchTables(BASE_URL, API_KEY)

    const tablesCall = fetchMock.mock.calls[0][0]
    expect(tablesCall).toContain('/rest/v1/tables')
    expect(tablesCall).toContain('select=id%2Clabel')
  })

  it('queries orders with status=in.(open,pending_payment)', async (): Promise<void> => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve({
      ok: true,
      json: async () => [] as unknown[],
      text: async () => '[]',
    }))
    vi.stubGlobal('fetch', fetchMock)

    await fetchTables(BASE_URL, API_KEY)

    const ordersCall = fetchMock.mock.calls[1][0]
    expect(ordersCall).toContain('/rest/v1/orders')
    expect(ordersCall).toContain('status=in.')
  })

  it('queries order_items with voided=eq.false when orders exist', async (): Promise<void> => {
    let callIdx = 0
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) => {
      callIdx++
      if (callIdx === 1) return Promise.resolve({ ok: true, json: async () => [{ id: 'table-1', label: 'T1' }] as unknown[], text: async () => '' })
      if (callIdx === 2) return Promise.resolve({ ok: true, json: async () => [{ id: 'order-1', table_id: 'table-1', status: 'open', created_at: '2026-03-27T08:00:00Z' }] as unknown[], text: async () => '' })
      return Promise.resolve({ ok: true, json: async () => [] as unknown[], text: async () => '' })
    })
    vi.stubGlobal('fetch', fetchMock)

    await fetchTables(BASE_URL, API_KEY)

    expect(callIdx).toBe(3)
    const itemsCall = fetchMock.mock.calls[2][0]
    expect(itemsCall).toContain('/rest/v1/order_items')
    expect(itemsCall).toContain('voided=eq.false')
  })

  it('throws when the tables request fails', async (): Promise<void> => {
    mockFetch([
      { ok: false, status: 403, statusText: 'Forbidden', body: 'permission denied' },
    ])

    await expect(fetchTables(BASE_URL, API_KEY)).rejects.toThrow(
      'Failed to fetch tables: 403 Forbidden',
    )
  })

  it('throws when the orders request fails', async (): Promise<void> => {
    mockFetch([
      { ok: true, body: [{ id: 'table-1', label: 'Table 1' }] },
      { ok: false, status: 403, statusText: 'Forbidden', body: 'permission denied' },
    ])

    await expect(fetchTables(BASE_URL, API_KEY)).rejects.toThrow(
      'Failed to fetch orders: 403 Forbidden',
    )
  })

  it('throws when the order items request fails', async (): Promise<void> => {
    mockFetch([
      { ok: true, body: [{ id: 'table-1', label: 'Table 1' }] },
      { ok: true, body: [{ id: 'order-1', table_id: 'table-1', status: 'open', created_at: '2026-03-27T08:00:00Z' }] },
      { ok: false, status: 500, statusText: 'Internal Server Error', body: 'error' },
    ])

    await expect(fetchTables(BASE_URL, API_KEY)).rejects.toThrow(
      'Failed to fetch order items: 500 Internal Server Error',
    )
  })

  it('returns empty array when there are no tables', async (): Promise<void> => {
    mockFetch([
      { ok: true, body: [] },
      { ok: true, body: [] },
    ])

    const result = await fetchTables(BASE_URL, API_KEY)
    expect(result).toEqual([])
  })
})
