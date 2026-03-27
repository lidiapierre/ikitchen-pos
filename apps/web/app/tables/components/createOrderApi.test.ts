import { describe, it, expect, vi, afterEach } from 'vitest'
import { callCreateOrder } from './createOrderApi'

const BASE_URL = 'https://example.supabase.co'
const API_KEY = 'test-api-key'
const TABLE_ID = 'table-uuid-005'

afterEach(() => {
  vi.restoreAllMocks()
})

function makeMockFetch(orderId = 'abc-123') {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({
        success: true,
        data: { order_id: orderId, status: 'open' },
      }),
  })
}

describe('callCreateOrder', () => {
  it('resolves with order_id on successful response', async (): Promise<void> => {
    vi.stubGlobal('fetch', makeMockFetch())

    const result = await callCreateOrder(BASE_URL, API_KEY, TABLE_ID)
    expect(result.order_id).toBe('abc-123')
  })

  it('sends a POST request to the correct endpoint', async (): Promise<void> => {
    const mockFetch = makeMockFetch('xyz-456')
    vi.stubGlobal('fetch', mockFetch)

    await callCreateOrder(BASE_URL, API_KEY, 'table-uuid-003')

    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE_URL}/functions/v1/create_order`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: `Bearer ${API_KEY}`,
        }),
      }),
    )
  })

  it('sends table_id in the request body for dine_in (legacy string signature)', async (): Promise<void> => {
    const mockFetch = makeMockFetch('order-789')
    vi.stubGlobal('fetch', mockFetch)

    await callCreateOrder(BASE_URL, API_KEY, 'table-uuid-007')

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as { table_id: string; order_type: string }
    expect(body.table_id).toBe('table-uuid-007')
    expect(body.order_type).toBe('dine_in')
  })

  it('sends order_type dine_in by default', async (): Promise<void> => {
    const mockFetch = makeMockFetch()
    vi.stubGlobal('fetch', mockFetch)

    await callCreateOrder(BASE_URL, API_KEY, { tableId: TABLE_ID, orderType: 'dine_in' })

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as { order_type: string }
    expect(body.order_type).toBe('dine_in')
  })

  it('sends takeaway order without table_id', async (): Promise<void> => {
    const mockFetch = makeMockFetch('takeaway-001')
    vi.stubGlobal('fetch', mockFetch)

    const result = await callCreateOrder(BASE_URL, API_KEY, { orderType: 'takeaway' })
    expect(result.order_id).toBe('takeaway-001')

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as { order_type: string; table_id?: string }
    expect(body.order_type).toBe('takeaway')
    expect(body.table_id).toBeUndefined()
  })

  it('sends delivery order with customer_name and delivery_note', async (): Promise<void> => {
    const mockFetch = makeMockFetch('delivery-001')
    vi.stubGlobal('fetch', mockFetch)

    await callCreateOrder(BASE_URL, API_KEY, {
      orderType: 'delivery',
      customerName: 'Ahmed Khan',
      deliveryNote: 'Ring the bell',
    })

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as {
      order_type: string
      customer_name: string
      delivery_note: string
    }
    expect(body.order_type).toBe('delivery')
    expect(body.customer_name).toBe('Ahmed Khan')
    expect(body.delivery_note).toBe('Ring the bell')
  })

  it('throws with HTTP status when response is not ok', async (): Promise<void> => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        text: () => Promise.resolve('upstream connect error'),
      }),
    )

    await expect(callCreateOrder(BASE_URL, API_KEY, TABLE_ID)).rejects.toThrow(
      'create_order failed: 502 Bad Gateway — upstream connect error',
    )
  })

  it('throws when success is false and an error message is present', async (): Promise<void> => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: false,
            error: 'Table not found',
          }),
      }),
    )

    await expect(callCreateOrder(BASE_URL, API_KEY, 'table-uuid-099')).rejects.toThrow('Table not found')
  })

  it('throws a fallback message when success is false and error is absent', async (): Promise<void> => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: false }),
      }),
    )

    await expect(callCreateOrder(BASE_URL, API_KEY, 'table-uuid-001')).rejects.toThrow('Failed to create order')
  })

  it('throws when data is missing even if success is true', async (): Promise<void> => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      }),
    )

    await expect(callCreateOrder(BASE_URL, API_KEY, 'table-uuid-001')).rejects.toThrow('Failed to create order')
  })

  it('propagates network errors', async (): Promise<void> => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    await expect(callCreateOrder(BASE_URL, API_KEY, 'table-uuid-002')).rejects.toThrow('Network error')
  })
})
