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
  return new Request('http://localhost/functions/v1/mark_order_due', {
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
      return new Response(JSON.stringify([{ id: ACTOR_ID, role: 'owner' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (url.includes('/rest/v1/orders') && (!init?.method || init?.method === 'GET')) {
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

describe('mark_order_due handler', () => {
  describe('OPTIONS preflight', () => {
    it('returns 204 with CORS headers', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/mark_order_due', {
        method: 'OPTIONS',
      })
      const res = await handler(req, fetch, TEST_ENV)
      expect(res.status).toBe(204)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(corsHeaders['Access-Control-Allow-Origin'])
    })
  })

  describe('POST — validation', () => {
    it('returns 400 when body is malformed JSON', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/mark_order_due', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      })
      const res = await handler(req, buildMockFetch('open'), TEST_ENV)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('Invalid request body')
    })

    it('returns 400 when order_id is missing', async (): Promise<void> => {
      const res = await handler(makeRequest({}), buildMockFetch('open'), TEST_ENV)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
    })

    it('returns 400 when order_id is not a UUID', async (): Promise<void> => {
      const res = await handler(makeRequest({ order_id: 'not-a-uuid' }), buildMockFetch('open'), TEST_ENV)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('order_id must be a valid UUID')
    })
  })

  describe('POST — happy path', () => {
    it('returns 200 success for a valid open dine-in order', async (): Promise<void> => {
      const res = await handler(makeRequest({ order_id: VALID_ORDER_ID }), buildMockFetch('open'), TEST_ENV)
      expect(res.status).toBe(200)
      const json = await res.json() as { success: boolean; data: { status: string } }
      expect(json.success).toBe(true)
      expect(json.data.status).toBe('due')
    })

    it('is idempotent — returns 200 when order is already due', async (): Promise<void> => {
      const res = await handler(makeRequest({ order_id: VALID_ORDER_ID }), buildMockFetch('due'), TEST_ENV)
      expect(res.status).toBe(200)
      const json = await res.json() as { success: boolean; data: { status: string } }
      expect(json.success).toBe(true)
    })
  })

  describe('POST — error cases', () => {
    it('returns 409 when order is not open (e.g. already paid)', async (): Promise<void> => {
      const res = await handler(makeRequest({ order_id: VALID_ORDER_ID }), buildMockFetch('paid'), TEST_ENV)
      expect(res.status).toBe(409)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('Order is not open')
    })

    it('returns 409 when order is cancelled', async (): Promise<void> => {
      const res = await handler(makeRequest({ order_id: VALID_ORDER_ID }), buildMockFetch('cancelled'), TEST_ENV)
      expect(res.status).toBe(409)
    })

    it('returns 422 when order_type is not dine_in', async (): Promise<void> => {
      const res = await handler(makeRequest({ order_id: VALID_ORDER_ID }), buildMockFetch('open', 'takeaway'), TEST_ENV)
      expect(res.status).toBe(422)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toContain('dine-in')
    })

    it('returns 500 when env is null', async (): Promise<void> => {
      const res = await handler(makeRequest({ order_id: VALID_ORDER_ID }), fetch, null)
      expect(res.status).toBe(500)
    })
  })
})
