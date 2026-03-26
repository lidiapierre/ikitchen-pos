import { describe, it, expect, vi } from 'vitest'
import { handler } from './index'
import type { HandlerEnv } from './index'

const TEST_ENV: HandlerEnv = {
  anthropicApiKey: 'test-key',
  supabaseUrl: 'https://test.supabase.co',
  serviceKey: 'test-service-key',
}

const OWNER_USER_ID = '11111111-1111-1111-1111-111111111111'

/**
 * Build a mock fetchFn that handles auth verification (Supabase) and Claude API calls.
 * Matches on URL patterns: /auth/v1/user, /rest/v1/users, api.anthropic.com
 */
function makeAuthFetch(options: {
  role?: string
  authFail?: boolean
  claudeResponse?: string | null
  claudeStatus?: number
} = {}): ReturnType<typeof vi.fn> {
  const { role = 'owner', authFail = false, claudeResponse = null, claudeStatus = 200 } = options

  return vi.fn().mockImplementation(async (url: string) => {
    // JWT verification
    if (url.includes('/auth/v1/user')) {
      if (authFail) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
      }
      return new Response(JSON.stringify({ id: OWNER_USER_ID }), { status: 200 })
    }

    // Role lookup
    if (url.includes('/rest/v1/users') && url.includes('select=role')) {
      return new Response(JSON.stringify([{ role }]), { status: 200 })
    }

    // Claude API
    if (url.includes('api.anthropic.com')) {
      if (claudeStatus !== 200) {
        return new Response('error', { status: claudeStatus })
      }
      if (claudeResponse !== null) {
        return new Response(
          JSON.stringify({ content: [{ type: 'text', text: claudeResponse }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
    }

    return new Response('Not found', { status: 404 })
  })
}

function makeRequest(body: unknown, method = 'POST', token?: string): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token !== undefined) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return new Request('https://example.com/extract_menu_item', {
    method,
    headers,
    body: method !== 'GET' && method !== 'HEAD' ? JSON.stringify(body) : undefined,
  })
}

function makeAuthRequest(body: unknown, method = 'POST'): Request {
  return makeRequest(body, method, 'valid-token')
}

function mockClaudeSuccess(text: string): ReturnType<typeof vi.fn> {
  return makeAuthFetch({ claudeResponse: text })
}

describe('extract_menu_item handler', () => {
  it('handles OPTIONS preflight', async () => {
    const req = new Request('https://example.com', { method: 'OPTIONS' })
    const res = await handler(req, makeAuthFetch() as typeof fetch, TEST_ENV)
    expect(res.status).toBe(204)
  })

  it('returns 405 for non-POST methods', async () => {
    const req = new Request('https://example.com', { method: 'GET' })
    const res = await handler(req, makeAuthFetch() as typeof fetch, TEST_ENV)
    expect(res.status).toBe(405)
    const json = await res.json()
    expect(json.success).toBe(false)
  })

  describe('auth enforcement', () => {
    it('returns 401 when Authorization header is missing', async () => {
      const req = makeRequest({ file_data: 'aGVsbG8=', media_type: 'image/jpeg' })
      const res = await handler(req, makeAuthFetch() as typeof fetch, TEST_ENV)
      expect(res.status).toBe(401)
      const json = await res.json()
      expect(json.success).toBe(false)
      expect(json.error).toBe('Unauthorized')
    })

    it('returns 401 when JWT is rejected by Supabase', async () => {
      const req = makeRequest({ file_data: 'aGVsbG8=', media_type: 'image/jpeg' }, 'POST', 'bad-token')
      const res = await handler(req, makeAuthFetch({ authFail: true }) as typeof fetch, TEST_ENV)
      expect(res.status).toBe(401)
      const json = await res.json()
      expect(json.success).toBe(false)
      expect(json.error).toBe('Unauthorized')
    })

    it('returns 403 when caller role is too low (server role not allowed)', async () => {
      const req = makeAuthRequest({ file_data: 'aGVsbG8=', media_type: 'image/jpeg' })
      const res = await handler(req, makeAuthFetch({ role: 'server' }) as typeof fetch, TEST_ENV)
      expect(res.status).toBe(403)
      const json = await res.json()
      expect(json.success).toBe(false)
      expect(json.error).toBe('Forbidden')
    })
  })

  it('returns 400 when file_data is missing', async () => {
    const req = makeAuthRequest({ media_type: 'image/jpeg' })
    const res = await handler(req, makeAuthFetch() as typeof fetch, TEST_ENV)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error).toContain('file_data')
  })

  it('returns 400 when media_type is missing', async () => {
    const req = makeAuthRequest({ file_data: 'base64data' })
    const res = await handler(req, makeAuthFetch() as typeof fetch, TEST_ENV)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error).toContain('media_type')
  })

  it('returns 400 for unsupported media type', async () => {
    const req = makeAuthRequest({ file_data: 'base64data', media_type: 'text/plain' })
    const res = await handler(req, makeAuthFetch() as typeof fetch, TEST_ENV)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.success).toBe(false)
  })

  it('returns 500 when env is null', async () => {
    const req = makeAuthRequest({ file_data: 'base64data', media_type: 'image/jpeg' })
    const res = await handler(req, makeAuthFetch() as typeof fetch, null)
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.success).toBe(false)
  })

  it('returns extracted data for a valid image request', async () => {
    const extractedJson = JSON.stringify({
      name: 'Grilled Salmon',
      description: 'Fresh Atlantic salmon',
      price: 18.5,
      category: 'Mains',
    })
    const mockFetch = mockClaudeSuccess(extractedJson)
    const req = makeAuthRequest({ file_data: 'aGVsbG8=', media_type: 'image/jpeg' })
    const res = await handler(req, mockFetch as typeof fetch, TEST_ENV)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.data.name).toBe('Grilled Salmon')
    expect(json.data.price).toBe(18.5)
    expect(json.data.category).toBe('Mains')
  })

  it('returns extracted data for a valid PDF request', async () => {
    const extractedJson = JSON.stringify({ name: 'Set Menu', price: 25.0 })
    const mockFetch = mockClaudeSuccess(extractedJson)
    const req = makeAuthRequest({ file_data: 'aGVsbG8=', media_type: 'application/pdf' })
    const res = await handler(req, mockFetch as typeof fetch, TEST_ENV)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.data.name).toBe('Set Menu')
  })

  it('handles Claude response wrapped in markdown code fences', async () => {
    const extractedJson = '```json\n{"name": "Tiramisu", "price": 7.5}\n```'
    const mockFetch = mockClaudeSuccess(extractedJson)
    const req = makeAuthRequest({ file_data: 'aGVsbG8=', media_type: 'image/png' })
    const res = await handler(req, mockFetch as typeof fetch, TEST_ENV)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data.name).toBe('Tiramisu')
  })

  it('omits fields with invalid types from Claude response', async () => {
    const extractedJson = JSON.stringify({ name: 'Valid Name', price: 'not-a-number' })
    const mockFetch = mockClaudeSuccess(extractedJson)
    const req = makeAuthRequest({ file_data: 'aGVsbG8=', media_type: 'image/webp' })
    const res = await handler(req, mockFetch as typeof fetch, TEST_ENV)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.data.name).toBe('Valid Name')
    expect(json.data.price).toBeUndefined()
  })

  it('returns 502 when Claude API returns non-OK status', async () => {
    const mockFetch = makeAuthFetch({ claudeStatus: 500 })
    const req = makeAuthRequest({ file_data: 'aGVsbG8=', media_type: 'image/jpeg' })
    const res = await handler(req, mockFetch as typeof fetch, TEST_ENV)
    expect(res.status).toBe(502)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error).toContain('AI extraction failed')
  })

  it('returns 502 when Claude returns invalid JSON', async () => {
    const mockFetch = mockClaudeSuccess('this is not json at all')
    const req = makeAuthRequest({ file_data: 'aGVsbG8=', media_type: 'image/jpeg' })
    const res = await handler(req, mockFetch as typeof fetch, TEST_ENV)
    expect(res.status).toBe(502)
    const json = await res.json()
    expect(json.success).toBe(false)
  })

  it('includes CORS headers in response', async () => {
    const extractedJson = JSON.stringify({ name: 'Test' })
    const mockFetch = mockClaudeSuccess(extractedJson)
    const req = makeAuthRequest({ file_data: 'aGVsbG8=', media_type: 'image/jpeg' })
    const res = await handler(req, mockFetch as typeof fetch, TEST_ENV)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })
})
