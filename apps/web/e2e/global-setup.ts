import { chromium, type FullConfig } from '@playwright/test'

/**
 * Global setup: authenticate once with the test admin account and save the
 * Supabase SSR session cookies to `e2e/.auth/admin.json`.
 *
 * All tests that need an authenticated session use storageState pointing at
 * this file, so the login flow runs once per test suite rather than per test.
 */
async function globalSetup(_config: FullConfig): Promise<void> {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://dmaogdwtgohrhbytxjqu.supabase.co'
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    'sb_publishable_IzsBL3KELStvo6bioFKWhA_dMj81UxH'

  // Sign in via Supabase REST API to get the session tokens
  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
    },
    body: JSON.stringify({
      email: 'admin@lahore.ikitchen.com.bd',
      password: 'Admin@iKitchen2026',
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Global setup auth failed (${res.status}): ${text}`)
  }

  const session = (await res.json()) as {
    access_token: string
    refresh_token: string
    expires_at?: number
  }

  // Build the Supabase SSR session cookie value (matches @supabase/ssr format)
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
  const cookieName = `sb-${projectRef}-auth-token`
  const cookieValue = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
  })

  // Supabase SSR chunks cookies >3180 chars across .0, .1 etc.
  const chunkSize = 3180
  const chunks: string[] = []
  for (let i = 0; i < cookieValue.length; i += chunkSize) {
    chunks.push(cookieValue.slice(i, i + chunkSize))
  }

  const cookies = chunks.map((chunk, i) => ({
    name: chunks.length === 1 ? cookieName : `${cookieName}.${i}`,
    value: chunk,
    domain: 'localhost',
    path: '/',
    httpOnly: true,
    secure: false,
    sameSite: 'Lax' as const,
  }))

  // Save storage state with auth cookies
  const browser = await chromium.launch()
  const context = await browser.newContext()
  await context.addCookies(cookies)
  await context.storageState({ path: 'e2e/.auth/admin.json' })
  await browser.close()
}

export default globalSetup
