import { describe, it, expect, vi, afterEach } from 'vitest'
import { callAddItemToOrder } from './addItemApi'

const BASE_URL = 'https://example.supabase.co'
const API_KEY = 'test-api-key'
const AUTH_TOKEN = 'test-jwt-token'
const ORDER_ID = 'order-abc-123'
const MENU_ITEM_ID = '00000000-0000-0000-0000-000000000301'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('callAddItemToOrder', () => {
  it('resolves with order_item_id and order_total on success', async (): Promise<void> => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            success: true,
            data: { order_item_id: 'item-uuid-001', order_total: 850 },
          }),
      }),
    )

    const result = await callAddItemToOrder(BASE_URL, API_KEY, AUTH_TOKEN, ORDER_ID, MENU_ITEM_ID)
    expect(result.order_item_id).toBe('item-uuid-001')
    expect(result.order_total).toBe(850)
  })

  it('sends a POST request to the correct endpoint', async (): Promise<void> => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          success: true,
          data: { order_item_id: 'item-uuid-002', order_total: 0 },
        }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await callAddItemToOrder(BASE_URL, API_KEY, AUTH_TOKEN, ORDER_ID, MENU_ITEM_ID)

    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE_URL}/functions/v1/add_item_to_order`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          apikey: API_KEY,
          Authorization: `Bearer ${API_KEY}`,
        }),
      }),
    )
  })

  it('sends Authorization header with Bearer token', async (): Promise<void> => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          success: true,
          data: { order_item_id: 'item-uuid-003', order_total: 0 },
        }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await callAddItemToOrder(BASE_URL, API_KEY, AUTH_TOKEN, ORDER_ID, MENU_ITEM_ID)

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers['Authorization']).toBe(`Bearer ${AUTH_TOKEN}`)
  })

  it('sends order_id, menu_item_id, and quantity in the request body', async (): Promise<void> => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          success: true,
          data: { order_item_id: 'item-uuid-004', order_total: 0 },
        }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await callAddItemToOrder(BASE_URL, API_KEY, AUTH_TOKEN, ORDER_ID, MENU_ITEM_ID, 2)

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as { order_id: string; menu_item_id: string; quantity: number }
    expect(body.order_id).toBe(ORDER_ID)
    expect(body.menu_item_id).toBe(MENU_ITEM_ID)
    expect(body.quantity).toBe(2)
  })

  it('defaults quantity to 1 when not provided', async (): Promise<void> => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          success: true,
          data: { order_item_id: 'item-uuid-005', order_total: 0 },
        }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await callAddItemToOrder(BASE_URL, API_KEY, AUTH_TOKEN, ORDER_ID, MENU_ITEM_ID)

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as { quantity: number }
    expect(body.quantity).toBe(1)
  })

  it('throws when success is false and an error message is present', async (): Promise<void> => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            success: false,
            error: 'Order not found',
          }),
      }),
    )

    await expect(callAddItemToOrder(BASE_URL, API_KEY, AUTH_TOKEN, ORDER_ID, MENU_ITEM_ID)).rejects.toThrow(
      'Order not found',
    )
  })

  it('throws a fallback message when success is false and error is absent', async (): Promise<void> => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ success: false }),
      }),
    )

    await expect(callAddItemToOrder(BASE_URL, API_KEY, AUTH_TOKEN, ORDER_ID, MENU_ITEM_ID)).rejects.toThrow(
      'Failed to add item',
    )
  })

  it('throws when data is missing even if success is true', async (): Promise<void> => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ success: true }),
      }),
    )

    await expect(callAddItemToOrder(BASE_URL, API_KEY, AUTH_TOKEN, ORDER_ID, MENU_ITEM_ID)).rejects.toThrow(
      'Failed to add item',
    )
  })

  it('propagates network errors', async (): Promise<void> => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    await expect(callAddItemToOrder(BASE_URL, API_KEY, AUTH_TOKEN, ORDER_ID, MENU_ITEM_ID)).rejects.toThrow(
      'Network error',
    )
  })
})
