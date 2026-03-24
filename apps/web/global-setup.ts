import { chromium, type FullConfig } from '@playwright/test'

/**
 * Global setup: authenticate once with the test admin and staff accounts and
 * save the Supabase SSR session cookies to:
 *   - `e2e/.auth/admin.json`  (admin@lahore.ikitchen.com.bd — role: owner)
 *   - `e2e/.auth/staff.json`  (staff@lahore.ikitchen.com.bd — role: server)
 *
 * All tests that need an authenticated session use storageState pointing at
 * one of these files, so the login flow runs once per test suite rather than
 * per test.
 */

interface AuthSession {
  access_token: string
  refresh_token: string
  expires_at?: number
}

interface CookieEntry {
  name: string
  value: string
  domain: string
  path: string
  httpOnly: boolean
  secure: boolean
  sameSite: 'Lax' | 'Strict' | 'None'
}

async function buildStorageState(
  supabaseUrl: string,
  anonKey: string,
  email: string,
  password: string
): Promise<CookieEntry[]> {
  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
    },
    body: JSON.stringify({ email, password }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Auth failed for ${email} (${res.status}): ${text}`)
  }

  const session = (await res.json()) as AuthSession

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

  return chunks.map((chunk, i): CookieEntry => ({
    name: chunks.length === 1 ? cookieName : `${cookieName}.${i}`,
    value: chunk,
    domain: 'localhost',
    path: '/',
    httpOnly: true,
    secure: false,
    sameSite: 'Lax',
  }))
}

async function globalSetup(_config: FullConfig): Promise<void> {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://dmaogdwtgohrhbytxjqu.supabase.co'
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    'sb_publishable_IzsBL3KELStvo6bioFKWhA_dMj81UxH'

  const adminEmail = process.env.E2E_ADMIN_EMAIL
  const adminPassword = process.env.E2E_ADMIN_PASSWORD
  const staffEmail = process.env.E2E_STAFF_EMAIL
  const staffPassword = process.env.E2E_STAFF_PASSWORD

  if (!adminEmail || !adminPassword || !staffEmail || !staffPassword) {
    throw new Error(
      'E2E auth env vars missing: E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_STAFF_EMAIL, E2E_STAFF_PASSWORD'
    )
  }

  const [adminCookies, staffCookies] = await Promise.all([
    buildStorageState(
      supabaseUrl,
      anonKey,
      adminEmail,
      adminPassword
    ),
    buildStorageState(
      supabaseUrl,
      anonKey,
      staffEmail,
      staffPassword
    ),
  ])

  const browser = await chromium.launch()

  // Save admin storage state
  const adminContext = await browser.newContext()
  await adminContext.addCookies(adminCookies)
  await adminContext.storageState({ path: 'e2e/.auth/admin.json' })
  await adminContext.close()

  // Save staff storage state
  const staffContext = await browser.newContext()
  await staffContext.addCookies(staffCookies)
  await staffContext.storageState({ path: 'e2e/.auth/staff.json' })
  await staffContext.close()

  await browser.close()
}

export default globalSetup
