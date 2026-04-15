import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { handler } from './index'
import type { HandlerEnv } from './index'

const TEST_ENV: HandlerEnv = {
  supabaseUrl: 'https://test.supabase.co',
  serviceKey: 'test-service-key',
}

const BASE_URL = 'https://test.supabase.co/functions/v1/provision_restaurant'

function makeRequest(body: unknown, method = 'POST'): Request {
  return new Request(BASE_URL, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeJsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  } as unknown as Response
}

const VALID_PAYLOAD = {
  name: 'Test Restaurant',
  slug: 'test-restaurant',
  owner_email: 'owner@test.com',
  owner_password: 'SecurePass123',
}

describe('provision_restaurant handler', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  // ---- preflight ----

  it('returns 204 on OPTIONS preflight', async () => {
    const req = new Request(BASE_URL, { method: 'OPTIONS' })
    const res = await handler(req, mockFetch, TEST_ENV)
    expect(res.status).toBe(204)
  })

  it('returns 200 on GET /health', async () => {
    const req = new Request(`${BASE_URL}/health`, { method: 'GET' })
    const res = await handler(req, mockFetch, TEST_ENV)
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean }
    expect(body.ok).toBe(true)
  })

  // ---- validation ----

  it('returns 400 when name is missing', async () => {
    const req = makeRequest({ slug: 'abc', owner_email: 'a@b.com', owner_password: 'pass1234' })
    const res = await handler(req, mockFetch, TEST_ENV)
    expect(res.status).toBe(400)
    const body = await res.json() as { success: boolean; error: string }
    expect(body.success).toBe(false)
    expect(body.error).toMatch(/name/i)
  })

  it('returns 400 when slug is invalid', async () => {
    const req = makeRequest({ name: 'Test', slug: 'UPPER CASE!', owner_email: 'a@b.com', owner_password: 'pass1234' })
    const res = await handler(req, mockFetch, TEST_ENV)
    expect(res.status).toBe(400)
    const body = await res.json() as { success: boolean; error: string }
    expect(body.success).toBe(false)
    expect(body.error).toMatch(/slug/i)
  })

  it('returns 400 when owner_email is missing', async () => {
    const req = makeRequest({ name: 'Test', slug: 'test', owner_password: 'pass1234' })
    const res = await handler(req, mockFetch, TEST_ENV)
    expect(res.status).toBe(400)
    const body = await res.json() as { success: boolean; error: string }
    expect(body.success).toBe(false)
    expect(body.error).toMatch(/owner_email/i)
  })

  // ---- happy path: password flow (email_confirm: true) ----

  it('sends email_confirm: true when owner_password is provided (#420)', async () => {
    // mock restaurant creation
    mockFetch
      .mockResolvedValueOnce(
        makeJsonResponse([{ id: 'rest-1', name: 'Test Restaurant', slug: 'test-restaurant', timezone: 'Asia/Dhaka', created_at: '2026-01-01T00:00:00Z' }]),
      )
      // mock admin createUser
      .mockResolvedValueOnce(makeJsonResponse({ id: 'auth-user-1' }))
      // mock user row creation
      .mockResolvedValueOnce(makeJsonResponse(null, true, 201))
      // mock config seed
      .mockResolvedValueOnce(makeJsonResponse(null, true, 201))

    const req = makeRequest(VALID_PAYLOAD)
    const res = await handler(req, mockFetch, TEST_ENV)
    expect(res.status).toBe(200)

    // Find the admin createUser call
    const createUserCall = mockFetch.mock.calls.find(
      ([url]: [string]) => (url as string).includes('/auth/v1/admin/users'),
    )
    expect(createUserCall).toBeDefined()
    const body = JSON.parse((createUserCall![1] as RequestInit).body as string) as Record<string, unknown>
    expect(body['email_confirm']).toBe(true)
    expect(body['password']).toBe(VALID_PAYLOAD.owner_password)
    expect(body['email']).toBe(VALID_PAYLOAD.owner_email)
  })

  // ---- invite path (no password) ----

  it('uses /auth/v1/invite when no owner_password is provided', async () => {
    // mock restaurant creation
    mockFetch
      .mockResolvedValueOnce(
        makeJsonResponse([{ id: 'rest-2', name: 'Invite Restaurant', slug: 'invite-restaurant', timezone: 'Asia/Dhaka', created_at: '2026-01-01T00:00:00Z' }]),
      )
      // mock invite
      .mockResolvedValueOnce(makeJsonResponse({ id: 'auth-user-2' }))
      // mock user row creation
      .mockResolvedValueOnce(makeJsonResponse(null, true, 201))
      // mock config seed
      .mockResolvedValueOnce(makeJsonResponse(null, true, 201))

    const req = makeRequest({ name: 'Invite Restaurant', slug: 'invite-restaurant', owner_email: 'invite@test.com' })
    const res = await handler(req, mockFetch, TEST_ENV)
    expect(res.status).toBe(200)

    // Invite call should hit /auth/v1/invite, NOT /auth/v1/admin/users
    const inviteCall = mockFetch.mock.calls.find(
      ([url]: [string]) => (url as string).includes('/auth/v1/invite'),
    )
    expect(inviteCall).toBeDefined()

    const adminCreateCall = mockFetch.mock.calls.find(
      ([url]: [string]) => (url as string).includes('/auth/v1/admin/users'),
    )
    expect(adminCreateCall).toBeUndefined()
  })

  // ---- error handling ----

  it('cleans up restaurant row when createUser fails', async () => {
    // mock restaurant creation success
    mockFetch
      .mockResolvedValueOnce(
        makeJsonResponse([{ id: 'rest-3', name: 'Test', slug: 'test-3', timezone: 'Asia/Dhaka', created_at: '2026-01-01T00:00:00Z' }]),
      )
      // mock admin createUser failure
      .mockResolvedValueOnce(makeJsonResponse({ msg: 'email already exists' }, false, 422))
      // mock cleanup DELETE
      .mockResolvedValueOnce(makeJsonResponse(null, true, 204))

    const req = makeRequest(VALID_PAYLOAD)
    const res = await handler(req, mockFetch, TEST_ENV)
    expect(res.status).toBe(400)

    // Cleanup DELETE should have been called
    const deleteCall = mockFetch.mock.calls.find(
      ([url, init]: [string, RequestInit]) =>
        (url as string).includes('/rest/v1/restaurants') && (init?.method as string) === 'DELETE',
    )
    expect(deleteCall).toBeDefined()
  })

  it('returns 400 when restaurant creation returns duplicate slug error', async () => {
    mockFetch.mockResolvedValueOnce(
      makeJsonResponse({ message: 'duplicate key value violates unique constraint' }, false, 409),
    )

    const req = makeRequest(VALID_PAYLOAD)
    const res = await handler(req, mockFetch, TEST_ENV)
    expect(res.status).toBe(400)
    const body = await res.json() as { success: boolean; error: string }
    expect(body.success).toBe(false)
    expect(body.error).toContain('already taken')
  })
})
