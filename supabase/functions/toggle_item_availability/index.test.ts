import { describe, it, expect, vi } from 'vitest'
import { handler, corsHeaders, type HandlerEnv } from './index'

const TEST_MENU_ITEM_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

const mockEnv: HandlerEnv = {
  supabaseUrl: 'https://test.supabase.co',
  serviceKey: 'test-service-key',
}

const mockAuth = {
  actorId: 'user-123',
  role: 'owner',
}

// Mock verifyAndGetCaller to avoid real auth
vi.mock('../_shared/auth.ts', () => ({
  verifyAndGetCaller: vi.fn().mockResolvedValue(mockAuth),
}))

function makePatchFetch(status = 204, contentRange = '*/1'): (input: string, init?: RequestInit) => Promise<Response> {
  return vi.fn().mockResolvedValue(new Response(null, { status, headers: { 'content-range': contentRange } }))
}

function makeAuthRequest(body: unknown): Request {
  return new Request('http://localhost/functions/v1/toggle_item_availability', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-jwt' },
    body: JSON.stringify(body),
  })
}

describe('toggle_item_availability handler', () => {
  describe('OPTIONS preflight', () => {
    it('returns 204 with CORS headers', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/toggle_item_availability', {
        method: 'OPTIONS',
      })
      const res = await handler(req)
      expect(res.status).toBe(204)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST')
    })

    it('includes x-demo-staff-id in allowed headers', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/toggle_item_availability', {
        method: 'OPTIONS',
      })
      const res = await handler(req)
      expect(res.headers.get('Access-Control-Allow-Headers')).toContain('x-demo-staff-id')
    })
  })

  describe('GET /health', () => {
    it('returns ok:true', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/toggle_item_availability/health', {
        method: 'GET',
      })
      const res = await handler(req)
      expect(res.status).toBe(200)
      const json = await res.json() as { ok: boolean; function: string }
      expect(json.ok).toBe(true)
      expect(json.function).toBe('toggle_item_availability')
    })
  })

  describe('POST — missing env', () => {
    it('returns 500 when env is null', async (): Promise<void> => {
      const req = makeAuthRequest({ menu_item_id: TEST_MENU_ITEM_ID, available: false })
      const res = await handler(req, fetch, null)
      expect(res.status).toBe(500)
      const json = await res.json() as { success: boolean }
      expect(json.success).toBe(false)
    })
  })

  describe('POST — validation', () => {
    it('returns 400 when menu_item_id is missing', async (): Promise<void> => {
      const req = makeAuthRequest({ available: true })
      const res = await handler(req, makePatchFetch(), mockEnv)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toMatch(/menu_item_id/)
    })

    it('returns 400 when available is not a boolean', async (): Promise<void> => {
      const req = makeAuthRequest({ menu_item_id: TEST_MENU_ITEM_ID, available: 'yes' })
      const res = await handler(req, makePatchFetch(), mockEnv)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toMatch(/available/)
    })

    it('returns 400 when body is not JSON', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/toggle_item_availability', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-jwt' },
        body: 'not json',
      })
      const res = await handler(req, makePatchFetch(), mockEnv)
      expect(res.status).toBe(400)
    })
  })

  describe('POST — happy path', () => {
    it('returns 200 success when marking item as 86\'d', async (): Promise<void> => {
      const mockFetch = makePatchFetch(204)
      const req = makeAuthRequest({ menu_item_id: TEST_MENU_ITEM_ID, available: false })
      const res = await handler(req, mockFetch, mockEnv)
      expect(res.status).toBe(200)
      const json = await res.json() as { success: boolean }
      expect(json.success).toBe(true)
    })

    it('returns 200 success when restoring item availability', async (): Promise<void> => {
      const mockFetch = makePatchFetch(204)
      const req = makeAuthRequest({ menu_item_id: TEST_MENU_ITEM_ID, available: true })
      const res = await handler(req, mockFetch, mockEnv)
      expect(res.status).toBe(200)
      const json = await res.json() as { success: boolean }
      expect(json.success).toBe(true)
    })

    it('PATCHes the correct menu_items endpoint with ownership filter', async (): Promise<void> => {
      const mockFetch = makePatchFetch(204)
      const req = makeAuthRequest({ menu_item_id: TEST_MENU_ITEM_ID, available: false })
      await handler(req, mockFetch, mockEnv)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/menu_items?id=eq.${TEST_MENU_ITEM_ID}`),
        expect.objectContaining({ method: 'PATCH' }),
      )
      // Ownership filter must reference the caller's actorId
      const calledUrl = (mockFetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
      expect(calledUrl).toContain(mockAuth.actorId)
      expect(calledUrl).toContain('user_restaurants')
    })

    it('includes CORS headers in success response', async (): Promise<void> => {
      const req = makeAuthRequest({ menu_item_id: TEST_MENU_ITEM_ID, available: true })
      const res = await handler(req, makePatchFetch(204), mockEnv)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(corsHeaders['Access-Control-Allow-Origin'])
    })
  })

  describe('POST — DB failure', () => {
    it('returns 500 when PATCH fails', async (): Promise<void> => {
      const mockFetch = makePatchFetch(500)
      const req = makeAuthRequest({ menu_item_id: TEST_MENU_ITEM_ID, available: false })
      const res = await handler(req, mockFetch, mockEnv)
      expect(res.status).toBe(500)
      const json = await res.json() as { success: boolean }
      expect(json.success).toBe(false)
    })
  })

  describe('POST — ownership check', () => {
    it('returns 403 when content-range indicates 0 rows matched', async (): Promise<void> => {
      // 0 rows = item not found or caller doesn't own it
      const mockFetch = makePatchFetch(204, '*/0')
      const req = makeAuthRequest({ menu_item_id: TEST_MENU_ITEM_ID, available: false })
      const res = await handler(req, mockFetch, mockEnv)
      expect(res.status).toBe(403)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toMatch(/access denied/)
    })

    it('returns 200 when caller owns the item (content-range */1)', async (): Promise<void> => {
      const mockFetch = makePatchFetch(204, '*/1')
      const req = makeAuthRequest({ menu_item_id: TEST_MENU_ITEM_ID, available: false })
      const res = await handler(req, mockFetch, mockEnv)
      expect(res.status).toBe(200)
      const json = await res.json() as { success: boolean }
      expect(json.success).toBe(true)
    })
  })
})
