import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { handler, canCreateRole } from './index'
import type { HandlerEnv } from './index'

const TEST_ENV: HandlerEnv = {
  supabaseUrl: 'https://test.supabase.co',
  serviceKey: 'test-service-key',
}

function makeRequest(body: unknown, method = 'POST'): Request {
  return new Request('https://test.supabase.co/functions/v1/create_user', {
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

// ---- canCreateRole unit tests ----

describe('canCreateRole', () => {
  it('owner can create manager', () => {
    expect(canCreateRole('owner', 'manager')).toBe(true)
  })

  it('owner can create server', () => {
    expect(canCreateRole('owner', 'server')).toBe(true)
  })

  it('owner can create kitchen', () => {
    expect(canCreateRole('owner', 'kitchen')).toBe(true)
  })

  it('manager cannot create manager', () => {
    expect(canCreateRole('manager', 'manager')).toBe(false)
  })

  it('manager can create server', () => {
    expect(canCreateRole('manager', 'server')).toBe(true)
  })

  it('manager can create kitchen', () => {
    expect(canCreateRole('manager', 'kitchen')).toBe(true)
  })

  it('server cannot create any role', () => {
    expect(canCreateRole('server', 'server')).toBe(false)
    expect(canCreateRole('server', 'kitchen')).toBe(false)
    expect(canCreateRole('server', 'manager')).toBe(false)
  })

  it('unknown caller cannot create any role', () => {
    expect(canCreateRole('unknown', 'server')).toBe(false)
  })

  it('owner cannot create owner', () => {
    // owner is not a valid target role for creation
    expect(canCreateRole('owner', 'owner')).toBe(false)
  })
})

// ---- handler integration tests ----

describe('handler', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockFetch = vi.fn()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('returns 200 with OK on OPTIONS (preflight)', async () => {
    const req = new Request('https://test.supabase.co/functions/v1/create_user', {
      method: 'OPTIONS',
    })
    const res = await handler(req, mockFetch, TEST_ENV)
    expect(res.status).toBe(200)
  })

  it('returns 400 when email is missing', async () => {
    const req = makeRequest({
      role: 'server',
      restaurant_id: 'rest-1',
      caller_role: 'owner',
    })
    const res = await handler(req, mockFetch, TEST_ENV)
    expect(res.status).toBe(400)
    const body = await res.json() as { success: boolean; error: string }
    expect(body.success).toBe(false)
    expect(body.error).toMatch(/email/)
  })

  it('returns 400 when role is invalid', async () => {
    const req = makeRequest({
      email: 'staff@test.com',
      role: 'owner', // invalid target role
      restaurant_id: 'rest-1',
      caller_role: 'owner',
    })
    const res = await handler(req, mockFetch, TEST_ENV)
    expect(res.status).toBe(400)
    const body = await res.json() as { success: boolean; error: string }
    expect(body.success).toBe(false)
    expect(body.error).toMatch(/role/)
  })

  it('returns 403 when manager tries to create a manager', async () => {
    const req = makeRequest({
      email: 'staff@test.com',
      role: 'manager',
      restaurant_id: 'rest-1',
      caller_role: 'manager',
    })
    const res = await handler(req, mockFetch, TEST_ENV)
    expect(res.status).toBe(403)
    const body = await res.json() as { success: boolean; error: string }
    expect(body.success).toBe(false)
    expect(body.error).toMatch(/cannot create/)
  })

  it('returns 200 and calls invite + insert on valid owner request', async () => {
    const authUser = { id: 'auth-user-id', email: 'staff@test.com' }
    const dbRow = {
      id: 'auth-user-id',
      email: 'staff@test.com',
      name: 'Ali Hassan',
      role: 'server',
      is_active: true,
      created_at: '2026-03-25T00:00:00Z',
    }

    mockFetch
      .mockResolvedValueOnce(makeFetchResponse(authUser)) // invite
      .mockResolvedValueOnce(makeFetchResponse([dbRow]))  // db insert

    const req = makeRequest({
      email: 'staff@test.com',
      name: 'Ali Hassan',
      role: 'server',
      restaurant_id: 'rest-1',
      caller_role: 'owner',
    })
    const res = await handler(req, mockFetch, TEST_ENV)
    expect(res.status).toBe(200)
    const body = await res.json() as { success: boolean; data: { user: typeof dbRow } }
    expect(body.success).toBe(true)
    expect(body.data.user.email).toBe('staff@test.com')

    // Should have called invite endpoint
    expect(mockFetch).toHaveBeenCalledWith(
      `${TEST_ENV.supabaseUrl}/auth/v1/invite`,
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('rolls back auth user if DB insert fails', async () => {
    const authUser = { id: 'auth-user-id', email: 'staff@test.com' }
    mockFetch
      .mockResolvedValueOnce(makeFetchResponse(authUser))            // invite
      .mockResolvedValueOnce(makeFetchResponse({}, false, 500))      // db insert fails
      .mockResolvedValueOnce(makeFetchResponse({}, true, 200))       // delete auth user

    const req = makeRequest({
      email: 'staff@test.com',
      role: 'server',
      restaurant_id: 'rest-1',
      caller_role: 'owner',
    })
    const res = await handler(req, mockFetch, TEST_ENV)
    expect(res.status).toBe(500)

    // Should have called DELETE on the auth user
    expect(mockFetch).toHaveBeenCalledWith(
      `${TEST_ENV.supabaseUrl}/auth/v1/admin/users/${authUser.id}`,
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('returns 500 when env is null', async () => {
    const req = makeRequest({
      email: 'staff@test.com',
      role: 'server',
      restaurant_id: 'rest-1',
      caller_role: 'owner',
    })
    const res = await handler(req, mockFetch, null)
    expect(res.status).toBe(500)
  })
})
