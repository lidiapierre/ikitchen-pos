import { describe, it, expect, vi, afterEach } from 'vitest'
import { callCreateOrder } from './createOrderApi'

const BASE_URL = 'https://example.supabase.co'
const API_KEY = 'test-api-key'
const TABLE_ID = 'table-uuid-005'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('callCreateOrder', () => {
  it('resolves with order_id on successful response', async (): Promise<void> => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            data: { order_id: 'abc-123', status: 'open' },
          }),
      }),
    )

    const result = await callCreateOrder(BASE_URL, API_KEY, TABLE_ID)
    expect(result.order_id).toBe('abc-123')
  })

  it('sends a POST request to the correct endpoint', async (): Promise<void> => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: { order_id: 'xyz-456', status: 'open' },
        }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await callCreateOrder(BASE_URL, API_KEY, 'table-uuid-003')

    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE_URL}/functions/v1/create_order`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: `Bearer ${API_KEY}`,
          apikey: API_KEY,
        }),
      }),
    )
  })

  it('sends table_id in the request body', async (): Promise<void> => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: { order_id: 'order-789', status: 'open' },
        }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await callCreateOrder(BASE_URL, API_KEY, 'table-uuid-007')

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as { table_id: string }
    expect(body.table_id).toBe('table-uuid-007')
  })

  it('sends staff_id placeholder in the request body', async (): Promise<void> => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          success: true,
          data: { order_id: 'order-789', status: 'open' },
        }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await callCreateOrder(BASE_URL, API_KEY, 'table-uuid-007')

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as { staff_id: string }
    expect(body.staff_id).toBe('placeholder-staff')
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
