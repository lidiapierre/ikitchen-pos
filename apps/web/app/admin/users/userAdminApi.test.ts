import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { callCreateUser, callToggleUserActive } from './userAdminApi'

const BASE_URL = 'https://test.supabase.co'
const API_KEY = 'test-api-key'

function makeFetchResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const MOCK_USER = {
  id: 'user-1',
  email: 'staff@restaurant.com',
  name: 'Ali Hassan',
  role: 'server',
  is_active: true,
  created_at: '2026-03-25T00:00:00Z',
}

describe('callCreateUser', () => {
  it('returns the created user from response data', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeFetchResponse({ success: true, data: { user: MOCK_USER } }),
    )
    const user = await callCreateUser(BASE_URL, API_KEY, {
      email: 'staff@restaurant.com',
      name: 'Ali Hassan',
      role: 'server',
      restaurantId: 'rest-1',
      callerRole: 'owner',
    })
    expect(user).toEqual(MOCK_USER)
  })

  it('sends POST to /functions/v1/create_user with correct body', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeFetchResponse({ success: true, data: { user: MOCK_USER } }),
    )
    await callCreateUser(BASE_URL, API_KEY, {
      email: 'staff@restaurant.com',
      name: 'Ali Hassan',
      role: 'server',
      restaurantId: 'rest-1',
      callerRole: 'owner',
    })
    expect(fetch).toHaveBeenCalledWith(
      `${BASE_URL}/functions/v1/create_user`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ apikey: API_KEY }),
        body: JSON.stringify({
          email: 'staff@restaurant.com',
          name: 'Ali Hassan',
          role: 'server',
          restaurant_id: 'rest-1',
          caller_role: 'owner',
        }),
      }),
    )
  })

  it('sends null name when name is undefined', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeFetchResponse({ success: true, data: { user: MOCK_USER } }),
    )
    await callCreateUser(BASE_URL, API_KEY, {
      email: 'staff@restaurant.com',
      role: 'server',
      restaurantId: 'rest-1',
      callerRole: 'owner',
    })
    expect(fetch).toHaveBeenCalledWith(
      `${BASE_URL}/functions/v1/create_user`,
      expect.objectContaining({
        body: JSON.stringify({
          email: 'staff@restaurant.com',
          name: null,
          role: 'server',
          restaurant_id: 'rest-1',
          caller_role: 'owner',
        }),
      }),
    )
  })

  it('throws with server error message on non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeFetchResponse({ success: false, error: 'email already exists' }, false, 400),
    )
    await expect(
      callCreateUser(BASE_URL, API_KEY, {
        email: 'staff@restaurant.com',
        role: 'server',
        restaurantId: 'rest-1',
        callerRole: 'owner',
      }),
    ).rejects.toThrow('email already exists')
  })

  it('throws when success is false on ok response', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeFetchResponse({ success: false, error: 'User creation returned no data' }),
    )
    await expect(
      callCreateUser(BASE_URL, API_KEY, {
        email: 'staff@restaurant.com',
        role: 'server',
        restaurantId: 'rest-1',
        callerRole: 'owner',
      }),
    ).rejects.toThrow('User creation returned no data')
  })
})

describe('callToggleUserActive', () => {
  it('sends POST to /functions/v1/toggle_user_active with correct body (deactivate)', async () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchResponse({ success: true }))
    await callToggleUserActive(BASE_URL, API_KEY, 'user-1', false)
    expect(fetch).toHaveBeenCalledWith(
      `${BASE_URL}/functions/v1/toggle_user_active`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ apikey: API_KEY }),
        body: JSON.stringify({ user_id: 'user-1', is_active: false }),
      }),
    )
  })

  it('sends POST with is_active: true to reactivate', async () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchResponse({ success: true }))
    await callToggleUserActive(BASE_URL, API_KEY, 'user-2', true)
    expect(fetch).toHaveBeenCalledWith(
      `${BASE_URL}/functions/v1/toggle_user_active`,
      expect.objectContaining({
        body: JSON.stringify({ user_id: 'user-2', is_active: true }),
      }),
    )
  })

  it('resolves without error on success', async () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchResponse({ success: true }))
    await expect(callToggleUserActive(BASE_URL, API_KEY, 'user-1', false)).resolves.toBeUndefined()
  })

  it('throws with server error message on non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeFetchResponse({ success: false, error: 'User not found' }, false, 404),
    )
    await expect(callToggleUserActive(BASE_URL, API_KEY, 'user-1', false)).rejects.toThrow(
      'User not found',
    )
  })
})
