import { describe, it, expect, vi, beforeEach } from 'vitest'
import { markItemsSentToKitchen } from './kotApi'

describe('markItemsSentToKitchen', () => {
  beforeEach((): void => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('calls the correct Supabase REST endpoint with the right payload', async (): Promise<void> => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValue({
      ok: true,
      text: (): Promise<string> => Promise.resolve(''),
    } as Response)

    await markItemsSentToKitchen(
      'https://example.supabase.co',
      'test-key',
      ['item-1', 'item-2'],
    )

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.supabase.co/rest/v1/order_items?id=in.%28item-1%2Citem-2%29',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ sent_to_kitchen: true }),
        headers: expect.objectContaining({
          apikey: 'test-key',
          Authorization: 'Bearer test-key',
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        }),
      }),
    )
  })

  it('does nothing when itemIds is empty', async (): Promise<void> => {
    const mockFetch = vi.mocked(fetch)

    await markItemsSentToKitchen('https://example.supabase.co', 'test-key', [])

    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('throws when the response is not ok', async (): Promise<void> => {
    const mockFetch = vi.mocked(fetch)
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: (): Promise<string> => Promise.resolve('column not found'),
    } as Response)

    await expect(
      markItemsSentToKitchen('https://example.supabase.co', 'test-key', ['item-1']),
    ).rejects.toThrow('Failed to mark items as sent to kitchen: 400 Bad Request — column not found')
  })

  it('propagates a network error when fetch itself throws', async (): Promise<void> => {
    vi.mocked(fetch).mockRejectedValue(new Error('Network request failed'))

    await expect(
      markItemsSentToKitchen('https://example.supabase.co', 'test-key', ['item-1']),
    ).rejects.toThrow('Network request failed')
  })
})
