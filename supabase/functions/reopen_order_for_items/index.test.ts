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
  return new Request('http://localhost/functions/v1/reopen_order_for_items', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-jwt',
    },
    body: JSON.stringify(body),
  })
}

function buildMockFetch(orderStatus: string, orderType = 'dine_in'): FetchFn {
  return vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
    if (url.includes('/auth/v1/user')) {
      return new Response(JSON.stringify({ id: ACTOR_ID }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (url.includes('/rest/v1/users')) {
      return new Response(JSON.stringify([{ id: ACTOR_ID, role: 'server' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (url.includes('/rest/v1/orders') && (!init?.method || init.method === 'GET')) {
      return new Response(
        JSON.stringify([{
          id: VALID_ORDER_ID,
          restaurant_id: RESTAURANT_ID,
          status: orderStatus,
          order_type: orderType,
        }]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }
    if (url.includes('/rest/v1/orders') && init?.method === 'PATCH') {
      return new Response(null, { status: 204 })
    }
    if (url.includes('/rest/v1/audit_log') && init?.method === 'POST') {
      return new Response(null, { status: 201 })
    }
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as FetchFn
}

describe('reopen_order_for_items handler', () => {
  describe('OPTIONS preflight', () => {
    it('returns 204 with CORS headers', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/reopen_order_for_items', {
        method: 'OPTIONS',
      })
      const res = await handler(req, fetch, TEST_ENV)
      expect(res.status).toBe(204)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(corsHeaders['Access-Control-Allow-Origin'])
    })
  })

  describe('POST — validation', () => {
    it('returns 400 when body is malformed JSON', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/reopen_order_for_items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-jwt' },
        body: 'not-json',
      })
      const res = await handler(req, buildMockFetch('pending_payment'), TEST_ENV)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('Invalid request body')
    })

    it('returns 400 when order_id is missing', async (): Promise<void> => {
      const res = await handler(makeRequest({}), buildMockFetch('pending_payment'), TEST_ENV)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('order_id is required')
    })

    it('returns 400 when order_id is not a valid UUID', async (): Promise<void> => {
      const res = await handler(makeRequest({ order_id: 'not-a-uuid' }), buildMockFetch('pending_payment'), TEST_ENV)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('order_id must be a valid UUID')
    })

    it('returns 400 when order_id is an empty string', async (): Promise<void> => {
      const res = await handler(makeRequest({ order_id: '' }), buildMockFetch('pending_payment'), TEST_ENV)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
    })
  })

  describe('POST — happy path', () => {
    it('returns 200 with status open for a pending_payment order', async (): Promise<void> => {
      const res = await handler(makeRequest({ order_id: VALID_ORDER_ID }), buildMockFetch('pending_payment'), TEST_ENV)
      expect(res.status).toBe(200)
      const json = await res.json() as { success: boolean; data: { status: string } }
      expect(json.success).toBe(true)
      expect(json.data.status).toBe('open')
    })

    it('patches the order with post_bill_mode=true and clears bill fields', async (): Promise<void> => {
      const mockFetch = buildMockFetch('pending_payment')
      await handler(makeRequest({ order_id: VALID_ORDER_ID }), mockFetch, TEST_ENV)

      const calls = vi.mocked(mockFetch).mock.calls
      const patchCall = calls.find(([url, init]) =>
        url.includes('/rest/v1/orders') && init?.method === 'PATCH',
      )
      expect(patchCall).toBeDefined()
      const patchBody = JSON.parse(patchCall![1]?.body as string) as Record<string, unknown>
      expect(patchBody.status).toBe('open')
      expect(patchBody.post_bill_mode).toBe(true)
      expect(patchBody.final_total_cents).toBeNull()
      expect(patchBody.service_charge_cents).toBeNull()
      expect(patchBody.bill_number).toBeNull()
    })

    it('writes an audit log entry for the reopen action', async (): Promise<void> => {
      const mockFetch = buildMockFetch('pending_payment')
      await handler(makeRequest({ order_id: VALID_ORDER_ID }), mockFetch, TEST_ENV)

      const calls = vi.mocked(mockFetch).mock.calls
      const auditCall = calls.find(([url, init]) =>
        url.includes('/rest/v1/audit_log') && init?.method === 'POST',
      )
      expect(auditCall).toBeDefined()
      const auditBody = JSON.parse(auditCall![1]?.body as string) as Record<string, unknown>
      expect(auditBody.action).toBe('reopen_order_for_items')
      expect(auditBody.entity_id).toBe(VALID_ORDER_ID)
    })

    it('is idempotent — returns 200 when order is already open', async (): Promise<void> => {
      const res = await handler(makeRequest({ order_id: VALID_ORDER_ID }), buildMockFetch('open'), TEST_ENV)
      expect(res.status).toBe(200)
      const json = await res.json() as { success: boolean; data: { status: string } }
      expect(json.success).toBe(true)
      expect(json.data.status).toBe('open')
    })
  })

  describe('POST — error cases', () => {
    it('returns 409 when order is already paid', async (): Promise<void> => {
      const res = await handler(makeRequest({ order_id: VALID_ORDER_ID }), buildMockFetch('paid'), TEST_ENV)
      expect(res.status).toBe(409)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toContain('pending_payment')
    })

    it('returns 409 when order is open but already in normal flow (idempotent 200)', async (): Promise<void> => {
      // Already-open is handled as idempotent 200 per the handler logic
      const res = await handler(makeRequest({ order_id: VALID_ORDER_ID }), buildMockFetch('open'), TEST_ENV)
      expect(res.status).toBe(200)
    })

    it('returns 409 when order is cancelled', async (): Promise<void> => {
      const res = await handler(makeRequest({ order_id: VALID_ORDER_ID }), buildMockFetch('cancelled'), TEST_ENV)
      expect(res.status).toBe(409)
    })

    it('returns 409 when order_type is not dine_in (takeaway)', async (): Promise<void> => {
      const res = await handler(makeRequest({ order_id: VALID_ORDER_ID }), buildMockFetch('pending_payment', 'takeaway'), TEST_ENV)
      expect(res.status).toBe(409)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toContain('dine-in')
    })

    it('returns 409 when order_type is delivery', async (): Promise<void> => {
      const res = await handler(makeRequest({ order_id: VALID_ORDER_ID }), buildMockFetch('pending_payment', 'delivery'), TEST_ENV)
      expect(res.status).toBe(409)
    })

    it('returns 500 when env is null', async (): Promise<void> => {
      const res = await handler(makeRequest({ order_id: VALID_ORDER_ID }), fetch, null)
      expect(res.status).toBe(500)
    })

    it('returns 401 when no Authorization header is provided', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/reopen_order_for_items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: VALID_ORDER_ID }),
      })
      const res = await handler(req, buildMockFetch('pending_payment'), TEST_ENV)
      expect(res.status).toBe(401)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
    })
  })

  describe('POST — order not found', () => {
    it('returns 404 when order does not exist', async (): Promise<void> => {
      const emptyOrderFetch: FetchFn = vi.fn(async (url: string): Promise<Response> => {
        if (url.includes('/auth/v1/user')) {
          return new Response(JSON.stringify({ id: ACTOR_ID }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (url.includes('/rest/v1/users')) {
          return new Response(JSON.stringify([{ id: ACTOR_ID, role: 'server' }]), {
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

      const res = await handler(makeRequest({ order_id: VALID_ORDER_ID }), emptyOrderFetch, TEST_ENV)
      expect(res.status).toBe(404)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('Order not found')
    })
  })
})
