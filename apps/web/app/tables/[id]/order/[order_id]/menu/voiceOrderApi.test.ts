import { describe, it, expect, vi, afterEach } from 'vitest'
import { callVoiceOrder } from './voiceOrderApi'

const BASE_URL = 'https://example.supabase.co'
const ACCESS_TOKEN = 'test-access-token'
const ORDER_ID = 'order-abc-123'

const MOCK_RESULT = {
  transcript: 'two chicken biryani one lassi',
  items: [
    { menu_item_id: 'item-uuid-001', name: 'Chicken Biryani', quantity: 2 },
    { menu_item_id: 'item-uuid-002', name: 'Lassi', quantity: 1 },
  ],
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('callVoiceOrder', () => {
  it('resolves with transcript and items on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ success: true, data: MOCK_RESULT }),
      }),
    )

    const audioBlob = new Blob(['fake-audio'], { type: 'audio/webm' })
    const result = await callVoiceOrder(BASE_URL, ACCESS_TOKEN, ORDER_ID, audioBlob)
    expect(result.transcript).toBe('two chicken biryani one lassi')
    expect(result.items).toHaveLength(2)
    expect(result.items[0]).toMatchObject({ menu_item_id: 'item-uuid-001', quantity: 2 })
  })

  it('sends POST request to the correct endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: true, data: MOCK_RESULT }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const audioBlob = new Blob(['fake-audio'], { type: 'audio/webm' })
    await callVoiceOrder(BASE_URL, ACCESS_TOKEN, ORDER_ID, audioBlob)

    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE_URL}/functions/v1/voice_order`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Bearer ${ACCESS_TOKEN}`,
        }),
      }),
    )
  })

  it('sends audio and order_id in FormData', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: true, data: MOCK_RESULT }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const audioBlob = new Blob(['fake-audio'], { type: 'audio/webm' })
    await callVoiceOrder(BASE_URL, ACCESS_TOKEN, ORDER_ID, audioBlob)

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(init.body).toBeInstanceOf(FormData)
    const body = init.body as FormData
    expect(body.get('order_id')).toBe(ORDER_ID)
    expect(body.get('audio')).toBeTruthy()
  })

  it('throws when success is false with error message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ success: false, error: 'No items matched' }),
      }),
    )

    const audioBlob = new Blob(['fake-audio'], { type: 'audio/webm' })
    await expect(callVoiceOrder(BASE_URL, ACCESS_TOKEN, ORDER_ID, audioBlob)).rejects.toThrow('No items matched')
  })

  it('throws fallback message when success is false and no error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ success: false }),
      }),
    )

    const audioBlob = new Blob(['fake-audio'], { type: 'audio/webm' })
    await expect(callVoiceOrder(BASE_URL, ACCESS_TOKEN, ORDER_ID, audioBlob)).rejects.toThrow('Voice order failed')
  })

  it('throws when data is missing even if success is true', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ success: true }),
      }),
    )

    const audioBlob = new Blob(['fake-audio'], { type: 'audio/webm' })
    await expect(callVoiceOrder(BASE_URL, ACCESS_TOKEN, ORDER_ID, audioBlob)).rejects.toThrow('Voice order failed')
  })

  it('propagates network errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    const audioBlob = new Blob(['fake-audio'], { type: 'audio/webm' })
    await expect(callVoiceOrder(BASE_URL, ACCESS_TOKEN, ORDER_ID, audioBlob)).rejects.toThrow('Network error')
  })
})
