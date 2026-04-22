import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mock @supabase/ssr createServerClient ─────────────────────────────────────
const mockGetUser = vi.fn()
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn().mockReturnValue({
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
  }),
}))

// ── Mock @/lib/logger (suppress output in tests) ──────────────────────────────
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// ── Constants ─────────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://dmaogdwtgohrhbytxjqu.supabase.co'
const AUTHENTICATED_USER = {
  id: 'u1',
  email: 'test@example.com',
  user_metadata: { full_name: 'Test User' },
}

/** A minimal valid audio blob for test purposes. */
const DUMMY_AUDIO = new Blob(['fake-audio-data'], { type: 'audio/webm;codecs=opus' })

/**
 * Build a NextRequest with a mocked formData() method.
 *
 * Node.js / Vitest do not support multipart/form-data serialisation through
 * the `Request` constructor, so we stub `formData()` directly on the request
 * instance to return a real `FormData` object. This is the standard approach
 * for unit-testing Next.js API routes that call `request.formData()`.
 */
function makeFormRequest(
  audioBlob: Blob | null,
  language: string | null,
  token?: string,
  /** If true, make formData() throw (simulates a bad body). */
  throwOnParse = false
): NextRequest {
  const req = new NextRequest('http://localhost/api/feedback/transcribe', {
    method: 'POST',
    headers: {
      'Content-Type': 'multipart/form-data; boundary=test-boundary',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    // We never actually read this body — formData() is mocked below.
    body: 'placeholder',
  })

  if (throwOnParse) {
    req.formData = vi.fn().mockRejectedValue(new Error('Failed to parse body'))
  } else {
    const form = new FormData()
    if (audioBlob !== null) form.append('audio', audioBlob, 'recording.webm')
    if (language !== null) form.append('language', language)
    req.formData = vi.fn().mockResolvedValue(form)
  }

  return req
}

describe('POST /api/feedback/transcribe', () => {
  let mockFetch: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.resetModules()

    vi.stubEnv('OPENAI_API_KEY', 'sk-test-key')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL)
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'fake-publishable-key')

    mockGetUser.mockResolvedValue({ data: { user: AUTHENTICATED_USER }, error: null })

    mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ text: 'Hello world' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', mockFetch)
  })

  // ── Configuration guards ───────────────────────────────────────────────────

  it('returns 503 when OPENAI_API_KEY is not set', async () => {
    vi.stubEnv('OPENAI_API_KEY', '')

    const { POST } = await import('./route')
    const req = makeFormRequest(DUMMY_AUDIO, 'en', 'valid-token')
    const res = await POST(req)

    expect(res.status).toBe(503)
    const json = await res.json() as { error: string }
    expect(json.error).toMatch(/not configured/i)
  })

  it('returns 503 when NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '')

    const { POST } = await import('./route')
    const req = makeFormRequest(DUMMY_AUDIO, 'en', 'valid-token')
    const res = await POST(req)

    expect(res.status).toBe(503)
    const json = await res.json() as { error: string }
    expect(json.error).toMatch(/not configured/i)
  })

  // ── Auth guards ────────────────────────────────────────────────────────────

  it('returns 401 when Authorization header is missing', async () => {
    const { POST } = await import('./route')
    const req = makeFormRequest(DUMMY_AUDIO, 'en') // no token
    const res = await POST(req)

    expect(res.status).toBe(401)
  })

  it('returns 401 when token is invalid', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('Invalid JWT') })

    const { POST } = await import('./route')
    const req = makeFormRequest(DUMMY_AUDIO, 'en', 'bad-token')
    const res = await POST(req)

    expect(res.status).toBe(401)
  })

  // ── Body parse error ───────────────────────────────────────────────────────

  it('returns 400 when formData() throws', async () => {
    const { POST } = await import('./route')
    const req = makeFormRequest(null, null, 'valid-token', /* throwOnParse */ true)
    const res = await POST(req)

    expect(res.status).toBe(400)
    const json = await res.json() as { error: string }
    expect(json.error).toMatch(/multipart/i)
  })

  // ── Validation ─────────────────────────────────────────────────────────────

  it('returns 400 when audio field is missing', async () => {
    const { POST } = await import('./route')
    const req = makeFormRequest(null, 'en', 'valid-token')
    const res = await POST(req)

    expect(res.status).toBe(400)
    const json = await res.json() as { error: string }
    expect(json.error).toMatch(/audio/i)
  })

  it('returns 400 when language is missing', async () => {
    const { POST } = await import('./route')
    const req = makeFormRequest(DUMMY_AUDIO, null, 'valid-token')
    const res = await POST(req)

    expect(res.status).toBe(400)
    const json = await res.json() as { error: string }
    expect(json.error).toMatch(/language/i)
  })

  it('returns 400 when language is unsupported', async () => {
    const { POST } = await import('./route')
    const req = makeFormRequest(DUMMY_AUDIO, 'fr', 'valid-token')
    const res = await POST(req)

    expect(res.status).toBe(400)
    const json = await res.json() as { error: string }
    expect(json.error).toMatch(/language/i)
  })

  it('returns 400 when audio exceeds 25 MB', async () => {
    // Create a blob slightly over the 25MB limit
    const bigBlob = new Blob([new Uint8Array(25 * 1024 * 1024 + 1)], { type: 'audio/webm' })

    const { POST } = await import('./route')
    const req = makeFormRequest(bigBlob, 'en', 'valid-token')
    const res = await POST(req)

    expect(res.status).toBe(400)
    const json = await res.json() as { error: string }
    expect(json.error).toMatch(/too large/i)
  })

  // ── Whisper calls ──────────────────────────────────────────────────────────

  it('calls /v1/audio/transcriptions for English and returns text', async () => {
    const { POST } = await import('./route')
    const req = makeFormRequest(DUMMY_AUDIO, 'en', 'valid-token')
    const res = await POST(req)

    expect(res.status).toBe(200)
    const json = await res.json() as { text: string }
    expect(json.text).toBe('Hello world')

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url] = mockFetch.mock.calls[0] as [string]
    expect(url).toBe('https://api.openai.com/v1/audio/transcriptions')
  })

  it('calls /v1/audio/translations for Bangla', async () => {
    const { POST } = await import('./route')
    const req = makeFormRequest(DUMMY_AUDIO, 'bn', 'valid-token')
    const res = await POST(req)

    expect(res.status).toBe(200)

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url] = mockFetch.mock.calls[0] as [string]
    expect(url).toBe('https://api.openai.com/v1/audio/translations')
  })

  it('sends model=whisper-1 in the Whisper request', async () => {
    const { POST } = await import('./route')
    const req = makeFormRequest(DUMMY_AUDIO, 'en', 'valid-token')
    await POST(req)

    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
    const bodyForm = opts.body as FormData
    expect(bodyForm.get('model')).toBe('whisper-1')
  })

  it('sends language=en for English transcription', async () => {
    const { POST } = await import('./route')
    const req = makeFormRequest(DUMMY_AUDIO, 'en', 'valid-token')
    await POST(req)

    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
    const bodyForm = opts.body as FormData
    expect(bodyForm.get('language')).toBe('en')
  })

  it('does NOT send language field for Bangla translation', async () => {
    const { POST } = await import('./route')
    const req = makeFormRequest(DUMMY_AUDIO, 'bn', 'valid-token')
    await POST(req)

    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
    const bodyForm = opts.body as FormData
    // /v1/audio/translations doesn't use the `language` parameter
    expect(bodyForm.get('language')).toBeNull()
  })

  it('sends Bearer OPENAI_API_KEY in Authorization header', async () => {
    const { POST } = await import('./route')
    const req = makeFormRequest(DUMMY_AUDIO, 'en', 'valid-token')
    await POST(req)

    const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
    const headers = opts.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer sk-test-key')
  })

  // ── Error paths ────────────────────────────────────────────────────────────

  it('returns 502 when OpenAI fetch throws a network error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))

    const { POST } = await import('./route')
    const req = makeFormRequest(DUMMY_AUDIO, 'en', 'valid-token')
    const res = await POST(req)

    expect(res.status).toBe(502)
  })

  it('returns 502 when Whisper responds with non-2xx status', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'Invalid file format' } }), { status: 400 })
    )

    const { POST } = await import('./route')
    const req = makeFormRequest(DUMMY_AUDIO, 'en', 'valid-token')
    const res = await POST(req)

    expect(res.status).toBe(502)
    const json = await res.json() as { error: string }
    expect(json.error).toMatch(/transcription failed/i)
  })
})
