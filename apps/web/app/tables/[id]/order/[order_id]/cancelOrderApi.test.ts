import { describe, it, expect, vi, beforeEach } from 'vitest'
import { callCancelOrder } from './cancelOrderApi'

describe('callCancelOrder', () => {
  beforeEach((): void => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('calls the cancel_order endpoint with the correct payload', async (): Promise<void> => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValue({
      ok: true,
      json: (): Promise<{ success: boolean; data: { success: boolean } }> =>
        Promise.resolve({ success: true, data: { success: true } }),
    } as Response)

    await callCancelOrder('https://example.supabase.co', 'test-key', 'order-789', 'customer left')

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.supabase.co/functions/v1/cancel_order',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ order_id: 'order-789', reason: 'customer left' }),
      }),
    )
  })

  it('sends the apikey and x-demo-staff-id headers', async (): Promise<void> => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValue({
      ok: true,
      json: (): Promise<{ success: boolean }> => Promise.resolve({ success: true }),
    } as Response)

    await callCancelOrder('https://example.supabase.co', 'my-api-key', 'order-456', 'test reason')

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer my-api-key',
          apikey: 'my-api-key',
          'x-demo-staff-id': '00000000-0000-0000-0000-000000000010',
        }),
      }),
    )
  })

  it('throws with the API error message when success is false', async (): Promise<void> => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValue({
      ok: true,
      json: (): Promise<{ success: boolean; error: string }> =>
        Promise.resolve({ success: false, error: 'Order already cancelled' }),
    } as Response)

    await expect(
      callCancelOrder('https://example.supabase.co', 'test-key', 'order-123', 'test'),
    ).rejects.toThrow('Order already cancelled')
  })

  it('throws a fallback message when success is false and no error field is present', async (): Promise<void> => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValue({
      ok: true,
      json: (): Promise<{ success: boolean }> => Promise.resolve({ success: false }),
    } as Response)

    await expect(
      callCancelOrder('https://example.supabase.co', 'test-key', 'order-123', 'test'),
    ).rejects.toThrow('Failed to cancel order')
  })

  it('propagates a network error when fetch itself throws', async (): Promise<void> => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network request failed'))

    await expect(
      callCancelOrder('https://example.supabase.co', 'test-key', 'order-123', 'test'),
    ).rejects.toThrow('Network request failed')
  })

  it('throws on a non-2xx HTTP response', async (): Promise<void> => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 403 } as Response)

    await expect(
      callCancelOrder('https://example.supabase.co', 'test-key', 'order-123', 'test'),
    ).rejects.toThrow('HTTP 403')
  })
})
