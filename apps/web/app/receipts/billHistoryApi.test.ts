/**
 * Tests for billHistoryApi — issue #395 bill receipt history.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchBillHistory, fetchOrderForReprint, fetchRestaurantConfig } from './billHistoryApi'

const BASE_URL = 'https://test.supabase.co'
const TOKEN = 'test-token'

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    bill_number: 'RN0001234',
    order_number: 7,
    created_at: '2026-04-13T08:00:00.000Z',
    final_total_cents: 120000,
    discount_amount_cents: 0,
    order_comp: false,
    order_type: 'dine_in',
    server_id: 'user-1',
    customer_name: null,
    customer_mobile: null,
    delivery_note: null,
    delivery_charge: 0,
    service_charge_cents: 0,
    tables: { label: 'T1' },
    delivery_zones: null,
    payments: [{ method: 'cash', amount_cents: 120000, tendered_amount_cents: 150000 }],
    ...overrides,
  }
}

describe('fetchBillHistory', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns orders and total_daily_cents for a single paid order', async () => {
    const mockFetch = vi.fn()
    // First call: orders
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [makeOrder()],
    } as unknown as Response)
    // Second call: users (for server name resolution)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 'user-1', name: 'Ali', email: 'ali@test.com' }],
    } as unknown as Response)

    vi.stubGlobal('fetch', mockFetch)

    const result = await fetchBillHistory({
      supabaseUrl: BASE_URL,
      accessToken: TOKEN,
      date: '2026-04-13',
    })

    expect(result.orders).toHaveLength(1)
    expect(result.orders[0].id).toBe('order-1')
    expect(result.orders[0].bill_number).toBe('RN0001234')
    expect(result.orders[0].table_label).toBe('T1')
    expect(result.orders[0].final_total_cents).toBe(120000)
    expect(result.orders[0].payment_summary).toBe('Cash')
    expect(result.orders[0].server_name).toBe('Ali')
    expect(result.total_daily_cents).toBe(120000)
  })

  it('handles split payments correctly', async () => {
    const mockFetch = vi.fn()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        makeOrder({
          payments: [
            { method: 'cash', amount_cents: 60000, tendered_amount_cents: 60000 },
            { method: 'card', amount_cents: 60000, tendered_amount_cents: null },
          ],
        }),
      ],
    } as unknown as Response)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as unknown as Response)

    vi.stubGlobal('fetch', mockFetch)

    const result = await fetchBillHistory({ supabaseUrl: BASE_URL, accessToken: TOKEN })

    expect(result.orders[0].is_split).toBe(true)
    // Uses PAYMENT_METHOD_LABELS from @/lib/paymentMethods: 'Card / POS'
    expect(result.orders[0].payment_summary).toBe('Cash + Card / POS')
  })

  it('filters by serverId when provided', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as unknown as Response)

    vi.stubGlobal('fetch', mockFetch)

    await fetchBillHistory({ supabaseUrl: BASE_URL, accessToken: TOKEN, serverId: 'user-42' })

    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('server_id=eq.user-42')
  })

  it('throws on HTTP error', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'Unauthorized',
    } as unknown as Response)

    vi.stubGlobal('fetch', mockFetch)

    await expect(
      fetchBillHistory({ supabaseUrl: BASE_URL, accessToken: TOKEN }),
    ).rejects.toThrow('401')
  })

  it('uses from/to date range when provided', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as unknown as Response)

    vi.stubGlobal('fetch', mockFetch)

    await fetchBillHistory({
      supabaseUrl: BASE_URL,
      accessToken: TOKEN,
      from: '2026-04-01',
      to: '2026-04-13',
    })

    // API converts YYYY-MM-DD to local-timezone UTC ISO timestamps.
    // Exact values depend on the test runner's local timezone, so we only
    // verify the filter params are present and that the ISO timestamps include 2026.
    const url = decodeURIComponent(mockFetch.mock.calls[0][0] as string)
    expect(url).toContain('created_at=gte.')
    expect(url).toContain('created_at=lte.')
    expect(url).toContain('2026') // year appears in both timestamps
  })

  it('uses today as default date range when no filter provided', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as unknown as Response)

    vi.stubGlobal('fetch', mockFetch)

    await fetchBillHistory({ supabaseUrl: BASE_URL, accessToken: TOKEN })

    // Use the same local-date logic as the API to get the expected date string
    const today = new Date().toLocaleDateString('en-CA')
    const url = decodeURIComponent(mockFetch.mock.calls[0][0] as string)
    expect(url).toContain(today)
  })

  it('returns total_daily_cents summed across all orders', async () => {
    const mockFetch = vi.fn()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        makeOrder({ final_total_cents: 100000 }),
        makeOrder({ id: 'order-2', final_total_cents: 50000 }),
      ],
    } as unknown as Response)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as unknown as Response)

    vi.stubGlobal('fetch', mockFetch)

    const result = await fetchBillHistory({ supabaseUrl: BASE_URL, accessToken: TOKEN, date: '2026-04-13' })

    expect(result.total_daily_cents).toBe(150000)
  })

  it('sets truncated=true when result count equals limit', async () => {
    const limit = 3
    const orders = Array.from({ length: limit }, (_, i) =>
      makeOrder({ id: `order-${i}` }),
    )
    const mockFetch = vi.fn()
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => orders } as unknown as Response)
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] } as unknown as Response)

    vi.stubGlobal('fetch', mockFetch)

    const result = await fetchBillHistory({ supabaseUrl: BASE_URL, accessToken: TOKEN, limit })

    expect(result.truncated).toBe(true)
  })

  it('sets truncated=false when result count is below limit', async () => {
    const mockFetch = vi.fn()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [makeOrder()],
    } as unknown as Response)
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] } as unknown as Response)

    vi.stubGlobal('fetch', mockFetch)

    const result = await fetchBillHistory({ supabaseUrl: BASE_URL, accessToken: TOKEN, limit: 100 })

    expect(result.truncated).toBe(false)
  })

  it('uses local timezone when constructing date boundaries', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as unknown as Response)

    vi.stubGlobal('fetch', mockFetch)

    await fetchBillHistory({ supabaseUrl: BASE_URL, accessToken: TOKEN, date: '2026-04-13' })

    // The API uses new Date('2026-04-13T00:00:00').toISOString() which respects local TZ.
    // Verify it does NOT blindly append Z (UTC):
    const rawUrl = mockFetch.mock.calls[0][0] as string
    expect(rawUrl).not.toContain('2026-04-13T00%3A00%3A00.000Z') // hardcoded UTC midnight NOT expected
  })
})

describe('fetchOrderForReprint', () => {
  beforeEach(() => { vi.resetAllMocks() })
  afterEach(() => { vi.restoreAllMocks() })

  it('fetches order, items, and payments in parallel', async () => {
    const mockFetch = vi.fn()
    // order
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          bill_number: 'RN0001',
          order_number: 1,
          created_at: '2026-04-13T08:00:00.000Z',
          final_total_cents: 80000,
          discount_amount_cents: 0,
          order_comp: false,
          order_type: 'dine_in',
          customer_name: null,
          customer_mobile: null,
          delivery_note: null,
          delivery_charge: 0,
          service_charge_cents: 0,
          tables: { label: 'T3' },
          delivery_zones: null,
        },
      ],
    } as unknown as Response)
    // items
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          id: 'item-1',
          quantity: 2,
          unit_price_cents: 35000,
          modifier_ids: [],
          sent_to_kitchen: true,
          comp: false,
          comp_reason: null,
          seat: null,
          course: 'main',
          course_status: 'served',
          item_discount_type: null,
          item_discount_value: null,
          notes: null,
          menu_items: { name: 'Karahi', menu_id: null },
        },
      ],
    } as unknown as Response)
    // payments
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ method: 'cash', amount_cents: 80000, tendered_amount_cents: 100000 }],
    } as unknown as Response)

    vi.stubGlobal('fetch', mockFetch)

    const result = await fetchOrderForReprint(BASE_URL, TOKEN, 'order-1')

    expect(result.tableLabel).toBe('T3')
    expect(result.billNumber).toBe('RN0001')
    expect(result.items).toHaveLength(1)
    expect(result.items[0].name).toBe('Karahi')
    expect(result.payments[0].method).toBe('cash')
    expect(result.payments[0].tendered_amount_cents).toBe(100000)
  })

  it('throws when order is not found', async () => {
    const mockFetch = vi.fn()
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] } as unknown as Response)
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] } as unknown as Response)
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] } as unknown as Response)

    vi.stubGlobal('fetch', mockFetch)

    await expect(fetchOrderForReprint(BASE_URL, TOKEN, 'bad-id')).rejects.toThrow('Order not found')
  })

  it('throws when items fetch fails', async () => {
    const mockFetch = vi.fn()
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [{ bill_number: 'B1', order_number: 1, created_at: '2026-04-13T08:00:00Z', final_total_cents: 10000, discount_amount_cents: 0, order_comp: false, order_type: 'dine_in', customer_name: null, customer_mobile: null, delivery_note: null, delivery_charge: 0, service_charge_cents: 0, tables: { label: 'T1' }, delivery_zones: null }] } as unknown as Response)
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Server Error' } as unknown as Response)
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] } as unknown as Response)

    vi.stubGlobal('fetch', mockFetch)

    await expect(fetchOrderForReprint(BASE_URL, TOKEN, 'order-1')).rejects.toThrow('500')
  })

  it('uses correct tableLabel fallback for delivery orders', async () => {
    const mockFetch = vi.fn()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{
        bill_number: null, order_number: 1, created_at: '2026-04-13T08:00:00Z',
        final_total_cents: 5000, discount_amount_cents: 0, order_comp: false,
        order_type: 'delivery', customer_name: 'Ali', customer_mobile: null,
        delivery_note: '123 Street', delivery_charge: 500, service_charge_cents: 0,
        tables: null, delivery_zones: null,
      }],
    } as unknown as Response)
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] } as unknown as Response)
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] } as unknown as Response)

    vi.stubGlobal('fetch', mockFetch)

    const result = await fetchOrderForReprint(BASE_URL, TOKEN, 'order-1')
    expect(result.tableLabel).toBe('Delivery')
    expect(result.orderType).toBe('delivery')
  })
})

describe('fetchRestaurantConfig', () => {
  beforeEach(() => { vi.resetAllMocks() })
  afterEach(() => { vi.restoreAllMocks() })

  it('returns defaults when config rows are empty', async () => {
    const mockFetch = vi.fn()
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] } as unknown as Response) // config
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] } as unknown as Response) // vat
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] } as unknown as Response) // restaurants

    vi.stubGlobal('fetch', mockFetch)

    const cfg = await fetchRestaurantConfig(BASE_URL, TOKEN)

    expect(cfg.restaurantName).toBe('Lahore by iKitchen')
    expect(cfg.vatPercent).toBe(0)
    expect(cfg.roundBillTotals).toBe(false)
    expect(cfg.currencySymbol).toBe('৳')
  })

  it('reads VAT rate and restaurant name from responses', async () => {
    const mockFetch = vi.fn()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { key: 'bin_number', value: 'BIN123' },
        { key: 'round_bill_totals', value: 'true' },
      ],
    } as unknown as Response)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ rate: 15, tax_inclusive: false }],
    } as unknown as Response)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ name: 'Test Restaurant' }],
    } as unknown as Response)

    vi.stubGlobal('fetch', mockFetch)

    const cfg = await fetchRestaurantConfig(BASE_URL, TOKEN)

    expect(cfg.vatPercent).toBe(15)
    expect(cfg.binNumber).toBe('BIN123')
    expect(cfg.roundBillTotals).toBe(true)
    expect(cfg.restaurantName).toBe('Test Restaurant')
  })

  it('gracefully falls back when all fetch calls fail', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 503 } as unknown as Response)
    vi.stubGlobal('fetch', mockFetch)

    // Should not throw — all errors are silently swallowed
    const cfg = await fetchRestaurantConfig(BASE_URL, TOKEN)
    expect(cfg.vatPercent).toBe(0)
    expect(cfg.restaurantName).toBe('Lahore by iKitchen')
    expect(cfg.roundBillTotals).toBe(false)
  })
})
