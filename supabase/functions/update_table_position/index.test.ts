import { describe, it, expect, vi } from 'vitest'
import { handler, corsHeaders, type HandlerEnv } from './index'

const TEST_TABLE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

const mockEnv: HandlerEnv = {
  supabaseUrl: 'https://test.supabase.co',
  serviceKey: 'test-service-key',
}

const mockAuth = {
  actorId: 'user-123',
  role: 'owner',
}

vi.mock('../_shared/auth.ts', () => ({
  verifyAndGetCaller: vi.fn().mockResolvedValue(mockAuth),
}))

function makePatchFetch(patchStatus = 204): (input: string, init?: RequestInit) => Promise<Response> {
  return vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase()
    if (method === 'PATCH') {
      return Promise.resolve(new Response(null, { status: patchStatus }))
    }
    return Promise.resolve(new Response('[]', { status: 200 }))
  })
}

function makeAuthRequest(body: unknown): Request {
  return new Request('http://localhost/functions/v1/update_table_position', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-jwt' },
    body: JSON.stringify(body),
  })
}

describe('update_table_position handler', () => {
  describe('OPTIONS preflight', () => {
    it('returns 204 with CORS headers', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/update_table_position', {
        method: 'OPTIONS',
      })
      const res = await handler(req)
      expect(res.status).toBe(204)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST')
    })

    it('includes x-demo-staff-id in allowed headers', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/update_table_position', {
        method: 'OPTIONS',
      })
      const res = await handler(req)
      expect(res.headers.get('Access-Control-Allow-Headers')).toContain('x-demo-staff-id')
    })

    it('returns null body', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/update_table_position', {
        method: 'OPTIONS',
      })
      const res = await handler(req)
      const body = await res.text()
      expect(body).toBe('')
    })
  })

  describe('GET /health', () => {
    it('returns ok:true', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/update_table_position/health', {
        method: 'GET',
      })
      const res = await handler(req)
      expect(res.status).toBe(200)
      const json = await res.json() as { ok: boolean; function: string }
      expect(json.ok).toBe(true)
      expect(json.function).toBe('update_table_position')
    })
  })

  describe('POST — missing env', () => {
    it('returns 500 when env is null', async (): Promise<void> => {
      const req = makeAuthRequest({ table_id: TEST_TABLE_ID, grid_x: 0, grid_y: 0 })
      const res = await handler(req, fetch, null)
      expect(res.status).toBe(500)
      const json = await res.json() as { success: boolean }
      expect(json.success).toBe(false)
    })
  })

  describe('POST — validation', () => {
    it('returns 400 when table_id is missing', async (): Promise<void> => {
      const req = makeAuthRequest({ grid_x: 1, grid_y: 2 })
      const res = await handler(req, makePatchFetch(), mockEnv)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toMatch(/table_id/)
    })

    it('returns 400 when table_id is empty string', async (): Promise<void> => {
      const req = makeAuthRequest({ table_id: '', grid_x: 1, grid_y: 2 })
      const res = await handler(req, makePatchFetch(), mockEnv)
      expect(res.status).toBe(400)
    })

    it('returns 400 when grid_x is negative', async (): Promise<void> => {
      const req = makeAuthRequest({ table_id: TEST_TABLE_ID, grid_x: -1, grid_y: 0 })
      const res = await handler(req, makePatchFetch(), mockEnv)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.error).toMatch(/grid_x/)
    })

    it('returns 400 when grid_y is not an integer', async (): Promise<void> => {
      const req = makeAuthRequest({ table_id: TEST_TABLE_ID, grid_x: 0, grid_y: 1.5 })
      const res = await handler(req, makePatchFetch(), mockEnv)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.error).toMatch(/grid_y/)
    })

    it('returns 400 when body is not JSON', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/update_table_position', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-jwt' },
        body: 'not json',
      })
      const res = await handler(req, makePatchFetch(), mockEnv)
      expect(res.status).toBe(400)
    })
  })

  describe('POST — happy path', () => {
    it('returns 200 success when placing a table', async (): Promise<void> => {
      const req = makeAuthRequest({ table_id: TEST_TABLE_ID, grid_x: 3, grid_y: 5 })
      const res = await handler(req, makePatchFetch(), mockEnv)
      expect(res.status).toBe(200)
      const json = await res.json() as { success: boolean }
      expect(json.success).toBe(true)
    })

    it('returns 200 success when clearing a table position (null)', async (): Promise<void> => {
      const req = makeAuthRequest({ table_id: TEST_TABLE_ID, grid_x: null, grid_y: null })
      const res = await handler(req, makePatchFetch(), mockEnv)
      expect(res.status).toBe(200)
      const json = await res.json() as { success: boolean }
      expect(json.success).toBe(true)
    })

    it('calls PATCH with correct table_id and grid values', async (): Promise<void> => {
      const mockFetch = makePatchFetch()
      const req = makeAuthRequest({ table_id: TEST_TABLE_ID, grid_x: 7, grid_y: 2 })
      await handler(req, mockFetch, mockEnv)

      const calls = (mockFetch as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit][]
      const patchCall = calls.find(([, init]) => (init?.method ?? '').toUpperCase() === 'PATCH')
      expect(patchCall).toBeDefined()
      expect(patchCall![0]).toContain(TEST_TABLE_ID)

      const body = JSON.parse(patchCall![1].body as string) as { grid_x: number; grid_y: number }
      expect(body.grid_x).toBe(7)
      expect(body.grid_y).toBe(2)
    })

    it('includes CORS headers in success response', async (): Promise<void> => {
      const req = makeAuthRequest({ table_id: TEST_TABLE_ID, grid_x: 0, grid_y: 0 })
      const res = await handler(req, makePatchFetch(), mockEnv)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(corsHeaders['Access-Control-Allow-Origin'])
    })

    it('accepts grid position of 0,0', async (): Promise<void> => {
      const req = makeAuthRequest({ table_id: TEST_TABLE_ID, grid_x: 0, grid_y: 0 })
      const res = await handler(req, makePatchFetch(), mockEnv)
      expect(res.status).toBe(200)
    })
  })

  describe('POST — DB failure', () => {
    it('returns 500 when PATCH fails', async (): Promise<void> => {
      const req = makeAuthRequest({ table_id: TEST_TABLE_ID, grid_x: 1, grid_y: 1 })
      const res = await handler(req, makePatchFetch(500), mockEnv)
      expect(res.status).toBe(500)
      const json = await res.json() as { success: boolean }
      expect(json.success).toBe(false)
    })
  })

  describe('POST — auth failure', () => {
    it('returns 401 when no token provided', async (): Promise<void> => {
      const { verifyAndGetCaller } = await import('../_shared/auth.ts')
      vi.mocked(verifyAndGetCaller).mockResolvedValueOnce({
        error: 'Missing or invalid authorization header',
        status: 401,
      })

      const req = new Request('http://localhost/functions/v1/update_table_position', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_id: TEST_TABLE_ID, grid_x: 0, grid_y: 0 }),
      })
      const res = await handler(req, makePatchFetch(), mockEnv)
      expect(res.status).toBe(401)
      const json = await res.json() as { success: boolean }
      expect(json.success).toBe(false)
    })
  })
})
