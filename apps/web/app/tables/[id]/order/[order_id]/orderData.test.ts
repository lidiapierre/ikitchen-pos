import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchOrderItems, fetchOrderSummary } from './orderData'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

afterEach((): void => {
  vi.clearAllMocks()
})

describe('fetchOrderItems', () => {
  it('returns mapped order items from the API', async (): Promise<void> => {
    const mockRows = [
      { id: 'item-1', quantity: 2, unit_price_cents: 850, modifier_ids: [], sent_to_kitchen: false, comp: false, comp_reason: null, seat: null, course: 'main', course_status: 'waiting', menu_items: { name: 'Bruschetta' } },
      { id: 'item-2', quantity: 1, unit_price_cents: 1850, modifier_ids: [], sent_to_kitchen: false, comp: false, comp_reason: null, seat: null, course: 'main', course_status: 'waiting', menu_items: { name: 'Grilled Salmon' } },
    ]
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async (): Promise<typeof mockRows> => mockRows,
    })

    const result = await fetchOrderItems('https://example.supabase.co', 'test-key', 'order-123')

    expect(result).toEqual([
      { id: 'item-1', name: 'Bruschetta', quantity: 2, price_cents: 850, modifier_ids: [], modifier_names: [], sent_to_kitchen: false, comp: false, comp_reason: null, seat: null, course: 'main', course_status: 'waiting', menuId: null, printerType: 'kitchen', item_discount_type: null, item_discount_value: null },
      { id: 'item-2', name: 'Grilled Salmon', quantity: 1, price_cents: 1850, modifier_ids: [], modifier_names: [], sent_to_kitchen: false, comp: false, comp_reason: null, seat: null, course: 'main', course_status: 'waiting', menuId: null, printerType: 'kitchen', item_discount_type: null, item_discount_value: null },
    ])
  })

  it('resolves modifier names for items with modifier_ids', async (): Promise<void> => {
    const mockRows = [
      {
        id: 'item-1',
        quantity: 1,
        unit_price_cents: 1200,
        modifier_ids: ['mod-001', 'mod-002'],
        menu_items: { name: 'Burger' },
      },
    ]
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async (): Promise<typeof mockRows> => mockRows,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async (): Promise<Array<{ id: string; name: string }>> => [
          { id: 'mod-001', name: 'Extra cheese' },
          { id: 'mod-002', name: 'No onions' },
        ],
      })

    const result = await fetchOrderItems('https://example.supabase.co', 'test-key', 'order-123')

    expect(result[0].modifier_ids).toEqual(['mod-001', 'mod-002'])
    expect(result[0].modifier_names).toEqual(['Extra cheese', 'No onions'])
  })

  it('returns modifier_ids as-is when modifier name fetch fails', async (): Promise<void> => {
    const mockRows = [
      {
        id: 'item-1',
        quantity: 1,
        unit_price_cents: 1200,
        modifier_ids: ['mod-001'],
        menu_items: { name: 'Burger' },
      },
    ]
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async (): Promise<typeof mockRows> => mockRows,
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      })

    const result = await fetchOrderItems('https://example.supabase.co', 'test-key', 'order-123')

    // Falls back to ID as name when fetch fails
    expect(result[0].modifier_names).toEqual(['mod-001'])
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
      status: 401,
      statusText: 'Unauthorized',
      text: async (): Promise<string> => '{"code":"PGRST205","message":"Could not find the table"}',
    })

    await expect(
      fetchOrderItems('https://example.supabase.co', 'bad-key', 'order-123'),
    ).rejects.toThrow('Failed to fetch order items: 401 Unauthorized')
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

describe('fetchOrderSummary', () => {
  it('returns status open with null payment_method for open orders', async (): Promise<void> => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async (): Promise<Array<{ status: string }>> => [{ status: 'open' }],
    })

    const result = await fetchOrderSummary('https://example.supabase.co', 'test-key', 'order-123')

    expect(result).toEqual({ status: 'open', payment_method: null })
  })

  it('fetches payment method when order is paid', async (): Promise<void> => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async (): Promise<Array<{ status: string }>> => [{ status: 'paid' }],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async (): Promise<Array<{ method: string }>> => [{ method: 'card' }],
      })

    const result = await fetchOrderSummary('https://example.supabase.co', 'test-key', 'order-123')

    expect(result).toEqual({ status: 'paid', payment_method: 'card' })
  })

  it('returns null payment_method when payment fetch fails for paid order', async (): Promise<void> => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async (): Promise<Array<{ status: string }>> => [{ status: 'paid' }],
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async (): Promise<string> => 'error',
      })

    const result = await fetchOrderSummary('https://example.supabase.co', 'test-key', 'order-123')

    expect(result).toEqual({ status: 'paid', payment_method: null })
  })

  it('throws when the order fetch fails', async (): Promise<void> => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async (): Promise<string> => 'not found',
    })

    await expect(
      fetchOrderSummary('https://example.supabase.co', 'test-key', 'order-missing'),
    ).rejects.toThrow('Failed to fetch order: 404 Not Found')
  })

  it('throws when the order does not exist', async (): Promise<void> => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async (): Promise<[]> => [],
    })

    await expect(
      fetchOrderSummary('https://example.supabase.co', 'test-key', 'order-missing'),
    ).rejects.toThrow('Order not found')
  })

  it('passes correct auth headers', async (): Promise<void> => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async (): Promise<Array<{ status: string }>> => [{ status: 'open' }],
    })

    await fetchOrderSummary('https://example.supabase.co', 'my-key', 'order-abc')

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    const headers = options.headers as Record<string, string>
    expect(headers['apikey']).toBe('my-key')
    expect(headers['Authorization']).toBe('Bearer my-key')
  })

  it('queries the correct order endpoint with id filter', async (): Promise<void> => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async (): Promise<Array<{ status: string }>> => [{ status: 'open' }],
    })

    await fetchOrderSummary('https://example.supabase.co', 'test-key', 'order-xyz')

    const [url] = mockFetch.mock.calls[0] as [string]
    expect(url).toContain('/rest/v1/orders')
    expect(url).toContain('id=eq.order-xyz')
  })
})
