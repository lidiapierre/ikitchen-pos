import { describe, it, expect, vi, beforeEach } from 'vitest'
import { markItemsSentToKitchen } from './kotApi'

describe('markItemsSentToKitchen', () => {
  beforeEach((): void => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('calls the edge function endpoint with the right payload', async (): Promise<void> => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValue({
      ok: true,
      text: (): Promise<string> => Promise.resolve(''),
    } as Response)

    await markItemsSentToKitchen(
      'https://example.supabase.co',
      'test-key',
      'order-123',
      ['item-1', 'item-2'],
    )

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.supabase.co/functions/v1/mark-items-sent-to-kitchen',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ order_id: 'order-123', item_ids: ['item-1', 'item-2'] }),
        headers: expect.objectContaining({
          apikey: 'test-key',
          Authorization: 'Bearer test-key',
          'Content-Type': 'application/json',
        }),
      }),
    )
  })

  it('does nothing when itemIds is empty', async (): Promise<void> => {
    const mockFetch = vi.mocked(fetch)

    await markItemsSentToKitchen('https://example.supabase.co', 'test-key', 'order-123', [])

    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('throws when the response is not ok', async (): Promise<void> => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: (): Promise<string> => Promise.resolve('column not found'),
    } as Response)

    await expect(
      markItemsSentToKitchen('https://example.supabase.co', 'test-key', 'order-123', ['item-1']),
    ).rejects.toThrow('Failed to mark items as sent: 400 — column not found')
  })

  it('propagates a network error when fetch itself throws', async (): Promise<void> => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network request failed'))

    await expect(
      markItemsSentToKitchen('https://example.supabase.co', 'test-key', 'order-123', ['item-1']),
    ).rejects.toThrow('Network request failed')
  })
})
