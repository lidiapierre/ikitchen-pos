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
  it('returns tables with open_order_id populated when an open order exists', async (): Promise<void> => {
    mockFetch([
      { ok: true, body: [{ id: 'table-1', label: 'Table 1' }, { id: 'table-2', label: 'Table 2' }] },
      { ok: true, body: [{ id: 'order-1', table_id: 'table-1', status: 'open', created_at: '2026-03-27T08:00:00Z' }] },
    ])

    const result = await fetchTables(BASE_URL, API_KEY)

    expect(result).toEqual([
      { id: 'table-1', label: 'Table 1', open_order_id: 'order-1', order_status: 'open', order_created_at: '2026-03-27T08:00:00Z' },
      { id: 'table-2', label: 'Table 2', open_order_id: null, order_status: null, order_created_at: null },
    ])
  })

  it('returns all tables as empty when no open orders exist', async (): Promise<void> => {
    mockFetch([
      { ok: true, body: [{ id: 'table-1', label: 'Table 1' }, { id: 'table-2', label: 'Table 2' }] },
      { ok: true, body: [] },
    ])

    const result = await fetchTables(BASE_URL, API_KEY)

    expect(result).toEqual([
      { id: 'table-1', label: 'Table 1', open_order_id: null, order_status: null, order_created_at: null },
      { id: 'table-2', label: 'Table 2', open_order_id: null, order_status: null, order_created_at: null },
    ])
  })

  it('populates order_status from the order record', async (): Promise<void> => {
    mockFetch([
      { ok: true, body: [{ id: 'table-1', label: 'Table 1' }] },
      { ok: true, body: [{ id: 'order-1', table_id: 'table-1', status: 'pending_payment', created_at: '2026-03-27T08:00:00Z' }] },
    ])

    const result = await fetchTables(BASE_URL, API_KEY)

    expect(result[0].order_status).toBe('pending_payment')
    expect(result[0].order_created_at).toBe('2026-03-27T08:00:00Z')
  })

  it('sends correct apikey and Authorization headers', async (): Promise<void> => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => [],
      text: async () => '[]',
    }))
    vi.stubGlobal('fetch', fetchMock)

    await fetchTables(BASE_URL, API_KEY)

    for (const call of fetchMock.mock.calls) {
      const headers = call[1]?.headers as Record<string, string>
      expect(headers.apikey).toBe(API_KEY)
      expect(headers.Authorization).toBe(`Bearer ${API_KEY}`)
    }
  })

  it('queries tables with select=id,label', async (): Promise<void> => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => [],
      text: async () => '[]',
    }))
    vi.stubGlobal('fetch', fetchMock)

    await fetchTables(BASE_URL, API_KEY)

    const tablesCall = fetchMock.mock.calls[0][0] as string
    expect(tablesCall).toContain('/rest/v1/tables')
    expect(tablesCall).toContain('select=id%2Clabel')
  })

  it('queries orders with status=in.(open,pending_payment)', async (): Promise<void> => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => [],
      text: async () => '[]',
    }))
    vi.stubGlobal('fetch', fetchMock)

    await fetchTables(BASE_URL, API_KEY)

    const ordersCall = fetchMock.mock.calls[1][0] as string
    expect(ordersCall).toContain('/rest/v1/orders')
    expect(ordersCall).toContain('status=in.')
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

  it('returns empty array when there are no tables', async (): Promise<void> => {
    mockFetch([
      { ok: true, body: [] },
      { ok: true, body: [] },
    ])

    const result = await fetchTables(BASE_URL, API_KEY)
    expect(result).toEqual([])
  })
})
