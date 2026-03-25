import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { handler } from './index'
import type { HandlerEnv } from './index'

const TEST_ENV: HandlerEnv = {
  supabaseUrl: 'https://test.supabase.co',
  serviceKey: 'test-service-key',
}

function makeRequest(body: unknown, method = 'POST'): Request {
  return new Request('https://test.supabase.co/functions/v1/toggle_user_active', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeFetchResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  } as unknown as Response
}

describe('handler (toggle_user_active)', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('returns 200 on OPTIONS (preflight)', async () => {
    const req = new Request('https://test.supabase.co/functions/v1/toggle_user_active', {
      method: 'OPTIONS',
    })
    const res = await handler(req, mockFetch, TEST_ENV)
    expect(res.status).toBe(200)
  })

  it('returns 400 when user_id is missing', async () => {
    const req = makeRequest({ is_active: false })
    const res = await handler(req, mockFetch, TEST_ENV)
    expect(res.status).toBe(400)
    const body = await res.json() as { success: boolean; error: string }
    expect(body.success).toBe(false)
    expect(body.error).toMatch(/user_id/)
  })

  it('returns 400 when is_active is missing', async () => {
    const req = makeRequest({ user_id: 'user-1' })
    const res = await handler(req, mockFetch, TEST_ENV)
    expect(res.status).toBe(400)
    const body = await res.json() as { success: boolean; error: string }
    expect(body.success).toBe(false)
    expect(body.error).toMatch(/is_active/)
  })

  it('returns 200 and updates DB + bans auth user on deactivation', async () => {
    mockFetch
      .mockResolvedValueOnce(makeFetchResponse({}, true, 204))   // PATCH users
      .mockResolvedValueOnce(makeFetchResponse({}, true, 200))   // PUT auth ban

    const req = makeRequest({ user_id: 'user-1', is_active: false })
    const res = await handler(req, mockFetch, TEST_ENV)
    expect(res.status).toBe(200)
    const body = await res.json() as { success: boolean }
    expect(body.success).toBe(true)

    // Should PATCH the DB with is_active: false
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/rest/v1/users'),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ is_active: false }),
      }),
    )

    // Should PUT the auth ban
    expect(mockFetch).toHaveBeenCalledWith(
      `${TEST_ENV.supabaseUrl}/auth/v1/admin/users/user-1`,
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ ban_duration: '876600h' }),
      }),
    )
  })

  it('returns 200 and unbans auth user on reactivation', async () => {
    mockFetch
      .mockResolvedValueOnce(makeFetchResponse({}, true, 204))   // PATCH users
      .mockResolvedValueOnce(makeFetchResponse({}, true, 200))   // PUT auth unban

    const req = makeRequest({ user_id: 'user-1', is_active: true })
    const res = await handler(req, mockFetch, TEST_ENV)
    expect(res.status).toBe(200)

    expect(mockFetch).toHaveBeenCalledWith(
      `${TEST_ENV.supabaseUrl}/auth/v1/admin/users/user-1`,
      expect.objectContaining({
        body: JSON.stringify({ ban_duration: 'none' }),
      }),
    )
  })

  it('returns 500 when DB PATCH fails', async () => {
    mockFetch.mockResolvedValueOnce(makeFetchResponse({}, false, 500))

    const req = makeRequest({ user_id: 'user-1', is_active: false })
    const res = await handler(req, mockFetch, TEST_ENV)
    expect(res.status).toBe(500)
  })

  it('still returns 200 when auth ban/unban fails (best-effort)', async () => {
    mockFetch
      .mockResolvedValueOnce(makeFetchResponse({}, true, 204))   // PATCH users OK
      .mockResolvedValueOnce(makeFetchResponse({}, false, 500))  // PUT auth fails

    const req = makeRequest({ user_id: 'user-1', is_active: false })
    const res = await handler(req, mockFetch, TEST_ENV)
    expect(res.status).toBe(200)
  })

  it('returns 500 when env is null', async () => {
    const req = makeRequest({ user_id: 'user-1', is_active: false })
    const res = await handler(req, mockFetch, null)
    expect(res.status).toBe(500)
  })
})
