/**
 * Tests for shiftReportApi — issue #449 shift close report.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { callGetShiftReport } from './shiftReportApi'
import type { ShiftReportData } from './shiftReportApi'

const BASE_URL = 'https://test.supabase.co'
const TOKEN = 'test-token'

const FROM = '2026-04-24T00:00:00.000Z'
const TO = '2026-04-24T14:30:00.000Z'

function makeShiftReportData(overrides: Partial<ShiftReportData> = {}): ShiftReportData {
  return {
    from: FROM,
    to: TO,
    total_orders: 12,
    total_covers: 36,
    avg_order_value_cents: 85000,
    gross_sales_cents: 1100000,
    discounts_cents: 50000,
    complimentary_cents: 30000,
    net_sales_cents: 1020000,
    subtotal_excl_vat_cents: 886957,
    vat_amount_cents: 133043,
    total_incl_vat_cents: 1020000,
    cash_cents: 600000,
    card_cents: 420000,
    mobile_cents: 0,
    other_cents: 0,
    total_collected_cents: 1020000,
    ...overrides,
  }
}

describe('callGetShiftReport', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns ShiftReportData on success', async () => {
    const mockData = makeShiftReportData()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockData }),
    }))

    const result = await callGetShiftReport(BASE_URL, TOKEN, FROM, TO)

    expect(result).toEqual(mockData)
    expect(fetch).toHaveBeenCalledWith(
      `${BASE_URL}/functions/v1/get_shift_report`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Bearer ${TOKEN}`,
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ from: FROM, to: TO }),
      }),
    )
  })

  it('throws when the HTTP response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'Unauthorized',
    }))

    await expect(callGetShiftReport(BASE_URL, TOKEN, FROM, TO)).rejects.toThrow(
      /get_shift_report failed: 401/,
    )
  })

  it('throws when success is false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: false, error: 'No data for range' }),
    }))

    await expect(callGetShiftReport(BASE_URL, TOKEN, FROM, TO)).rejects.toThrow('No data for range')
  })

  it('throws a fallback error when success is false and no error message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: false }),
    }))

    await expect(callGetShiftReport(BASE_URL, TOKEN, FROM, TO)).rejects.toThrow(
      'Failed to fetch shift report',
    )
  })

  it('passes from/to correctly in the request body', async () => {
    const customFrom = '2026-04-20T18:00:00.000Z'
    const customTo = '2026-04-21T17:59:59.999Z'
    const mockData = makeShiftReportData({ from: customFrom, to: customTo })

    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mockData }),
    }))

    const result = await callGetShiftReport(BASE_URL, TOKEN, customFrom, customTo)
    expect(result.from).toBe(customFrom)
    expect(result.to).toBe(customTo)
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ from: customFrom, to: customTo }),
      }),
    )
  })
})
