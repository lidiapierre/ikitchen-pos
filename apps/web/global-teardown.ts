/**
 * Global teardown: close the shift that was opened in global-setup.ts so the
 * production database is left in a clean state after E2E tests finish.
 */

async function globalTeardown(): Promise<void> {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://dmaogdwtgohrhbytxjqu.supabase.co'
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    'sb_publishable_IzsBL3KELStvo6bioFKWhA_dMj81UxH'
  const adminEmail = process.env.E2E_ADMIN_EMAIL
  const adminPassword = process.env.E2E_ADMIN_PASSWORD

  if (!adminEmail || !adminPassword) return

  // Get admin JWT
  const authRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anonKey },
    body: JSON.stringify({ email: adminEmail, password: adminPassword }),
  })
  if (!authRes.ok) return
  const session = (await authRes.json()) as { access_token: string }
  const jwt = session.access_token

  // Find the open shift
  const shiftRes = await fetch(
    `${supabaseUrl}/rest/v1/shifts?select=id&status=eq.open&limit=1`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${jwt}` } },
  )
  if (!shiftRes.ok) return
  const openShifts = (await shiftRes.json()) as Array<{ id: string }>
  if (openShifts.length === 0) return

  // Close the shift
  const closeRes = await fetch(`${supabaseUrl}/functions/v1/close_shift`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
      apikey: anonKey,
    },
    body: JSON.stringify({ shift_id: openShifts[0].id, closing_float: 0 }),
  })
  if (!closeRes.ok) {
    const t = await closeRes.text()
    console.warn('[global-teardown] Could not close shift:', closeRes.status, t)
  } else {
    console.log('[global-teardown] Closed E2E test shift')
  }
}

export default globalTeardown
