import { describe, it, expect, vi, beforeEach } from 'vitest'
import { callVoidItem } from './voidItemApi'

describe('callVoidItem', () => {
  beforeEach((): void => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('calls the void_item endpoint with the correct payload', async (): Promise<void> => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValue({
      ok: true,
      json: (): Promise<{ success: boolean; data: { success: boolean; order_total: number } }> =>
        Promise.resolve({ success: true, data: { success: true, order_total: 1850 } }),
    } as Response)

    await callVoidItem('https://example.supabase.co', 'test-key', 'item-456', 'wrong item ordered')

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.supabase.co/functions/v1/void_item',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ order_item_id: 'item-456', reason: 'wrong item ordered' }),
      }),
    )
  })

  it('sends the apikey and x-demo-staff-id headers', async (): Promise<void> => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValue({
      ok: true,
      json: (): Promise<{ success: boolean }> => Promise.resolve({ success: true }),
    } as Response)

    await callVoidItem('https://example.supabase.co', 'my-api-key', 'item-123', 'customer changed mind')

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
        Promise.resolve({ success: false, error: 'Item already voided' }),
    } as Response)

    await expect(
      callVoidItem('https://example.supabase.co', 'test-key', 'item-123', 'test'),
    ).rejects.toThrow('Item already voided')
  })

  it('throws a fallback message when success is false and no error field is present', async (): Promise<void> => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValue({
      ok: true,
      json: (): Promise<{ success: boolean }> => Promise.resolve({ success: false }),
    } as Response)

    await expect(
      callVoidItem('https://example.supabase.co', 'test-key', 'item-123', 'test'),
    ).rejects.toThrow('Failed to void item')
  })

  it('propagates a network error when fetch itself throws', async (): Promise<void> => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network request failed'))

    await expect(
      callVoidItem('https://example.supabase.co', 'test-key', 'item-123', 'test'),
    ).rejects.toThrow('Network request failed')
  })

  it('throws on a non-2xx HTTP response', async (): Promise<void> => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500 } as Response)

    await expect(
      callVoidItem('https://example.supabase.co', 'test-key', 'item-123', 'test'),
    ).rejects.toThrow('HTTP 500')
  })
})
