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

const TEST_RESTAURANT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

/** Build a fetch mock that handles the two-step ownership check + PATCH */
function makeOwnershipFetch(opts: {
  itemExists?: boolean
  ownershipGranted?: boolean
  patchStatus?: number
} = {}): (input: string, init?: RequestInit) => Promise<Response> {
  const { itemExists = true, ownershipGranted = true, patchStatus = 204 } = opts

  return vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase()

    // Step 1: resolve menu_item → restaurant_id
    if (method === 'GET' && (url as string).includes('/menu_items')) {
      const body = itemExists
        ? JSON.stringify([{ id: TEST_MENU_ITEM_ID, menu: { restaurant_id: TEST_RESTAURANT_ID } }])
        : JSON.stringify([])
      return Promise.resolve(new Response(body, { status: 200 }))
    }

    // Step 2: verify ownership via user_restaurants
    if (method === 'GET' && (url as string).includes('/user_restaurants')) {
      const body = ownershipGranted
        ? JSON.stringify([{ user_id: mockAuth.actorId }])
        : JSON.stringify([])
      return Promise.resolve(new Response(body, { status: 200 }))
    }

    // Step 3: PATCH
    if (method === 'PATCH') {
      return Promise.resolve(new Response(null, { status: patchStatus }))
    }

    return Promise.resolve(new Response('[]', { status: 200 }))
  })
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
      const res = await handler(req, makeOwnershipFetch(), mockEnv)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toMatch(/menu_item_id/)
    })

    it('returns 400 when available is not a boolean', async (): Promise<void> => {
      const req = makeAuthRequest({ menu_item_id: TEST_MENU_ITEM_ID, available: 'yes' })
      const res = await handler(req, makeOwnershipFetch(), mockEnv)
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
      const res = await handler(req, makeOwnershipFetch(), mockEnv)
      expect(res.status).toBe(400)
    })
  })

  describe('POST — happy path', () => {
    it('returns 200 success when marking item as 86\'d', async (): Promise<void> => {
      const req = makeAuthRequest({ menu_item_id: TEST_MENU_ITEM_ID, available: false })
      const res = await handler(req, makeOwnershipFetch(), mockEnv)
      expect(res.status).toBe(200)
      const json = await res.json() as { success: boolean }
      expect(json.success).toBe(true)
    })

    it('returns 200 success when restoring item availability', async (): Promise<void> => {
      const req = makeAuthRequest({ menu_item_id: TEST_MENU_ITEM_ID, available: true })
      const res = await handler(req, makeOwnershipFetch(), mockEnv)
      expect(res.status).toBe(200)
      const json = await res.json() as { success: boolean }
      expect(json.success).toBe(true)
    })

    it('queries user_restaurants with the caller actorId', async (): Promise<void> => {
      const mockFetch = makeOwnershipFetch()
      const req = makeAuthRequest({ menu_item_id: TEST_MENU_ITEM_ID, available: false })
      await handler(req, mockFetch, mockEnv)
      const calls = (mockFetch as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit][]
      const ownershipCall = calls.find(([url]) => url.includes('/user_restaurants'))
      expect(ownershipCall).toBeDefined()
      expect(ownershipCall![0]).toContain(mockAuth.actorId)
      expect(ownershipCall![0]).toContain(TEST_RESTAURANT_ID)
    })

    it('includes CORS headers in success response', async (): Promise<void> => {
      const req = makeAuthRequest({ menu_item_id: TEST_MENU_ITEM_ID, available: true })
      const res = await handler(req, makeOwnershipFetch(), mockEnv)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(corsHeaders['Access-Control-Allow-Origin'])
    })
  })

  describe('POST — DB failure', () => {
    it('returns 500 when PATCH fails', async (): Promise<void> => {
      const mockFetch = makeOwnershipFetch({ patchStatus: 500 })
      const req = makeAuthRequest({ menu_item_id: TEST_MENU_ITEM_ID, available: false })
      const res = await handler(req, mockFetch, mockEnv)
      expect(res.status).toBe(500)
      const json = await res.json() as { success: boolean }
      expect(json.success).toBe(false)
    })
  })

  describe('POST — ownership check', () => {
    it('returns 403 when menu item does not exist', async (): Promise<void> => {
      const mockFetch = makeOwnershipFetch({ itemExists: false })
      const req = makeAuthRequest({ menu_item_id: TEST_MENU_ITEM_ID, available: false })
      const res = await handler(req, mockFetch, mockEnv)
      expect(res.status).toBe(403)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toMatch(/access denied/)
    })

    it('returns 403 when caller does not own the restaurant', async (): Promise<void> => {
      const mockFetch = makeOwnershipFetch({ ownershipGranted: false })
      const req = makeAuthRequest({ menu_item_id: TEST_MENU_ITEM_ID, available: false })
      const res = await handler(req, mockFetch, mockEnv)
      expect(res.status).toBe(403)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toMatch(/access denied/)
    })

    it('returns 200 when caller owns the restaurant', async (): Promise<void> => {
      const mockFetch = makeOwnershipFetch({ itemExists: true, ownershipGranted: true })
      const req = makeAuthRequest({ menu_item_id: TEST_MENU_ITEM_ID, available: true })
      const res = await handler(req, mockFetch, mockEnv)
      expect(res.status).toBe(200)
      const json = await res.json() as { success: boolean }
      expect(json.success).toBe(true)
    })
  })
})
