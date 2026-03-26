import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { handler, corsHeaders, type HandlerEnv } from './index'

const TEST_ENV: HandlerEnv = {
  supabaseUrl: 'https://test.supabase.co',
  serviceKey: 'test-service-key',
}

const OWNER_USER_ID = '11111111-1111-1111-1111-111111111111'
const RESTAURANT_ID = '22222222-2222-2222-2222-222222222222'
const SHIFT_ID = '44444444-4444-4444-4444-444444444444'
const FIXED_ISO = '2026-02-27T00:00:00.000Z'

/**
 * Build a mock fetchFn that handles the full call chain for open_shift:
 *  1. /auth/v1/user  — JWT verification
 *  2. /rest/v1/users?…select=role  — role lookup
 *  3. /rest/v1/users?…select=id,restaurant_id  — user/restaurant lookup
 *  4. /rest/v1/shifts?…closed_at=is.null  — duplicate-shift guard
 *  5. POST /rest/v1/shifts  — insert new shift
 *  6. POST /rest/v1/audit_log  — audit entry
 */
function makeFetch(options: {
  role?: string
  hasOpenShift?: boolean
  authFail?: boolean
} = {}): ReturnType<typeof vi.fn> {
  const { role = 'owner', hasOpenShift = false, authFail = false } = options

  return vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    // 1. JWT verification
    if (url.includes('/auth/v1/user')) {
      if (authFail) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
      }
      return new Response(JSON.stringify({ id: OWNER_USER_ID }), { status: 200 })
    }

    // 2. Role lookup
    if (url.includes('/rest/v1/users') && url.includes('select=role')) {
      return new Response(JSON.stringify([{ role }]), { status: 200 })
    }

    // 3. User/restaurant lookup (handler uses raw comma: select=id,restaurant_id)
    if (url.includes('/rest/v1/users') && url.includes('restaurant_id')) {
      return new Response(
        JSON.stringify([{ id: OWNER_USER_ID, restaurant_id: RESTAURANT_ID }]),
        { status: 200 },
      )
    }

    // 4. Open-shift duplicate guard
    if (url.includes('/rest/v1/shifts') && url.includes('closed_at=is.null')) {
      return new Response(
        JSON.stringify(hasOpenShift ? [{ id: 'existing-shift' }] : []),
        { status: 200 },
      )
    }

    // 5. Shift insert
    if (url.includes('/rest/v1/shifts') && init?.method === 'POST') {
      return new Response(
        JSON.stringify([{ id: SHIFT_ID, opened_at: FIXED_ISO }]),
        { status: 201 },
      )
    }

    // 6. Audit log — use 200 (not 204) to avoid undici body-on-204 restriction
    if (url.includes('/rest/v1/audit_log')) {
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })
  })
}

function makeRequest(body: unknown, token = 'valid-token'): Request {
  return new Request('http://localhost/functions/v1/open_shift', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(FIXED_ISO))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('open_shift handler', () => {
  describe('OPTIONS preflight', () => {
    it('returns 204 with CORS headers', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/open_shift', { method: 'OPTIONS' })
      const res = await handler(req)
      expect(res.status).toBe(204)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(corsHeaders['Access-Control-Allow-Origin'])
      expect(res.headers.get('Access-Control-Allow-Methods')).toBe(corsHeaders['Access-Control-Allow-Methods'])
    })
  })

  describe('POST — auth enforcement', () => {
    it('returns 401 when Authorization header is missing', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/open_shift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opening_float: 100 }),
      })
      const res = await handler(req, makeFetch() as typeof fetch, TEST_ENV)
      expect(res.status).toBe(401)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('Unauthorized')
    })

    it('returns 401 when JWT is invalid (Supabase rejects it)', async (): Promise<void> => {
      const req = makeRequest({ opening_float: 100 }, 'bad-token')
      const res = await handler(req, makeFetch({ authFail: true }) as typeof fetch, TEST_ENV)
      expect(res.status).toBe(401)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('Unauthorized')
    })

    it('returns 403 when caller role is too low (server cannot open shifts)', async (): Promise<void> => {
      const req = makeRequest({ opening_float: 100 })
      const res = await handler(req, makeFetch({ role: 'server' }) as typeof fetch, TEST_ENV)
      expect(res.status).toBe(403)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('Forbidden')
    })
  })

  describe('POST — happy path', () => {
    it('returns 200 with shift_id and started_at', async (): Promise<void> => {
      const req = makeRequest({ opening_float: 100 })
      const res = await handler(req, makeFetch() as typeof fetch, TEST_ENV)
      expect(res.status).toBe(200)
      const json = await res.json() as { success: boolean; data: { shift_id: string; started_at: string } }
      expect(json.success).toBe(true)
      expect(json.data.shift_id).toBe(SHIFT_ID)
      expect(json.data.started_at).toBe(FIXED_ISO)
    })

    it('includes CORS headers in success response', async (): Promise<void> => {
      const req = makeRequest({ opening_float: 100 })
      const res = await handler(req, makeFetch() as typeof fetch, TEST_ENV)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    })

    it('accepts manager role (rank >= owner is needed; manager is below — should 403)', async (): Promise<void> => {
      // manager rank < owner rank → should be forbidden
      const req = makeRequest({ opening_float: 100 })
      const res = await handler(req, makeFetch({ role: 'manager' }) as typeof fetch, TEST_ENV)
      expect(res.status).toBe(403)
    })

    it('accepts admin role (alias for owner)', async (): Promise<void> => {
      const req = makeRequest({ opening_float: 100 })
      const res = await handler(req, makeFetch({ role: 'admin' }) as typeof fetch, TEST_ENV)
      expect(res.status).toBe(200)
      const json = await res.json() as { success: boolean }
      expect(json.success).toBe(true)
    })
  })

  describe('POST — invalid body', () => {
    it('returns 400 when body is malformed JSON', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/open_shift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-token' },
        body: 'not-valid-json',
      })
      const res = await handler(req, makeFetch() as typeof fetch, TEST_ENV)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('Invalid request body')
    })

    it('returns 400 when body is null', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/open_shift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-token' },
        body: 'null',
      })
      const res = await handler(req, makeFetch() as typeof fetch, TEST_ENV)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('Invalid request body')
    })

    it('returns CORS headers on error responses', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/open_shift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-token' },
        body: 'bad{json',
      })
      const res = await handler(req, makeFetch() as typeof fetch, TEST_ENV)
      expect(res.status).toBe(400)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    })
  })

  describe('POST — missing required fields', () => {
    it('returns 400 when opening_float is absent', async (): Promise<void> => {
      const req = makeRequest({})
      const res = await handler(req, makeFetch() as typeof fetch, TEST_ENV)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('opening_float is required')
    })

    it('returns 400 when opening_float is a string instead of a number', async (): Promise<void> => {
      const req = makeRequest({ opening_float: '100' })
      const res = await handler(req, makeFetch() as typeof fetch, TEST_ENV)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('opening_float is required')
    })

    it('returns 400 when opening_float is null', async (): Promise<void> => {
      const req = makeRequest({ opening_float: null })
      const res = await handler(req, makeFetch() as typeof fetch, TEST_ENV)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('opening_float is required')
    })

    it('returns CORS headers on validation error', async (): Promise<void> => {
      const req = makeRequest({})
      const res = await handler(req, makeFetch() as typeof fetch, TEST_ENV)
      expect(res.status).toBe(400)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    })
  })

  describe('POST — conflict: already has open shift', () => {
    it('returns 409 when staff already has an open shift', async (): Promise<void> => {
      const req = makeRequest({ opening_float: 100 })
      const res = await handler(req, makeFetch({ hasOpenShift: true }) as typeof fetch, TEST_ENV)
      expect(res.status).toBe(409)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('User already has an open shift')
    })
  })

  describe('POST — server config error', () => {
    it('returns 500 when env is null', async (): Promise<void> => {
      const req = makeRequest({ opening_float: 100 })
      const res = await handler(req, makeFetch() as typeof fetch, null)
      expect(res.status).toBe(500)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
    })
  })
})
