import { describe, it, expect, vi, beforeEach } from 'vitest'
import { updateOrderItemNotes } from './orderItemNotesApi'

const SUPABASE_URL = 'https://test.supabase.co'
const ACCESS_TOKEN = 'test-access-token'
const ORDER_ITEM_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

describe('updateOrderItemNotes', () => {
  beforeEach((): void => {
    vi.restoreAllMocks()
  })

  it('calls the update_order_item_notes edge function with correct params', async (): Promise<void> => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    )
    vi.stubGlobal('fetch', mockFetch)

    await updateOrderItemNotes(SUPABASE_URL, ACCESS_TOKEN, ORDER_ITEM_ID, 'no onions')

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${SUPABASE_URL}/functions/v1/update_order_item_notes`)
    expect(init.method).toBe('PATCH')
    expect(init.headers).toMatchObject({
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    })
    const body = JSON.parse(init.body as string) as { order_item_id: string; notes: string }
    expect(body.order_item_id).toBe(ORDER_ITEM_ID)
    expect(body.notes).toBe('no onions')
  })

  it('sends notes: null to clear a note', async (): Promise<void> => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    )
    vi.stubGlobal('fetch', mockFetch)

    await updateOrderItemNotes(SUPABASE_URL, ACCESS_TOKEN, ORDER_ITEM_ID, null)

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as { order_item_id: string; notes: null }
    expect(body.notes).toBeNull()
  })

  it('resolves without error on success', async (): Promise<void> => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      ),
    )

    await expect(
      updateOrderItemNotes(SUPABASE_URL, ACCESS_TOKEN, ORDER_ITEM_ID, 'extra spicy'),
    ).resolves.toBeUndefined()
  })

  it('throws on non-ok HTTP response', async (): Promise<void> => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: false }), { status: 500 }),
      ),
    )

    await expect(
      updateOrderItemNotes(SUPABASE_URL, ACCESS_TOKEN, ORDER_ITEM_ID, 'no onions'),
    ).rejects.toThrow('HTTP 500')
  })

  it('throws with edge-function error message on success:false', async (): Promise<void> => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: false, error: 'Order item not found or access denied' }), { status: 200 }),
      ),
    )

    await expect(
      updateOrderItemNotes(SUPABASE_URL, ACCESS_TOKEN, ORDER_ITEM_ID, 'no onions'),
    ).rejects.toThrow('Order item not found or access denied')
  })
})
