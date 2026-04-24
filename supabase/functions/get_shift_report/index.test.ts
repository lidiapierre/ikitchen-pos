import { describe, it, expect, vi } from 'vitest'
import { handler, corsHeaders } from './index'
import type { FetchFn, HandlerEnv, ShiftReportData } from './index'

const TEST_ENV: HandlerEnv = {
  supabaseUrl: 'http://test-supabase.local',
  serviceKey: 'test-service-key',
}

const ACTOR_ID = '11111111-1111-1111-1111-111111111111'
const FROM = '2026-04-24T00:00:00.000Z'
const TO = '2026-04-24T14:30:00.000Z'

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/functions/v1/get_shift_report', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-jwt',
    },
    body: JSON.stringify(body),
  })
}

function makeOrders(overrides: Array<Record<string, unknown>> = []) {
  return overrides.length > 0 ? overrides : [
    {
      id: 'order-1',
      final_total_cents: 100000,
      covers: 2,
      discount_amount_cents: 10000,
      order_comp: false,
      vat_cents: 13000,
      service_charge_cents: 0,
    },
  ]
}

function buildMockFetch(opts: {
  orders?: Array<Record<string, unknown>>
  compOrders?: Array<Record<string, unknown>>
  compItems?: Array<Record<string, unknown>>
  payments?: Array<Record<string, unknown>>
  ordersStatus?: number
  compOrdersStatus?: number
  compItemsStatus?: number
  paymentsStatus?: number
} = {}): FetchFn {
  const {
    orders = makeOrders(),
    compOrders = [],
    compItems = [],
    payments = [{ order_id: 'order-1', method: 'cash', amount_cents: 100000 }],
    ordersStatus = 200,
    compOrdersStatus = 200,
    compItemsStatus = 200,
    paymentsStatus = 200,
  } = opts

  return vi.fn(async (url: string): Promise<Response> => {
    if (url.includes('/auth/v1/user')) {
      return new Response(JSON.stringify({ id: ACTOR_ID }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (url.includes('/rest/v1/users')) {
      return new Response(JSON.stringify([{ id: ACTOR_ID, role: 'owner' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (url.includes('/rest/v1/orders') && url.includes('order_comp=eq.true')) {
      return new Response(JSON.stringify(compOrders), {
        status: compOrdersStatus,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (url.includes('/rest/v1/orders')) {
      return new Response(JSON.stringify(orders), {
        status: ordersStatus,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (url.includes('/rest/v1/order_items') && url.includes('comp=eq.true')) {
      return new Response(JSON.stringify(compItems), {
        status: compItemsStatus,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (url.includes('/rest/v1/payments')) {
      return new Response(JSON.stringify(payments), {
        status: paymentsStatus,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as FetchFn
}

describe('get_shift_report handler', () => {
  describe('OPTIONS preflight', () => {
    it('returns 204 with CORS headers including x-demo-staff-id', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/get_shift_report', { method: 'OPTIONS' })
      const res = await handler(req, vi.fn() as unknown as FetchFn, TEST_ENV)
      expect(res.status).toBe(204)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(corsHeaders['Access-Control-Allow-Headers']).toContain('x-demo-staff-id')
    })
  })

  describe('validation', () => {
    it('returns 400 for missing from/to', async (): Promise<void> => {
      const res = await handler(makeRequest({}), buildMockFetch(), TEST_ENV)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toContain('from and to')
    })

    it('returns 400 for unparseable date', async (): Promise<void> => {
      const res = await handler(makeRequest({ from: 'not-a-date', to: TO }), buildMockFetch(), TEST_ENV)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.error).toContain('valid ISO')
    })

    it('returns 400 when from >= to', async (): Promise<void> => {
      const res = await handler(makeRequest({ from: TO, to: FROM }), buildMockFetch(), TEST_ENV)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.error).toContain('"from" must be before "to"')
    })

    it('returns 400 for malformed JSON body', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/get_shift_report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-jwt' },
        body: 'not-json',
      })
      const res = await handler(req, buildMockFetch(), TEST_ENV)
      expect(res.status).toBe(400)
    })

    it('returns 500 when env is null', async (): Promise<void> => {
      const res = await handler(makeRequest({ from: FROM, to: TO }), buildMockFetch(), null)
      expect(res.status).toBe(500)
    })
  })

  describe('happy path', () => {
    it('returns correct sales breakdown for a single non-comp order', async (): Promise<void> => {
      const orders = [{
        id: 'order-1',
        final_total_cents: 100000,
        covers: 3,
        discount_amount_cents: 5000,
        order_comp: false,
        vat_cents: 13000,
        service_charge_cents: 0,
      }]
      const payments = [{ order_id: 'order-1', method: 'cash', amount_cents: 100000 }]

      const res = await handler(
        makeRequest({ from: FROM, to: TO }),
        buildMockFetch({ orders, payments }),
        TEST_ENV,
      )
      expect(res.status).toBe(200)
      const json = await res.json() as { success: boolean; data: ShiftReportData }
      expect(json.success).toBe(true)

      const d = json.data
      expect(d.total_orders).toBe(1)
      expect(d.total_covers).toBe(3)
      expect(d.net_sales_cents).toBe(100000)
      expect(d.discounts_cents).toBe(5000)
      expect(d.complimentary_cents).toBe(0)
      expect(d.gross_sales_cents).toBe(105000) // 100000 + 5000 + 0
      expect(d.vat_amount_cents).toBe(13000)
      expect(d.subtotal_excl_vat_cents).toBe(87000) // 100000 - 13000
      expect(d.total_incl_vat_cents).toBe(100000)
      expect(d.cash_cents).toBe(100000)
      expect(d.card_cents).toBe(0)
      expect(d.total_collected_cents).toBe(100000)
    })

    it('avg order value excludes comp orders', async (): Promise<void> => {
      const orders = [
        { id: 'order-1', final_total_cents: 80000, covers: 2, discount_amount_cents: 0, order_comp: false, vat_cents: 10000, service_charge_cents: 0 },
        { id: 'order-2', final_total_cents: 0,     covers: 1, discount_amount_cents: 0, order_comp: true,  vat_cents: 0,     service_charge_cents: 0 },
      ]
      const payments = [{ order_id: 'order-1', method: 'card', amount_cents: 80000 }]

      const res = await handler(
        makeRequest({ from: FROM, to: TO }),
        buildMockFetch({ orders, payments }),
        TEST_ENV,
      )
      const json = await res.json() as { success: boolean; data: ShiftReportData }
      expect(json.data.total_orders).toBe(2)
      // Avg over paying orders only (order-1): 80000 / 1 = 80000
      expect(json.data.avg_order_value_cents).toBe(80000)
    })

    it('includes complimentary value from comp orders', async (): Promise<void> => {
      const orders = [
        { id: 'order-1', final_total_cents: 0, covers: 2, discount_amount_cents: 0, order_comp: true, vat_cents: 0, service_charge_cents: 0 },
      ]
      const compOrders = [
        {
          id: 'order-1',
          order_items: [
            { quantity: 2, unit_price_cents: 30000, voided: false },
            { quantity: 1, unit_price_cents: 10000, voided: true },
          ],
        },
      ]

      const res = await handler(
        makeRequest({ from: FROM, to: TO }),
        buildMockFetch({ orders, compOrders, payments: [] }),
        TEST_ENV,
      )
      const json = await res.json() as { success: boolean; data: ShiftReportData }
      // Only non-voided: 2 * 30000 = 60000
      expect(json.data.complimentary_cents).toBe(60000)
      expect(json.data.gross_sales_cents).toBe(60000) // 0 + 0 + 60000
    })

    it('buckets payment methods correctly', async (): Promise<void> => {
      const orders = [
        { id: 'order-1', final_total_cents: 150000, covers: 4, discount_amount_cents: 0, order_comp: false, vat_cents: 0, service_charge_cents: 0 },
      ]
      const payments = [
        { order_id: 'order-1', method: 'cash',   amount_cents: 70000 },
        { order_id: 'order-1', method: 'card',   amount_cents: 50000 },
        { order_id: 'order-1', method: 'mobile', amount_cents: 30000 },
      ]

      const res = await handler(
        makeRequest({ from: FROM, to: TO }),
        buildMockFetch({ orders, payments }),
        TEST_ENV,
      )
      const json = await res.json() as { success: boolean; data: ShiftReportData }
      expect(json.data.cash_cents).toBe(70000)
      expect(json.data.card_cents).toBe(50000)
      expect(json.data.mobile_cents).toBe(30000)
      expect(json.data.total_collected_cents).toBe(150000)
    })

    it('returns empty report (all zeros) when no orders exist', async (): Promise<void> => {
      const res = await handler(
        makeRequest({ from: FROM, to: TO }),
        buildMockFetch({ orders: [], payments: [] }),
        TEST_ENV,
      )
      expect(res.status).toBe(200)
      const json = await res.json() as { success: boolean; data: ShiftReportData }
      expect(json.data.total_orders).toBe(0)
      expect(json.data.net_sales_cents).toBe(0)
      expect(json.data.total_collected_cents).toBe(0)
    })
  })

  describe('error propagation', () => {
    it('returns 500 when orders query fails', async (): Promise<void> => {
      const res = await handler(
        makeRequest({ from: FROM, to: TO }),
        buildMockFetch({ ordersStatus: 503 }),
        TEST_ENV,
      )
      expect(res.status).toBe(500)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toContain('Failed to fetch orders')
    })

    it('returns 500 when comp orders query fails', async (): Promise<void> => {
      const res = await handler(
        makeRequest({ from: FROM, to: TO }),
        buildMockFetch({ compOrdersStatus: 500 }),
        TEST_ENV,
      )
      expect(res.status).toBe(500)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.error).toContain('Failed to fetch comp orders')
    })

    it('returns 500 when comp items query fails', async (): Promise<void> => {
      const res = await handler(
        makeRequest({ from: FROM, to: TO }),
        buildMockFetch({ compItemsStatus: 500 }),
        TEST_ENV,
      )
      expect(res.status).toBe(500)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.error).toContain('Failed to fetch comp items')
    })

    it('returns 500 when payments query fails', async (): Promise<void> => {
      const res = await handler(
        makeRequest({ from: FROM, to: TO }),
        buildMockFetch({ paymentsStatus: 500 }),
        TEST_ENV,
      )
      expect(res.status).toBe(500)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.error).toContain('Failed to fetch payments')
    })
  })
})
