import { describe, it, expect, vi, afterEach } from 'vitest'
import { callRecordPayment, callRecordSplitPayment } from './recordPaymentApi'

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

    await callRecordPayment('https://example.supabase.co', 'test-key', 'order-123', 5450, 'cash', 5450)

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.supabase.co/functions/v1/record_payment',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ order_id: 'order-123', amount: 5450, method: 'cash', order_total_cents: 5450 }),
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
      callRecordPayment('https://example.supabase.co', 'test-key', 'order-123', 5450, 'card', 5450),
    ).resolves.toEqual({ change_due: 250 })
  })

  it('throws on non-OK HTTP response', async (): Promise<void> => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: 'Not found' }), { status: 404 }),
    )

    await expect(
      callRecordPayment('https://example.supabase.co', 'test-key', 'order-123', 5450, 'cash', 5450),
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
      callRecordPayment('https://example.supabase.co', 'test-key', 'order-123', 5450, 'cash', 5450),
    ).rejects.toThrow('Order is not closed')
  })

  it('throws when accessToken is empty', async (): Promise<void> => {
    await expect(
      callRecordPayment('https://example.supabase.co', '', 'order-123', 5450, 'cash', 5450),
    ).rejects.toThrow('Not authenticated')
  })
})

describe('callRecordSplitPayment', () => {
  afterEach((): void => {
    vi.restoreAllMocks()
  })

  it('calls record_payment with correct payments array payload', async (): Promise<void> => {
    const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { payment_id: 'pay-split-1', change_due: 0 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await callRecordSplitPayment('https://example.supabase.co', 'test-key', 'order-123', [
      { method: 'cash', amountCents: 50000 },
      { method: 'card', amountCents: 80000 },
    ])

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.supabase.co/functions/v1/record_payment',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          order_id: 'order-123',
          payments: [
            { method: 'cash', amount: 50000 },
            { method: 'card', amount: 80000 },
          ],
        }),
      }),
    )
  })

  it('resolves with change_due on successful split payment', async (): Promise<void> => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { payment_id: 'pay-split-2', change_due: 500 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const result = await callRecordSplitPayment('https://example.supabase.co', 'test-key', 'order-123', [
      { method: 'cash', amountCents: 60000 },
      { method: 'card', amountCents: 80000 },
    ])

    expect(result).toEqual({ change_due: 500 })
  })

  it('throws on non-OK HTTP response', async (): Promise<void> => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'Server error' }), { status: 500 }),
    )

    await expect(
      callRecordSplitPayment('https://example.supabase.co', 'test-key', 'order-123', [
        { method: 'cash', amountCents: 50000 },
      ]),
    ).rejects.toThrow('HTTP 500')
  })

  it('throws with API error message when success is false', async (): Promise<void> => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: 'Total tendered does not cover the order total' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(
      callRecordSplitPayment('https://example.supabase.co', 'test-key', 'order-123', [
        { method: 'card', amountCents: 500 },
      ]),
    ).rejects.toThrow('Total tendered does not cover the order total')
  })

  it('throws when accessToken is empty', async (): Promise<void> => {
    await expect(
      callRecordSplitPayment('https://example.supabase.co', '', 'order-123', [
        { method: 'cash', amountCents: 50000 },
      ]),
    ).rejects.toThrow('Not authenticated')
  })

  it('throws on network error', async (): Promise<void> => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network failure'))

    await expect(
      callRecordSplitPayment('https://example.supabase.co', 'test-key', 'order-123', [
        { method: 'mobile', amountCents: 50000 },
      ]),
    ).rejects.toThrow('Network failure')
  })
})
