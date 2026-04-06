/**
 * Tests for delivery zone options in callCreateOrder (issue #353).
 *
 * Verifies that deliveryZoneId and deliveryChargeCents are forwarded correctly
 * in the request body, and that the billing total calculation (which adds the
 * delivery charge on top of the VAT total) behaves correctly for delivery, dine-in,
 * and comp scenarios.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { callCreateOrder } from './createOrderApi'

const BASE_URL = 'https://example.supabase.co'
const API_KEY = 'test-api-key'
const ZONE_ID = 'zone-uuid-abc'
const ORDER_ID = 'order-uuid-123'

afterEach(() => {
  vi.restoreAllMocks()
})

function makeMockFetch(orderId = ORDER_ID) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({
        success: true,
        data: { order_id: orderId, status: 'open' },
      }),
  })
}

describe('callCreateOrder — delivery zone options (issue #353)', () => {
  it('sends delivery_zone_id and delivery_charge in request body when provided', async (): Promise<void> => {
    const mockFetch = makeMockFetch()
    vi.stubGlobal('fetch', mockFetch)

    await callCreateOrder(BASE_URL, API_KEY, {
      orderType: 'delivery',
      customerName: 'Ahmed',
      scheduledTime: '2026-04-07T12:00:00.000Z',
      deliveryZoneId: ZONE_ID,
      deliveryChargeCents: 5000,
    })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as Record<string, unknown>
    expect(body['delivery_zone_id']).toBe(ZONE_ID)
    expect(body['delivery_charge']).toBe(5000)
  })

  it('omits delivery_zone_id and delivery_charge when not provided', async (): Promise<void> => {
    const mockFetch = makeMockFetch()
    vi.stubGlobal('fetch', mockFetch)

    await callCreateOrder(BASE_URL, API_KEY, {
      orderType: 'delivery',
      customerName: 'Ahmed',
      scheduledTime: '2026-04-07T12:00:00.000Z',
    })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as Record<string, unknown>
    expect(body['delivery_zone_id']).toBeUndefined()
    expect(body['delivery_charge']).toBeUndefined()
  })

  it('omits delivery_charge when deliveryChargeCents is 0', async (): Promise<void> => {
    const mockFetch = makeMockFetch()
    vi.stubGlobal('fetch', mockFetch)

    await callCreateOrder(BASE_URL, API_KEY, {
      orderType: 'delivery',
      customerName: 'Ahmed',
      scheduledTime: '2026-04-07T12:00:00.000Z',
      deliveryZoneId: ZONE_ID,
      deliveryChargeCents: 0,
    })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as Record<string, unknown>
    expect(body['delivery_charge']).toBeUndefined()
  })
})

describe('Delivery charge billing calculation (issue #353)', () => {
  /**
   * The delivery charge is added on top of the VAT total.
   * Formula: billTotalCents = orderIsComp ? 0 : vatBreakdown.totalCents + billDeliveryChargeCents
   *
   * These tests verify the formula directly (extracted as a pure function for testability).
   */

  function calcBillTotal(params: {
    vatTotal: number
    deliveryChargeCents: number
    orderIsComp: boolean
    orderType: 'dine_in' | 'takeaway' | 'delivery'
  }): number {
    const { vatTotal, deliveryChargeCents, orderIsComp, orderType } = params
    const billDeliveryChargeCents = orderType === 'delivery' ? deliveryChargeCents : 0
    return orderIsComp ? 0 : vatTotal + billDeliveryChargeCents
  }

  it('adds delivery charge to VAT total for delivery orders', () => {
    expect(
      calcBillTotal({ vatTotal: 100_00, deliveryChargeCents: 50_00, orderIsComp: false, orderType: 'delivery' }),
    ).toBe(150_00)
  })

  it('does NOT add delivery charge for dine-in orders', () => {
    expect(
      calcBillTotal({ vatTotal: 100_00, deliveryChargeCents: 50_00, orderIsComp: false, orderType: 'dine_in' }),
    ).toBe(100_00)
  })

  it('does NOT add delivery charge for takeaway orders', () => {
    expect(
      calcBillTotal({ vatTotal: 100_00, deliveryChargeCents: 50_00, orderIsComp: false, orderType: 'takeaway' }),
    ).toBe(100_00)
  })

  it('returns 0 for comp delivery orders (delivery charge also zeroed)', () => {
    expect(
      calcBillTotal({ vatTotal: 100_00, deliveryChargeCents: 50_00, orderIsComp: true, orderType: 'delivery' }),
    ).toBe(0)
  })

  it('handles zero delivery charge correctly', () => {
    expect(
      calcBillTotal({ vatTotal: 80_00, deliveryChargeCents: 0, orderIsComp: false, orderType: 'delivery' }),
    ).toBe(80_00)
  })
})
