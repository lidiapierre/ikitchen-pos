import { describe, it, expect, vi, afterEach } from 'vitest'
import { callRecordPayment } from './recordPaymentApi'

describe('callRecordPayment', () => {
  afterEach((): void => {
    vi.restoreAllMocks()
  })

  it('calls the record_payment edge function with correct payload', async (): Promise<void> => {
    const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { payment_id: 'pay-1', change_due: 0 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await callRecordPayment('https://example.supabase.co', 'test-key', 'order-123', 5450, 'cash')

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.supabase.co/functions/v1/record_payment',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ order_id: 'order-123', amount: 5450, method: 'cash' }),
      }),
    )
  })

  it('resolves with change_due on success', async (): Promise<void> => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { payment_id: 'pay-1', change_due: 250 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(
      callRecordPayment('https://example.supabase.co', 'test-key', 'order-123', 5450, 'card'),
    ).resolves.toEqual({ change_due: 250 })
  })

  it('throws on non-OK HTTP response', async (): Promise<void> => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: 'Not found' }), { status: 404 }),
    )

    await expect(
      callRecordPayment('https://example.supabase.co', 'test-key', 'order-123', 5450, 'cash'),
    ).rejects.toThrow('HTTP 404')
  })

  it('throws with API error message when success is false', async (): Promise<void> => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: 'Order is not closed' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(
      callRecordPayment('https://example.supabase.co', 'test-key', 'order-123', 5450, 'cash'),
    ).rejects.toThrow('Order is not closed')
  })
})
