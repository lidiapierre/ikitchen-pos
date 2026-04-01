import { describe, it, expect, vi } from 'vitest'
import { handler, corsHeaders } from './index'
import type { FetchFn, HandlerEnv } from './index'

const TEST_ENV: HandlerEnv = {
  supabaseUrl: 'http://test-supabase.local',
  serviceKey: 'test-service-key',
}

const VALID_ORDER_ID = '11111111-1111-1111-1111-111111111111'
const RESTAURANT_ID = '22222222-2222-2222-2222-222222222222'
const ACTOR_ID = '33333333-3333-3333-3333-333333333333'

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/functions/v1/close_order', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-jwt',
    },
    body: JSON.stringify(body),
  })
}

/**
 * Build a mock fetchFn that intercepts Supabase REST calls.
 * `orderStatus` controls what the order lookup returns.
 */
function buildMockFetch(orderStatus: string, extras?: {
  final_total_cents?: number
  service_charge_cents?: number
  bill_number?: string | null
}): FetchFn {
  return vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
    // Auth: verifyAndGetCaller calls /auth/v1/user first
    if (url.includes('/auth/v1/user')) {
      return new Response(JSON.stringify({ id: ACTOR_ID }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    // Auth: then /rest/v1/users for role lookup
    if (url.includes('/rest/v1/users')) {
      return new Response(JSON.stringify([{ id: ACTOR_ID, role: 'owner' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    // Order lookup
    if (url.includes('/rest/v1/orders') && (!init?.method || init?.method === 'GET')) {
      if (url.includes('select=id,restaurant_id,status')) {
        return new Response(
          JSON.stringify([{
            id: VALID_ORDER_ID,
            restaurant_id: RESTAURANT_ID,
            status: orderStatus,
            discount_amount_cents: 0,
            order_comp: false,
            final_total_cents: extras?.final_total_cents ?? null,
            service_charge_cents: extras?.service_charge_cents ?? null,
            bill_number: extras?.bill_number ?? null,
          }]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      // Customer mobile re-fetch
      if (url.includes('select=customer_mobile')) {
        return new Response(JSON.stringify([{ customer_mobile: null, customer_name: null }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      // Covers re-fetch or other order queries
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    // Order items
    if (url.includes('/rest/v1/order_items') && (!init?.method || init?.method === 'GET')) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    // Config (service charge)
    if (url.includes('/rest/v1/config')) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    // Bill sequence RPC
    if (url.includes('/rest/v1/rpc/next_bill_sequence')) {
      return new Response(JSON.stringify(1), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    // PATCH order (update status)
    if (url.includes('/rest/v1/orders') && init?.method === 'PATCH') {
      return new Response(null, { status: 204 })
    }
    // Audit log
    if (url.includes('/rest/v1/audit_log') && init?.method === 'POST') {
      return new Response(null, { status: 201 })
    }
    // Recipe items
    if (url.includes('/rest/v1/recipe_items')) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    // Stock RPCs
    if (url.includes('/rest/v1/rpc/')) {
      return new Response(null, { status: 200 })
    }
    // Bill sequences (fallback non-RPC)
    if (url.includes('/rest/v1/bill_sequences')) {
      return new Response(JSON.stringify([{ last_value: 0 }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    // Customers upsert
    if (url.includes('/rest/v1/customers')) {
      return new Response(null, { status: 201 })
    }
    // Stock adjustments
    if (url.includes('/rest/v1/stock_adjustments')) {
      return new Response(null, { status: 201 })
    }
    // Default: 200 OK
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as FetchFn
}

describe('close_order handler', () => {
  describe('OPTIONS preflight', () => {
    it('returns 204 with CORS headers', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/close_order', {
        method: 'OPTIONS',
      })
      const res = await handler(req)
      expect(res.status).toBe(204)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(corsHeaders['Access-Control-Allow-Origin'])
    })
  })

  describe('POST — validation', () => {
    it('returns 400 when body is malformed JSON', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/close_order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer x' },
        body: 'not-valid-json',
      })
      const mockFetch = buildMockFetch('open')
      const res = await handler(req, mockFetch, TEST_ENV)
      expect(res.status).toBe(400)
    })

    it('returns 400 when order_id is missing', async (): Promise<void> => {
      const req = makeRequest({})
      const mockFetch = buildMockFetch('open')
      const res = await handler(req, mockFetch, TEST_ENV)
      expect(res.status).toBe(400)
      const json = (await res.json()) as { error: string }
      expect(json.error).toBe('order_id is required')
    })

    it('returns 400 when order_id is not a valid UUID', async (): Promise<void> => {
      const req = makeRequest({ order_id: 'not-a-uuid' })
      const mockFetch = buildMockFetch('open')
      const res = await handler(req, mockFetch, TEST_ENV)
      expect(res.status).toBe(400)
      const json = (await res.json()) as { error: string }
      expect(json.error).toBe('order_id must be a valid UUID')
    })
  })

  describe('POST — open order (happy path)', () => {
    it('returns 200 with success and transitions order to pending_payment', async (): Promise<void> => {
      const mockFetch = buildMockFetch('open')
      const req = makeRequest({ order_id: VALID_ORDER_ID })
      const res = await handler(req, mockFetch, TEST_ENV)
      expect(res.status).toBe(200)
      const json = (await res.json()) as { success: boolean; data: { final_total_cents: number } }
      expect(json.success).toBe(true)
      expect(typeof json.data.final_total_cents).toBe('number')
    })
  })

  describe('POST — idempotent on pending_payment (issue #318)', () => {
    it('returns 200 when order is already pending_payment', async (): Promise<void> => {
      const mockFetch = buildMockFetch('pending_payment', {
        final_total_cents: 5000,
        service_charge_cents: 500,
        bill_number: 'RN0000001',
      })
      const req = makeRequest({ order_id: VALID_ORDER_ID })
      const res = await handler(req, mockFetch, TEST_ENV)
      expect(res.status).toBe(200)
      const json = (await res.json()) as {
        success: boolean
        data: { final_total_cents: number; service_charge_cents: number; bill_number: string }
      }
      expect(json.success).toBe(true)
      expect(json.data.final_total_cents).toBe(5000)
      expect(json.data.service_charge_cents).toBe(500)
      expect(json.data.bill_number).toBe('RN0000001')
    })

    it('does not re-process order items or write audit log', async (): Promise<void> => {
      const mockFetch = buildMockFetch('pending_payment', {
        final_total_cents: 1000,
        service_charge_cents: 0,
        bill_number: null,
      })
      const req = makeRequest({ order_id: VALID_ORDER_ID })
      await handler(req, mockFetch, TEST_ENV)

      // Verify no PATCH or audit_log POST was made
      const calls = (mockFetch as ReturnType<typeof vi.fn>).mock.calls as Array<[string, RequestInit?]>
      const patchCalls = calls.filter(([, init]) => init?.method === 'PATCH')
      const auditCalls = calls.filter(([url, init]) =>
        url.includes('audit_log') && init?.method === 'POST',
      )
      expect(patchCalls.length).toBe(0)
      expect(auditCalls.length).toBe(0)
    })
  })

  describe('POST — invalid state transitions', () => {
    it('returns 409 when order is closed/paid', async (): Promise<void> => {
      const mockFetch = buildMockFetch('paid')
      const req = makeRequest({ order_id: VALID_ORDER_ID })
      const res = await handler(req, mockFetch, TEST_ENV)
      expect(res.status).toBe(409)
      const json = (await res.json()) as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('Order is not open')
    })

    it('returns 409 when order is cancelled', async (): Promise<void> => {
      const mockFetch = buildMockFetch('cancelled')
      const req = makeRequest({ order_id: VALID_ORDER_ID })
      const res = await handler(req, mockFetch, TEST_ENV)
      expect(res.status).toBe(409)
      const json = (await res.json()) as { success: boolean; error: string }
      expect(json.success).toBe(false)
    })
  })

  describe('POST — order not found', () => {
    it('returns 404 when order does not exist', async (): Promise<void> => {
      const mockFetch = vi.fn(async (url: string): Promise<Response> => {
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
        if (url.includes('/rest/v1/orders')) {
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return new Response(null, { status: 200 })
      }) as FetchFn
      const req = makeRequest({ order_id: VALID_ORDER_ID })
      const res = await handler(req, mockFetch, TEST_ENV)
      expect(res.status).toBe(404)
    })
  })

  describe('health check', () => {
    it('returns 200 for GET /health', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/close_order/health', {
        method: 'GET',
      })
      const res = await handler(req)
      expect(res.status).toBe(200)
      const json = (await res.json()) as { ok: boolean }
      expect(json.ok).toBe(true)
    })
  })

  describe('server config error', () => {
    it('returns 500 when env is null', async (): Promise<void> => {
      const req = makeRequest({ order_id: VALID_ORDER_ID })
      const res = await handler(req, fetch, null)
      expect(res.status).toBe(500)
      const json = (await res.json()) as { error: string }
      expect(json.error).toBe('Server configuration error')
    })
  })
})
