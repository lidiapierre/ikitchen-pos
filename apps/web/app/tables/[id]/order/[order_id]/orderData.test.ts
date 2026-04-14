import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchOrderItems, fetchOrderSummary } from './orderData'

// Helper: minimal order row returned by the orders endpoint
function orderRow(overrides: object = {}): object {
  return {
    status: 'open',
    order_type: 'dine_in',
    customer_name: null,
    delivery_note: null,
    customer_mobile: null,
    bill_number: null,
    reservation_id: null,
    customer_id: null,
    order_number: null,
    scheduled_time: null,
    delivery_zone_id: null,
    delivery_charge: null,
    merge_label: null,
    delivery_zones: null,
    ...overrides,
  }
}

// Helper: minimal expected OrderSummary shape
function expectedSummary(overrides: object = {}): object {
  return {
    status: 'open',
    payment_method: null,
    payment_lines: [],
    order_type: 'dine_in',
    customer_name: null,
    delivery_note: null,
    customer_mobile: null,
    bill_number: null,
    reservation_id: null,
    customer_id: null,
    order_number: null,
    scheduled_time: null,
    delivery_zone_id: null,
    delivery_zone_name: null,
    delivery_charge: 0,
    merge_label: null,
    post_bill_mode: false,
    ...overrides,
  }
}

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
      { id: 'item-1', name: 'Bruschetta', quantity: 2, price_cents: 850, modifier_ids: [], modifier_names: [], sent_to_kitchen: false, comp: false, comp_reason: null, seat: null, course: 'main', course_status: 'waiting', menuId: null, printerType: 'kitchen', item_discount_type: null, item_discount_value: null, notes: null },
      { id: 'item-2', name: 'Grilled Salmon', quantity: 1, price_cents: 1850, modifier_ids: [], modifier_names: [], sent_to_kitchen: false, comp: false, comp_reason: null, seat: null, course: 'main', course_status: 'waiting', menuId: null, printerType: 'kitchen', item_discount_type: null, item_discount_value: null, notes: null },
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

    await fetchOrderItems('https://example.supabase.co', 'my-token', 'order-abc')

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    const headers = options.headers as Record<string, string>
    // apikey uses NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY env var (not the access token)
    expect(headers['apikey']).toBeDefined()
    // Authorization always carries the caller-supplied access token
    expect(headers['Authorization']).toBe('Bearer my-token')
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
  it('returns status open with null payment_method and empty payment_lines for open orders', async (): Promise<void> => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async (): Promise<object[]> => [orderRow()],
    })

    const result = await fetchOrderSummary('https://example.supabase.co', 'test-key', 'order-123')

    expect(result).toEqual(expectedSummary())
  })

  it('fetches all payment lines when order is paid and returns them in payment_lines', async (): Promise<void> => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async (): Promise<object[]> => [orderRow({ status: 'paid' })],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async (): Promise<object[]> => [
          { method: 'cash', amount_cents: 30000, tendered_amount_cents: 35000 },
          { method: 'card', amount_cents: 20000, tendered_amount_cents: 20000 },
        ],
      })

    const result = await fetchOrderSummary('https://example.supabase.co', 'test-key', 'order-123')

    expect(result).toEqual(expectedSummary({
      status: 'paid',
      payment_method: 'cash',
      payment_lines: [
        { method: 'cash', amount_cents: 30000, tendered_amount_cents: 35000 },
        { method: 'card', amount_cents: 20000, tendered_amount_cents: 20000 },
      ],
    }))
  })

  it('returns payment_method from first payment row for backward compat', async (): Promise<void> => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async (): Promise<object[]> => [orderRow({ status: 'paid' })],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async (): Promise<object[]> => [
          { method: 'card', amount_cents: 50000, tendered_amount_cents: 50000 },
        ],
      })

    const result = await fetchOrderSummary('https://example.supabase.co', 'test-key', 'order-123')

    expect(result.payment_method).toBe('card')
    expect(result.payment_lines).toHaveLength(1)
    expect(result.payment_lines[0].amount_cents).toBe(50000)
  })

  it('returns null payment_method and empty payment_lines when payment fetch fails for paid order', async (): Promise<void> => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async (): Promise<object[]> => [orderRow({ status: 'paid' })],
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async (): Promise<string> => 'error',
      })

    const result = await fetchOrderSummary('https://example.supabase.co', 'test-key', 'order-123')

    expect(result).toEqual(expectedSummary({ status: 'paid', payment_method: null, payment_lines: [] }))
  })

  it('fetches all payment rows without a row limit (for split-payment audit trail)', async (): Promise<void> => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async (): Promise<object[]> => [orderRow({ status: 'paid' })],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async (): Promise<object[]> => [],
      })

    await fetchOrderSummary('https://example.supabase.co', 'test-key', 'order-123')

    const [paymentUrl] = mockFetch.mock.calls[1] as [string]
    expect(paymentUrl).toContain('/rest/v1/payments')
    // Must NOT have a limit=1 param (issue #391 — need all rows)
    expect(paymentUrl).not.toContain('limit=1')
    // Must request amount_cents and tendered_amount_cents
    expect(paymentUrl).toContain('amount_cents')
    expect(paymentUrl).toContain('tendered_amount_cents')
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

  it('passes correct Authorization header to payment endpoint', async (): Promise<void> => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async (): Promise<object[]> => [orderRow({ status: 'paid' })],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async (): Promise<object[]> => [],
      })

    await fetchOrderSummary('https://example.supabase.co', 'my-token', 'order-abc')

    const [, options] = mockFetch.mock.calls[1] as [string, RequestInit]
    const headers = options.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer my-token')
  })

  it('queries the correct order endpoint with id filter', async (): Promise<void> => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async (): Promise<object[]> => [orderRow()],
    })

    await fetchOrderSummary('https://example.supabase.co', 'test-key', 'order-xyz')

    const [url] = mockFetch.mock.calls[0] as [string]
    expect(url).toContain('/rest/v1/orders')
    expect(url).toContain('id=eq.order-xyz')
  })
})
