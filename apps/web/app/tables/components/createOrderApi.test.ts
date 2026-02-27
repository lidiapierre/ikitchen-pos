import { describe, it, expect, vi, afterEach } from 'vitest'
import { callCreateOrder } from './createOrderApi'

const BASE_URL = 'https://example.supabase.co'
const API_KEY = 'test-api-key'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('callCreateOrder', () => {
  it('resolves with order_id on successful response', async (): Promise<void> => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            success: true,
            data: { order_id: 'abc-123', status: 'open' },
          }),
      }),
    )

    const result = await callCreateOrder(BASE_URL, API_KEY, 5)
    expect(result.order_id).toBe('abc-123')
  })

  it('sends a POST request to the correct endpoint', async (): Promise<void> => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          success: true,
          data: { order_id: 'xyz-456', status: 'open' },
        }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await callCreateOrder(BASE_URL, API_KEY, 3)

    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE_URL}/functions/v1/create_order`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          apikey: API_KEY,
        }),
      }),
    )
  })

  it('sends table_id in the request body', async (): Promise<void> => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: () =>
        Promise.resolve({
          success: true,
          data: { order_id: 'order-789', status: 'open' },
        }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await callCreateOrder(BASE_URL, API_KEY, 7)

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as { table_id: number }
    expect(body.table_id).toBe(7)
  })

  it('throws when success is false and an error message is present', async (): Promise<void> => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            success: false,
            error: 'Table not found',
          }),
      }),
    )

    await expect(callCreateOrder(BASE_URL, API_KEY, 99)).rejects.toThrow('Table not found')
  })

  it('throws a fallback message when success is false and error is absent', async (): Promise<void> => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ success: false }),
      }),
    )

    await expect(callCreateOrder(BASE_URL, API_KEY, 1)).rejects.toThrow('Failed to create order')
  })

  it('throws when data is missing even if success is true', async (): Promise<void> => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ success: true }),
      }),
    )

    await expect(callCreateOrder(BASE_URL, API_KEY, 1)).rejects.toThrow('Failed to create order')
  })

  it('propagates network errors', async (): Promise<void> => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    await expect(callCreateOrder(BASE_URL, API_KEY, 2)).rejects.toThrow('Network error')
  })
})
