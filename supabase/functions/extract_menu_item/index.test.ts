import { describe, it, expect, vi } from 'vitest'
import { handler } from './index'
import type { HandlerEnv } from './index'

const TEST_ENV: HandlerEnv = { anthropicApiKey: 'test-key' }
const VALID_STAFF_ID = '00000000-0000-0000-0000-000000000001'

function makeRequest(body: unknown, method = 'POST', staffId?: string): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (staffId !== undefined) headers['x-demo-staff-id'] = staffId
  return new Request('https://example.com/extract_menu_item', {
    method,
    headers,
    body: JSON.stringify(body),
  })
}

function makeAuthRequest(body: unknown, method = 'POST'): Request {
  return makeRequest(body, method, VALID_STAFF_ID)
}

function mockClaudeSuccess(text: string): typeof fetch {
  return vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        content: [{ type: 'text', text }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ),
  )
}

describe('extract_menu_item handler', () => {
  it('handles OPTIONS preflight', async () => {
    const req = new Request('https://example.com', { method: 'OPTIONS' })
    const res = await handler(req, fetch, TEST_ENV)
    expect(res.status).toBe(204)
  })

  it('returns 405 for non-POST methods', async () => {
    const req = new Request('https://example.com', { method: 'GET' })
    const res = await handler(req, fetch, TEST_ENV)
    expect(res.status).toBe(405)
    const json = await res.json()
    expect(json.success).toBe(false)
  })

  it('returns 401 when x-demo-staff-id is missing', async () => {
    const req = makeRequest({ file_data: 'aGVsbG8=', media_type: 'image/jpeg' })
    const res = await handler(req, fetch, TEST_ENV)
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error).toBe('Unauthorized')
  })

  it('returns 401 when x-demo-staff-id is not a valid UUID', async () => {
    const req = makeRequest({ file_data: 'aGVsbG8=', media_type: 'image/jpeg' }, 'POST', 'not-a-uuid')
    const res = await handler(req, fetch, TEST_ENV)
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.success).toBe(false)
  })

  it('returns 400 when file_data is missing', async () => {
    const req = makeAuthRequest({ media_type: 'image/jpeg' })
    const res = await handler(req, fetch, TEST_ENV)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error).toContain('file_data')
  })

  it('returns 400 when media_type is missing', async () => {
    const req = makeAuthRequest({ file_data: 'base64data' })
    const res = await handler(req, fetch, TEST_ENV)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error).toContain('media_type')
  })

  it('returns 400 for unsupported media type', async () => {
    const req = makeAuthRequest({ file_data: 'base64data', media_type: 'text/plain' })
    const res = await handler(req, fetch, TEST_ENV)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.success).toBe(false)
  })

  it('returns 500 when env is null', async () => {
    const req = makeAuthRequest({ file_data: 'base64data', media_type: 'image/jpeg' })
    const res = await handler(req, fetch, null)
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
    const mockFetch = vi.fn().mockResolvedValue(new Response('error', { status: 500 }))
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
