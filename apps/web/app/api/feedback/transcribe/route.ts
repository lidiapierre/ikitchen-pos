import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { logger } from '@/lib/logger'

/** Maximum audio file size accepted (25 MB — Whisper API hard limit). */
const MAX_AUDIO_BYTES = 25 * 1024 * 1024

/** Supported language codes. */
const SUPPORTED_LANGUAGES = ['en', 'bn'] as const
type Language = (typeof SUPPORTED_LANGUAGES)[number]

/**
 * MIME type prefixes accepted by Whisper. We fail-fast on obviously wrong types
 * (e.g. images, PDFs) to avoid a round-trip to the OpenAI API.
 * Whisper supports: flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, webm.
 */
const ALLOWED_AUDIO_MIME_PREFIXES = ['audio/', 'video/webm', 'video/mp4'] as const

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // ── Guard: OPENAI_API_KEY must be present ─────────────────────────────────
    const openAiKey = process.env.OPENAI_API_KEY
    if (!openAiKey) {
      logger.error('feedback/transcribe', 'OPENAI_API_KEY is not set')
      return NextResponse.json({ error: 'Transcription service is not configured' }, { status: 503 })
    }

    // ── Guard: Supabase env vars must be present ───────────────────────────────
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
      logger.error('feedback/transcribe', 'Supabase env vars are not set')
      return NextResponse.json({ error: 'Transcription service is not configured' }, { status: 503 })
    }

    // ── Auth: validate the bearer token via publishable-key client ────────────
    const authHeader = request.headers.get('Authorization')
    const token = authHeader?.replace(/^Bearer\s+/i, '').trim()

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      { cookies: { getAll: () => [], setAll: () => {} } }
    )

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ── Parse multipart/form-data ─────────────────────────────────────────────
    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return NextResponse.json({ error: 'Invalid multipart/form-data body' }, { status: 400 })
    }

    const audioFile = formData.get('audio')
    const language = formData.get('language')

    // Validate audio field
    if (!audioFile || !(audioFile instanceof Blob)) {
      return NextResponse.json({ error: 'audio field is required and must be a file' }, { status: 400 })
    }

    // Validate file is not empty
    if (audioFile.size === 0) {
      return NextResponse.json({ error: 'Audio file is empty' }, { status: 400 })
    }

    // Validate MIME type (fail-fast before calling Whisper API)
    const audioMime = audioFile.type || ''
    if (audioMime && !ALLOWED_AUDIO_MIME_PREFIXES.some((p) => audioMime.startsWith(p))) {
      return NextResponse.json({ error: 'Unsupported audio format' }, { status: 400 })
    }

    // Validate file size
    if (audioFile.size > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { error: `Audio file too large. Maximum size is ${MAX_AUDIO_BYTES / (1024 * 1024)} MB.` },
        { status: 400 }
      )
    }

    // Validate language field
    if (typeof language !== 'string' || !(SUPPORTED_LANGUAGES as readonly string[]).includes(language)) {
      return NextResponse.json(
        { error: `language must be one of: ${SUPPORTED_LANGUAGES.join(', ')}` },
        { status: 400 }
      )
    }

    const lang = language as Language

    // ── Call OpenAI Whisper ───────────────────────────────────────────────────
    // English  → /v1/audio/transcriptions (preserves original language)
    // Bangla   → /v1/audio/translations   (transcribes + translates to English)
    const endpoint =
      lang === 'bn'
        ? 'https://api.openai.com/v1/audio/translations'
        : 'https://api.openai.com/v1/audio/transcriptions'

    const whisperForm = new FormData()

    // Determine MIME type from the Blob; fall back to webm/opus (most common browser output)
    const mimeType = audioFile.type || 'audio/webm;codecs=opus'
    // Derive a file extension from MIME; Whisper accepts webm, mp4, ogg, wav, etc.
    const ext = mimeType.startsWith('audio/ogg') ? 'ogg' : 'webm'
    // Pass the audio file directly to avoid an unnecessary arrayBuffer() round-trip.
    // Use the original File name if available, otherwise derive from MIME type.
    const fileName = audioFile instanceof File && audioFile.name ? audioFile.name : `recording.${ext}`
    whisperForm.append('file', audioFile, fileName)
    whisperForm.append('model', 'whisper-1')
    if (lang === 'en') {
      whisperForm.append('language', 'en')
    }

    let whisperResponse: Response
    try {
      whisperResponse = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${openAiKey}` },
        body: whisperForm,
      })
    } catch (err) {
      logger.error('feedback/transcribe', 'OpenAI Whisper fetch threw', { err: String(err) })
      return NextResponse.json({ error: 'Failed to reach transcription service' }, { status: 502 })
    }

    if (!whisperResponse.ok) {
      const body = await whisperResponse.text()
      logger.error('feedback/transcribe', 'Whisper returned non-2xx', {
        status: whisperResponse.status,
        body,
      })
      return NextResponse.json(
        { error: 'Transcription failed' },
        { status: 502 }
      )
    }

    let whisperJson: { text?: string }
    try {
      whisperJson = await whisperResponse.json() as { text?: string }
    } catch (err) {
      logger.error('feedback/transcribe', 'Whisper returned non-JSON body', { err: String(err) })
      return NextResponse.json({ error: 'Transcription failed' }, { status: 502 })
    }
    const text = whisperJson.text ?? ''

    return NextResponse.json({ text })
  } catch (err) {
    logger.error('feedback/transcribe', 'Unhandled error in POST /api/feedback/transcribe', { err: String(err) })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
