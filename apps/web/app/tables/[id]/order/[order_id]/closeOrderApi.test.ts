import { describe, it, expect, vi, beforeEach } from 'vitest'
import { callCloseOrder } from './closeOrderApi'

describe('callCloseOrder', () => {
  beforeEach((): void => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('calls the close_order endpoint with the correct payload', async (): Promise<void> => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValue({
      json: (): Promise<{ success: boolean; data: { success: boolean; final_total: number } }> =>
        Promise.resolve({ success: true, data: { success: true, final_total: 5450 } }),
    } as Response)

    await callCloseOrder('https://example.supabase.co', 'test-key', 'order-123')

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.supabase.co/functions/v1/close_order',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ order_id: 'order-123' }),
      }),
    )
  })

  it('sends the apikey and Authorization headers', async (): Promise<void> => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValue({
      json: (): Promise<{ success: boolean }> => Promise.resolve({ success: true }),
    } as Response)

    await callCloseOrder('https://example.supabase.co', 'my-api-key', 'order-456')

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          apikey: 'my-api-key',
          Authorization: 'Bearer my-api-key',
        }),
      }),
    )
  })

  it('throws with the API error message when success is false', async (): Promise<void> => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValue({
      json: (): Promise<{ success: boolean; error: string }> =>
        Promise.resolve({ success: false, error: 'Order has no items' }),
    } as Response)

    await expect(
      callCloseOrder('https://example.supabase.co', 'test-key', 'order-123'),
    ).rejects.toThrow('Order has no items')
  })

  it('throws a fallback message when success is false and no error field is present', async (): Promise<void> => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValue({
      json: (): Promise<{ success: boolean }> => Promise.resolve({ success: false }),
    } as Response)

    await expect(
      callCloseOrder('https://example.supabase.co', 'test-key', 'order-123'),
    ).rejects.toThrow('Failed to close order')
  })

  it('propagates a network error when fetch itself throws', async (): Promise<void> => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network request failed'))

    await expect(
      callCloseOrder('https://example.supabase.co', 'test-key', 'order-123'),
    ).rejects.toThrow('Network request failed')
  })
})
