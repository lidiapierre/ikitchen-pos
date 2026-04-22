import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { logger } from '@/lib/logger'

/** Max screenshot URLs we accept from the client. */
const MAX_SCREENSHOTS = 5

/** Validate that a URL is a public Supabase Storage URL on our own project. */
function isValidScreenshotUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) return false
  try {
    const parsed = new URL(url)
    const storageHost = new URL(supabaseUrl).hostname
    return parsed.protocol === 'https:' && parsed.hostname === storageHost
  } catch {
    return false
  }
}

interface FeedbackPayload {
  description: string
  pageUrl: string
  userAgent: string
  screenshots: unknown[]
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const webhookUrl = process.env.SLACK_FEEDBACK_WEBHOOK

  if (!webhookUrl) {
    logger.error('feedback', 'SLACK_FEEDBACK_WEBHOOK is not set')
    return NextResponse.json({ error: 'Feedback service is not configured' }, { status: 503 })
  }

  // ── Auth: validate the bearer token via the admin client ──────────────────
  const authHeader = request.headers.get('Authorization')
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim()

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: { user }, error: authError } = await getSupabaseAdmin().auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Derive identity from the server-verified user — never trust the client.
  const userEmail = user.email ?? 'unknown'
  const userName = (user.user_metadata?.full_name as string | undefined) ?? user.email ?? 'unknown'

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: FeedbackPayload
  try {
    body = await request.json() as FeedbackPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { description, pageUrl, userAgent, screenshots: rawScreenshots } = body

  if (!description?.trim()) {
    return NextResponse.json({ error: 'Description is required' }, { status: 400 })
  }

  // Runtime-validate screenshots (must be an array of valid Supabase Storage URLs)
  if (!Array.isArray(rawScreenshots)) {
    return NextResponse.json({ error: 'screenshots must be an array' }, { status: 400 })
  }

  const screenshots = rawScreenshots
    .slice(0, MAX_SCREENSHOTS)
    .filter(isValidScreenshotUrl)

  // ── Format and send Slack message ─────────────────────────────────────────
  const timestamp = new Date().toISOString()

  const screenshotsText =
    screenshots.length > 0
      ? screenshots.map((url) => `• ${url}`).join('\n')
      : 'None'

  const slackText =
    `🐛 *New Feedback from ${userName} (${userEmail})*\n\n` +
    `📝 *Description:*\n${description.trim()}\n\n` +
    `📍 *Page:* ${pageUrl ?? 'unknown'}\n` +
    `🕐 *Time:* ${timestamp}\n` +
    `🖥️ *User Agent:* ${userAgent ?? 'unknown'}\n\n` +
    `📸 *Screenshots:*\n${screenshotsText}`

  try {
    const slackResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: slackText }),
    })

    if (!slackResponse.ok) {
      const slackBody = await slackResponse.text()
      logger.error('feedback', 'Slack webhook returned non-2xx', { status: slackResponse.status, body: slackBody })
      return NextResponse.json({ error: 'Failed to send to Slack' }, { status: 502 })
    }
  } catch (err) {
    logger.error('feedback', 'Slack fetch threw', { err: String(err) })
    return NextResponse.json({ error: 'Failed to reach Slack' }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}
