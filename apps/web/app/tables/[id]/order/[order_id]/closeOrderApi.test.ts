import { describe, it, expect, vi, beforeEach } from 'vitest'
import { callCloseOrder } from './closeOrderApi'

describe('callCloseOrder', () => {
  beforeEach((): void => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('calls the close_order endpoint with the correct payload', async (): Promise<void> => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValue({
      ok: true,
      json: (): Promise<{ success: boolean; data: { final_total_cents: number; service_charge_cents: number; bill_number: string | null } }> =>
        Promise.resolve({ success: true, data: { final_total_cents: 5450, service_charge_cents: 0, bill_number: null } }),
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

  it('sends the Authorization header with Bearer token', async (): Promise<void> => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValue({
      ok: true,
      json: (): Promise<{ success: boolean }> => Promise.resolve({ success: true }),
    } as Response)

    await callCloseOrder('https://example.supabase.co', 'my-api-key', 'order-456')

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
        Promise.resolve({ success: false, error: 'Order has no items' }),
    } as Response)

    await expect(
      callCloseOrder('https://example.supabase.co', 'test-key', 'order-123'),
    ).rejects.toThrow('Order has no items')
  })

  it('throws a fallback message when success is false and no error field is present', async (): Promise<void> => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValue({
      ok: true,
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

  it('throws on a non-2xx HTTP response', async (): Promise<void> => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      json: (): Promise<{ success: boolean; error: string }> =>
        Promise.resolve({ success: false, error: 'Internal server error' }),
    } as Response)

    await expect(
      callCloseOrder('https://example.supabase.co', 'test-key', 'order-123'),
    ).rejects.toThrow('Internal server error')
  })

  it('returns billNumber from the response when bill_number is a string', async (): Promise<void> => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValue({
      ok: true,
      json: (): Promise<{ success: boolean; data: { final_total_cents: number; service_charge_cents: number; bill_number: string } }> =>
        Promise.resolve({ success: true, data: { final_total_cents: 5450, service_charge_cents: 0, bill_number: 'RN0001234' } }),
    } as Response)

    const result = await callCloseOrder('https://example.supabase.co', 'test-key', 'order-123')

    expect(result.billNumber).toBe('RN0001234')
  })

  it('returns billNumber: null when edge function returns bill_number: null', async (): Promise<void> => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValue({
      ok: true,
      json: (): Promise<{ success: boolean; data: { final_total_cents: number; service_charge_cents: number; bill_number: null } }> =>
        Promise.resolve({ success: true, data: { final_total_cents: 5450, service_charge_cents: 0, bill_number: null } }),
    } as Response)

    const result = await callCloseOrder('https://example.supabase.co', 'test-key', 'order-123')

    expect(result.billNumber).toBeNull()
  })

  it('returns billNumber: null when edge function response omits the data field', async (): Promise<void> => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValue({
      ok: true,
      json: (): Promise<{ success: boolean }> =>
        Promise.resolve({ success: true }),
    } as Response)

    const result = await callCloseOrder('https://example.supabase.co', 'test-key', 'order-123')

    expect(result.billNumber).toBeNull()
  })

  it('throws a user-friendly message on HTTP 409 (issue #318)', async (): Promise<void> => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 409,
      json: (): Promise<{ success: boolean; error: string }> =>
        Promise.resolve({ success: false, error: 'Order is not open' }),
    } as Response)

    await expect(
      callCloseOrder('https://example.supabase.co', 'test-key', 'order-123'),
    ).rejects.toThrow('Order is no longer open — it may have already been closed')
  })
})
