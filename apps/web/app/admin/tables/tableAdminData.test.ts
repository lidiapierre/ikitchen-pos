import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchRestaurantId, fetchAdminTables } from './tableAdminData'

const BASE_URL = 'https://test.supabase.co'
const API_KEY = 'test-api-key'

function makeJsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  } as unknown as Response
}

function makeErrorResponse(status: number, statusText: string, body: string): Response {
  return {
    ok: false,
    status,
    statusText,
    text: vi.fn().mockResolvedValue(body),
  } as unknown as Response
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchRestaurantId', () => {
  it('returns the id of the first restaurant', async () => {
    vi.mocked(fetch).mockResolvedValue(makeJsonResponse([{ id: 'rest-abc' }]))
    const id = await fetchRestaurantId(BASE_URL, API_KEY)
    expect(id).toBe('rest-abc')
  })

  it('sends correct select and limit query params', async () => {
    vi.mocked(fetch).mockResolvedValue(makeJsonResponse([{ id: 'rest-abc' }]))
    await fetchRestaurantId(BASE_URL, API_KEY)
    const [calledUrl] = vi.mocked(fetch).mock.calls[0] as [string, ...unknown[]]
    const url = new URL(calledUrl)
    expect(url.searchParams.get('select')).toBe('id')
    expect(url.searchParams.get('limit')).toBe('1')
  })

  it('sends the apikey and Authorization headers', async () => {
    vi.mocked(fetch).mockResolvedValue(makeJsonResponse([{ id: 'rest-abc' }]))
    await fetchRestaurantId(BASE_URL, API_KEY)
    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]
    const headers = options.headers as Record<string, string>
    expect(headers.apikey).toBe(API_KEY)
    expect(headers.Authorization).toBe(`Bearer ${API_KEY}`)
  })

  it('throws when the response is not ok', async () => {
    vi.mocked(fetch).mockResolvedValue(makeErrorResponse(500, 'Internal Server Error', 'oops'))
    await expect(fetchRestaurantId(BASE_URL, API_KEY)).rejects.toThrow(
      'Failed to fetch restaurant: 500 Internal Server Error — oops',
    )
  })

  it('throws when no restaurant rows are returned', async () => {
    vi.mocked(fetch).mockResolvedValue(makeJsonResponse([]))
    await expect(fetchRestaurantId(BASE_URL, API_KEY)).rejects.toThrow('No restaurant found')
  })
})

describe('fetchAdminTables', () => {
  it('returns tables with open_order_id populated for occupied tables', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        makeJsonResponse([
          { id: 'tbl-1', label: 'Table 1', seat_count: 4 },
          { id: 'tbl-2', label: 'Table 2', seat_count: 2 },
        ]),
      )
      .mockResolvedValueOnce(makeJsonResponse([{ id: 'ord-1', table_id: 'tbl-2' }]))

    const tables = await fetchAdminTables(BASE_URL, API_KEY)
    expect(tables).toHaveLength(2)
    expect(tables[0]).toEqual({ id: 'tbl-1', label: 'Table 1', seat_count: 4, open_order_id: null })
    expect(tables[1]).toEqual({
      id: 'tbl-2',
      label: 'Table 2',
      seat_count: 2,
      open_order_id: 'ord-1',
    })
  })

  it('sets open_order_id to null for all tables when no open orders exist', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        makeJsonResponse([
          { id: 'tbl-1', label: 'Table 1', seat_count: 4 },
          { id: 'tbl-2', label: 'Table 2', seat_count: 2 },
        ]),
      )
      .mockResolvedValueOnce(makeJsonResponse([]))

    const tables = await fetchAdminTables(BASE_URL, API_KEY)
    expect(tables.every((t) => t.open_order_id === null)).toBe(true)
  })

  it('returns an empty array when no tables exist', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeJsonResponse([]))
      .mockResolvedValueOnce(makeJsonResponse([]))
    const tables = await fetchAdminTables(BASE_URL, API_KEY)
    expect(tables).toEqual([])
  })

  it('ignores orders with a null table_id when computing open_order_id', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeJsonResponse([{ id: 'tbl-1', label: 'Table 1', seat_count: 4 }]))
      .mockResolvedValueOnce(makeJsonResponse([{ id: 'ord-orphan', table_id: null }]))

    const tables = await fetchAdminTables(BASE_URL, API_KEY)
    expect(tables[0].open_order_id).toBeNull()
  })

  it('throws when the tables fetch fails', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeErrorResponse(503, 'Service Unavailable', 'down'))
      .mockResolvedValueOnce(makeJsonResponse([]))

    await expect(fetchAdminTables(BASE_URL, API_KEY)).rejects.toThrow(
      'Failed to fetch tables: 503 Service Unavailable — down',
    )
  })

  it('throws when the orders fetch fails', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeJsonResponse([{ id: 'tbl-1', label: 'Table 1', seat_count: 4 }]))
      .mockResolvedValueOnce(makeErrorResponse(503, 'Service Unavailable', 'down'))

    await expect(fetchAdminTables(BASE_URL, API_KEY)).rejects.toThrow(
      'Failed to fetch orders: 503 Service Unavailable — down',
    )
  })

  it('sends the orders query with status=eq.open filter', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeJsonResponse([]))
      .mockResolvedValueOnce(makeJsonResponse([]))

    await fetchAdminTables(BASE_URL, API_KEY)
    const [ordersUrl] = vi.mocked(fetch).mock.calls[1] as [string, ...unknown[]]
    const url = new URL(ordersUrl)
    expect(url.searchParams.get('status')).toBe('eq.open')
  })
})
