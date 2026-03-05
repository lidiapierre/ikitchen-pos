import { describe, it, expect, vi, beforeEach } from 'vitest'
import { callRecordPayment } from './recordPaymentApi'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('callRecordPayment', () => {
  beforeEach((): void => {
    vi.clearAllMocks()
  })

  it('calls the correct endpoint with the correct payload', async (): Promise<void> => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { payment_id: 'p-123', change_due: 0 } }),
    })

    await callRecordPayment('https://example.supabase.co', 'test-key', 'order-abc', 5450, 'cash')

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.supabase.co/functions/v1/record_payment',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ order_id: 'order-abc', amount: 5450, method: 'cash' }),
      }),
    )
  })

  it('includes the apikey and x-demo-staff-id headers', async (): Promise<void> => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { payment_id: 'p-123', change_due: 0 } }),
    })

    await callRecordPayment('https://example.supabase.co', 'test-key', 'order-abc', 5450, 'card')

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    const headers = options.headers as Record<string, string>
    expect(headers['apikey']).toBe('test-key')
    expect(headers['x-demo-staff-id']).toBe('00000000-0000-0000-0000-000000000010')
  })

  it('resolves without error on success', async (): Promise<void> => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { payment_id: 'p-456', change_due: 0 } }),
    })

    await expect(
      callRecordPayment('https://example.supabase.co', 'test-key', 'order-abc', 1000, 'card'),
    ).resolves.toBeUndefined()
  })

  it('throws on non-ok HTTP response', async (): Promise<void> => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 })

    await expect(
      callRecordPayment('https://example.supabase.co', 'test-key', 'order-abc', 1000, 'cash'),
    ).rejects.toThrow('HTTP 500')
  })

  it('throws the API error message when success is false', async (): Promise<void> => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: false, error: 'Order not closed' }),
    })

    await expect(
      callRecordPayment('https://example.supabase.co', 'test-key', 'order-abc', 1000, 'cash'),
    ).rejects.toThrow('Order not closed')
  })

  it('throws a fallback error when success is false and no error message', async (): Promise<void> => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: false }),
    })

    await expect(
      callRecordPayment('https://example.supabase.co', 'test-key', 'order-abc', 1000, 'cash'),
    ).rejects.toThrow('Failed to record payment')
  })
})
