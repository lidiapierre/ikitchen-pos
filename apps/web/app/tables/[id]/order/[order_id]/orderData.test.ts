import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchOrderItems } from './orderData'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

afterEach((): void => {
  vi.clearAllMocks()
})

describe('fetchOrderItems', () => {
  it('returns mapped order items from the API', async (): Promise<void> => {
    const mockRows = [
      { id: 'item-1', quantity: 2, unit_price_cents: 850, menu_items: { name: 'Bruschetta' } },
      { id: 'item-2', quantity: 1, unit_price_cents: 1850, menu_items: { name: 'Grilled Salmon' } },
    ]
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async (): Promise<typeof mockRows> => mockRows,
    })

    const result = await fetchOrderItems('https://example.supabase.co', 'test-key', 'order-123')

    expect(result).toEqual([
      { id: 'item-1', name: 'Bruschetta', quantity: 2, price_cents: 850 },
      { id: 'item-2', name: 'Grilled Salmon', quantity: 1, price_cents: 1850 },
    ])
  })

  it('returns an empty array when the order has no items', async (): Promise<void> => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async (): Promise<[]> => [],
    })

    const result = await fetchOrderItems('https://example.supabase.co', 'test-key', 'order-empty')

    expect(result).toEqual([])
  })

  it('throws when the response is not ok', async (): Promise<void> => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      statusText: 'Unauthorized',
    })

    await expect(
      fetchOrderItems('https://example.supabase.co', 'bad-key', 'order-123'),
    ).rejects.toThrow('Failed to fetch order items: Unauthorized')
  })

  it('passes the correct auth headers', async (): Promise<void> => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async (): Promise<[]> => [],
    })

    await fetchOrderItems('https://example.supabase.co', 'my-key', 'order-abc')

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    const headers = options.headers as Record<string, string>
    expect(headers['apikey']).toBe('my-key')
    expect(headers['Authorization']).toBe('Bearer my-key')
  })

  it('filters by order_id and excludes voided items via query params', async (): Promise<void> => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async (): Promise<[]> => [],
    })

    await fetchOrderItems('https://example.supabase.co', 'test-key', 'order-abc')

    const [url] = mockFetch.mock.calls[0] as [string]
    expect(url).toContain('/rest/v1/order_items')
    expect(url).toContain('order_id=eq.order-abc')
    expect(url).toContain('voided=eq.false')
  })
})
