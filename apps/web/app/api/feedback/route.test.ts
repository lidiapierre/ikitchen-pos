import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mock @supabase/supabase-js ────────────────────────────────────────────────
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://dmaogdwtgohrhbytxjqu.supabase.co'
const WEBHOOK_URL = 'https://hooks.slack.com/services/fake'

function makeRequest(body: unknown, token?: string): NextRequest {
  return new NextRequest('http://localhost/api/feedback', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
}

describe('POST /api/feedback', () => {
  let mockGetUser: ReturnType<typeof vi.fn>
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.resetModules()

    // Provide required env vars
    vi.stubEnv('SLACK_FEEDBACK_WEBHOOK', WEBHOOK_URL)
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL)
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fake-service-role-key')

    // Set up the Supabase admin mock
    mockGetUser = vi.fn()
    const { createClient } = await import('@supabase/supabase-js')
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: mockGetUser },
    } as unknown as ReturnType<typeof createClient>)

    // Mock global fetch (used for the Slack webhook call)
    mockFetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }))
    vi.stubGlobal('fetch', mockFetch)
  })

  it('returns 503 when SLACK_FEEDBACK_WEBHOOK is not set', async () => {
    vi.unstubAllEnvs()
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL)
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'key')

    const { POST } = await import('./route')
    const req = makeRequest({ description: 'test' }, 'valid-token')
    const res = await POST(req)

    expect(res.status).toBe(503)
    const json = await res.json() as { error: string }
    expect(json.error).toMatch(/not configured/i)
  })

  it('returns 401 when Authorization header is missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('No token') })

    const { POST } = await import('./route')
    const req = makeRequest({ description: 'test' }) // no token
    const res = await POST(req)

    expect(res.status).toBe(401)
  })

  it('returns 401 when token is invalid', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('Invalid JWT') })

    const { POST } = await import('./route')
    const req = makeRequest({ description: 'test' }, 'bad-token')
    const res = await POST(req)

    expect(res.status).toBe(401)
  })

  it('returns 400 when description is empty', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u1', email: 'a@b.com', user_metadata: {} } },
      error: null,
    })

    const { POST } = await import('./route')
    const req = makeRequest({ description: '   ', pageUrl: 'http://x', userAgent: 'ua', screenshots: [] }, 'valid')
    const res = await POST(req)

    expect(res.status).toBe(400)
    const json = await res.json() as { error: string }
    expect(json.error).toMatch(/description/i)
  })

  it('returns 400 when screenshots is not an array', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u1', email: 'a@b.com', user_metadata: {} } },
      error: null,
    })

    const { POST } = await import('./route')
    const req = makeRequest({ description: 'bug', pageUrl: 'http://x', userAgent: 'ua', screenshots: 'not-array' }, 'valid')
    const res = await POST(req)

    expect(res.status).toBe(400)
    const json = await res.json() as { error: string }
    expect(json.error).toMatch(/array/i)
  })

  it('posts to Slack and returns 200 on success', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u1', email: 'test@example.com', user_metadata: { full_name: 'Test User' } } },
      error: null,
    })

    const { POST } = await import('./route')
    const req = makeRequest({
      description: 'Checkout button broken',
      pageUrl: 'http://pos/tables',
      userAgent: 'Mozilla/5.0',
      screenshots: [],
    }, 'valid-token')
    const res = await POST(req)

    expect(res.status).toBe(200)
    const json = await res.json() as { ok: boolean }
    expect(json.ok).toBe(true)

    // Verify Slack was called
    expect(mockFetch).toHaveBeenCalledOnce()
    const [slackUrl, slackOpts] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(slackUrl).toBe(WEBHOOK_URL)
    const slackBody = JSON.parse(slackOpts.body as string) as { text: string }
    expect(slackBody.text).toContain('Test User')
    expect(slackBody.text).toContain('test@example.com')
    expect(slackBody.text).toContain('Checkout button broken')
  })

  it('filters out non-Supabase screenshot URLs', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u1', email: 'a@b.com', user_metadata: {} } },
      error: null,
    })

    const validUrl = `${SUPABASE_URL}/storage/v1/object/public/feedback-screenshots/u1/shot.png`
    const evilUrl = 'https://evil.com/xss.png'

    const { POST } = await import('./route')
    const req = makeRequest({
      description: 'bug',
      pageUrl: 'http://x',
      userAgent: 'ua',
      screenshots: [validUrl, evilUrl],
    }, 'valid')
    const res = await POST(req)

    expect(res.status).toBe(200)
    const [, slackOpts] = mockFetch.mock.calls[0] as [string, RequestInit]
    const slackBody = JSON.parse(slackOpts.body as string) as { text: string }
    expect(slackBody.text).toContain(validUrl)
    expect(slackBody.text).not.toContain(evilUrl)
  })

  it('returns 502 when Slack fetch throws a network error', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u1', email: 'a@b.com', user_metadata: {} } },
      error: null,
    })
    mockFetch.mockRejectedValue(new Error('Network error'))

    const { POST } = await import('./route')
    const req = makeRequest({
      description: 'crash',
      pageUrl: 'http://x',
      userAgent: 'ua',
      screenshots: [],
    }, 'valid')
    const res = await POST(req)

    expect(res.status).toBe(502)
  })

  it('returns 502 when Slack responds with non-2xx status', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u1', email: 'a@b.com', user_metadata: {} } },
      error: null,
    })
    mockFetch.mockResolvedValue(new Response('channel_not_found', { status: 400 }))

    const { POST } = await import('./route')
    const req = makeRequest({
      description: 'crash',
      pageUrl: 'http://x',
      userAgent: 'ua',
      screenshots: [],
    }, 'valid')
    const res = await POST(req)

    expect(res.status).toBe(502)
  })
})
