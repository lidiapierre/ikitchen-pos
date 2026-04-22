import { NextRequest, NextResponse } from 'next/server'

interface FeedbackPayload {
  description: string
  pageUrl: string
  userAgent: string
  userEmail: string
  userName: string
  screenshots: string[]
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const webhookUrl = process.env.SLACK_FEEDBACK_WEBHOOK

  if (!webhookUrl) {
    console.error('[feedback] SLACK_FEEDBACK_WEBHOOK is not set')
    return NextResponse.json({ error: 'Feedback service is not configured' }, { status: 503 })
  }

  let body: FeedbackPayload
  try {
    body = await request.json() as FeedbackPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { description, pageUrl, userAgent, userEmail, userName, screenshots } = body

  if (!description?.trim()) {
    return NextResponse.json({ error: 'Description is required' }, { status: 400 })
  }

  const timestamp = new Date().toISOString()

  const screenshotsText =
    screenshots && screenshots.length > 0
      ? screenshots.map((url) => `• ${url}`).join('\n')
      : 'None'

  const slackText =
    `🐛 *New Feedback from ${userName} (${userEmail})*\n\n` +
    `📝 *Description:*\n${description.trim()}\n\n` +
    `📍 *Page:* ${pageUrl}\n` +
    `🕐 *Time:* ${timestamp}\n` +
    `🖥️ *User Agent:* ${userAgent}\n\n` +
    `📸 *Screenshots:*\n${screenshotsText}`

  const slackPayload = {
    text: slackText,
  }

  const slackResponse = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(slackPayload),
  })

  if (!slackResponse.ok) {
    const slackBody = await slackResponse.text()
    console.error('[feedback] Slack webhook error:', slackResponse.status, slackBody)
    return NextResponse.json({ error: 'Failed to send to Slack' }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}
