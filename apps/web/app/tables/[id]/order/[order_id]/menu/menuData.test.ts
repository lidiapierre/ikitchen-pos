import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchMenuCategories } from './menuData'

const BASE_URL = 'https://example.supabase.co'
const API_KEY = 'test-api-key'
const ORDER_ID = 'order-abc-123'
const RESTAURANT_ID = 'restaurant-uuid-001'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('fetchMenuCategories', () => {
  it('returns categories with items on success', async (): Promise<void> => {
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([{ restaurant_id: RESTAURANT_ID }]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                id: 'menu-001',
                name: 'Starters',
                menu_items: [
                  { id: 'item-001', name: 'Bruschetta', price_cents: 850 },
                ],
              },
            ]),
        }),
    )

    const result = await fetchMenuCategories(BASE_URL, API_KEY, ORDER_ID)

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Starters')
    expect(result[0].items).toHaveLength(1)
    expect(result[0].items[0].name).toBe('Bruschetta')
    expect(result[0].items[0].price_cents).toBe(850)
  })

  it('fetches order to get restaurant_id', async (): Promise<void> => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ restaurant_id: RESTAURANT_ID }]),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      })
    vi.stubGlobal('fetch', mockFetch)

    await fetchMenuCategories(BASE_URL, API_KEY, ORDER_ID)

    const [firstUrl] = mockFetch.mock.calls[0] as [string]
    expect(firstUrl).toContain('/rest/v1/orders')
    expect(firstUrl).toContain(ORDER_ID)
  })

  it('fetches menus filtered by restaurant_id', async (): Promise<void> => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ restaurant_id: RESTAURANT_ID }]),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      })
    vi.stubGlobal('fetch', mockFetch)

    await fetchMenuCategories(BASE_URL, API_KEY, ORDER_ID)

    const [secondUrl] = mockFetch.mock.calls[1] as [string]
    expect(secondUrl).toContain('/rest/v1/menus')
    expect(secondUrl).toContain(RESTAURANT_ID)
  })

  it('throws when the order fetch fails', async (): Promise<void> => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('error'),
      }),
    )

    await expect(fetchMenuCategories(BASE_URL, API_KEY, ORDER_ID)).rejects.toThrow(
      'Failed to fetch order',
    )
  })

  it('throws when order is not found', async (): Promise<void> => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      }),
    )

    await expect(fetchMenuCategories(BASE_URL, API_KEY, ORDER_ID)).rejects.toThrow(
      'Unable to load menu',
    )
  })

  it('throws when the menus fetch fails', async (): Promise<void> => {
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([{ restaurant_id: RESTAURANT_ID }]),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          text: () => Promise.resolve('error'),
        }),
    )

    await expect(fetchMenuCategories(BASE_URL, API_KEY, ORDER_ID)).rejects.toThrow(
      'Failed to fetch menus',
    )
  })

  it('returns empty array when no menus exist', async (): Promise<void> => {
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([{ restaurant_id: RESTAURANT_ID }]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve([]),
        }),
    )

    const result = await fetchMenuCategories(BASE_URL, API_KEY, ORDER_ID)
    expect(result).toHaveLength(0)
  })

  it('propagates network errors', async (): Promise<void> => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    await expect(fetchMenuCategories(BASE_URL, API_KEY, ORDER_ID)).rejects.toThrow('Network error')
  })

  it('sends correct auth headers to both requests', async (): Promise<void> => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ restaurant_id: RESTAURANT_ID }]),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      })
    vi.stubGlobal('fetch', mockFetch)

    await fetchMenuCategories(BASE_URL, API_KEY, ORDER_ID)

    for (const call of mockFetch.mock.calls) {
      const [, init] = call as [string, RequestInit]
      const headers = init.headers as Record<string, string>
      expect(headers['apikey']).toBe(API_KEY)
      expect(headers['Authorization']).toBe(`Bearer ${API_KEY}`)
    }
  })
})
