import { describe, it, expect, vi, beforeEach } from 'vitest'
import { callReopenOrderForItems } from './reopenOrderForItemsApi'

describe('callReopenOrderForItems', () => {
  beforeEach((): void => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('calls the reopen_order_for_items endpoint with the correct payload', async (): Promise<void> => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValue({
      ok: true,
      json: (): Promise<{ success: boolean; data: { status: string } }> =>
        Promise.resolve({ success: true, data: { status: 'open' } }),
    } as Response)

    await callReopenOrderForItems('https://example.supabase.co', 'test-key', 'order-123')

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.supabase.co/functions/v1/reopen_order_for_items',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ order_id: 'order-123' }),
      }),
    )
  })

  it('sends the Authorization header with Bearer token', async (): Promise<void> => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValue({
      ok: true,
      json: (): Promise<{ success: boolean }> => Promise.resolve({ success: true }),
    } as Response)

    await callReopenOrderForItems('https://example.supabase.co', 'my-api-key', 'order-456')

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer my-api-key',
          'Content-Type': 'application/json',
        }),
      }),
    )
  })

  it('throws with the API error message when success is false', async (): Promise<void> => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValue({
      ok: true,
      json: (): Promise<{ success: boolean; error: string }> =>
        Promise.resolve({ success: false, error: 'Order cannot be reopened: status is \'open\'' }),
    } as Response)

    await expect(
      callReopenOrderForItems('https://example.supabase.co', 'test-key', 'order-123'),
    ).rejects.toThrow('Order cannot be reopened')
  })

  it('throws a fallback message when success is false and no error field is present', async (): Promise<void> => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValue({
      ok: true,
      json: (): Promise<{ success: boolean }> => Promise.resolve({ success: false }),
    } as Response)

    await expect(
      callReopenOrderForItems('https://example.supabase.co', 'test-key', 'order-123'),
    ).rejects.toThrow('Failed to reopen order for items')
  })

  it('propagates a network error when fetch itself throws', async (): Promise<void> => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network request failed'))

    await expect(
      callReopenOrderForItems('https://example.supabase.co', 'test-key', 'order-123'),
    ).rejects.toThrow('Network request failed')
  })

  it('throws on a non-2xx HTTP response with error in body', async (): Promise<void> => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 403,
      json: (): Promise<{ success: boolean; error: string }> =>
        Promise.resolve({ success: false, error: 'Insufficient permissions' }),
    } as Response)

    await expect(
      callReopenOrderForItems('https://example.supabase.co', 'test-key', 'order-123'),
    ).rejects.toThrow('Insufficient permissions')
  })

  it('throws HTTP status fallback message on non-2xx with non-JSON body', async (): Promise<void> => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      json: (): Promise<never> => Promise.reject(new Error('not json')),
    } as Response)

    await expect(
      callReopenOrderForItems('https://example.supabase.co', 'test-key', 'order-123'),
    ).rejects.toThrow('HTTP 500')
  })

  it('throws HTTP 409 error message for wrong-status orders', async (): Promise<void> => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 409,
      json: (): Promise<{ success: boolean; error: string }> =>
        Promise.resolve({ success: false, error: 'Order cannot be reopened: status is \'paid\'' }),
    } as Response)

    await expect(
      callReopenOrderForItems('https://example.supabase.co', 'test-key', 'order-123'),
    ).rejects.toThrow('Order cannot be reopened')
  })
})
