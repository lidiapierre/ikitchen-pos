import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchShiftRevenue, formatDollars } from './shiftRevenueApi'

const OPENED_AT = '2026-01-01T08:00:00.000Z'
const CLOSED_AT = '2026-01-01T16:00:00.000Z'

describe('fetchShiftRevenue', () => {
  beforeEach((): void => {
    vi.stubGlobal('fetch', vi.fn())
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'test-key')
  })

  it('returns correct order count and totals for a shift with mixed cash and card payments', async (): Promise<void> => {
    const mockRows = [
      { order_id: 'order-1', method: 'cash', amount_cents: 1000 },
      { order_id: 'order-2', method: 'cash', amount_cents: 500 },
      { order_id: 'order-3', method: 'card', amount_cents: 2500 },
    ]
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: (): Promise<typeof mockRows> => Promise.resolve(mockRows),
    } as Response)

    const result = await fetchShiftRevenue(OPENED_AT, CLOSED_AT)

    expect(result.orderCount).toBe(3)
    expect(result.totalCents).toBe(4000)
    expect(result.cashCents).toBe(1500)
    expect(result.cardCents).toBe(2500)
  })

  it('counts each unique order_id once even when an order has multiple payment rows', async (): Promise<void> => {
    const mockRows = [
      { order_id: 'order-1', method: 'cash', amount_cents: 1000 },
      { order_id: 'order-1', method: 'card', amount_cents: 500 },
    ]
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: (): Promise<typeof mockRows> => Promise.resolve(mockRows),
    } as Response)

    const result = await fetchShiftRevenue(OPENED_AT, CLOSED_AT)

    expect(result.orderCount).toBe(1)
    expect(result.totalCents).toBe(1500)
  })

  it('returns zeros when no orders were completed during the shift', async (): Promise<void> => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: (): Promise<never[]> => Promise.resolve([]),
    } as Response)

    const result = await fetchShiftRevenue(OPENED_AT, CLOSED_AT)

    expect(result.orderCount).toBe(0)
    expect(result.totalCents).toBe(0)
    expect(result.cashCents).toBe(0)
    expect(result.cardCents).toBe(0)
  })

  it('throws when the server returns a non-ok response', async (): Promise<void> => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500 } as Response)

    await expect(fetchShiftRevenue(OPENED_AT, CLOSED_AT)).rejects.toThrow(
      'Failed to fetch shift revenue: 500',
    )
  })

  it('sends apikey and Authorization headers', async (): Promise<void> => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: (): Promise<never[]> => Promise.resolve([]),
    } as Response)

    await fetchShiftRevenue(OPENED_AT, CLOSED_AT)

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          apikey: 'test-key',
          Authorization: 'Bearer test-key',
        }),
      }),
    )
  })

  it('queries payments with status eq.paid and filters on payments.created_at', async (): Promise<void> => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: (): Promise<never[]> => Promise.resolve([]),
    } as Response)

    await fetchShiftRevenue(OPENED_AT, CLOSED_AT)

    const calledUrl = vi.mocked(fetch).mock.calls[0]?.[0] as string
    expect(calledUrl).toContain('orders.status=eq.paid')
    expect(calledUrl).toContain(`created_at=gte.${encodeURIComponent(OPENED_AT)}`)
    expect(calledUrl).toContain(`created_at=lte.${encodeURIComponent(CLOSED_AT)}`)
    expect(calledUrl).not.toContain('eq.closed')
    expect(calledUrl).not.toContain('orders.updated_at')
  })
})

describe('formatDollars', () => {
  it('formats cents as a taka string with two decimal places', (): void => {
    expect(formatDollars(1050, '৳')).toBe('৳ 10.50')
  })

  it('formats zero as ৳ 0.00', (): void => {
    expect(formatDollars(0, '৳')).toBe('৳ 0.00')
  })

  it('formats whole amounts', (): void => {
    expect(formatDollars(2500, '৳')).toBe('৳ 25.00')
  })

  it('pads single-digit cents correctly', (): void => {
    expect(formatDollars(101, '৳')).toBe('৳ 1.01')
  })
})
