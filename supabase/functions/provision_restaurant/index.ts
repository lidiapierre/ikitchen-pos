/**
 * provision_restaurant — public self-service edge function.
 *
 * Creates a new restaurant and its owner account in one atomic-ish operation:
 *   1. Validates slug uniqueness (unique constraint in DB is the duplicate-prevention guard)
 *   2. Creates row in `restaurants` (including optional branch_name)
 *   3. Creates the owner account via Supabase Auth admin API
 *      - If owner_password is provided: createUser with email_confirm: true (owner can log in immediately)
 *      - Otherwise: invite (owner receives an email invitation)
 *   4. Creates row in `users` with role = 'owner'
 *   5. Seeds default config (currency_code, currency_symbol, vat_percentage, service_charge)
 *   6. Seeds a vat_rates row when vat_percentage > 0 (so fetchVatConfig returns the correct rate)
 *
 * On any failure after the restaurant row is created, cleanup is attempted.
 *
 * Auth: none required — this is a public self-service endpoint.
 * Rate limiting: No application-level rate limiting is applied. The unique slug + email
 * constraints in the DB prevent duplicate-registration abuse for identical inputs, but do not
 * cap requests with distinct values. WAF or API-gateway rate rules can be layered at the
 * Supabase project or network level for broader protection.
 */

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-demo-staff-id',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>

export interface HandlerEnv {
  supabaseUrl: string
  serviceKey: string
}

function readEnv(): HandlerEnv | null {
  const g = globalThis as { Deno?: { env: { get: (key: string) => string | undefined } } }
  if (!g.Deno) return null
  const supabaseUrl = g.Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = g.Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !serviceKey) return null
  return { supabaseUrl, serviceKey }
}

export async function handler(
  req: Request,
  fetchFn: FetchFn = fetch,
  env: HandlerEnv | null = readEnv(),
): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  // Health check – keeps the function warm (issue #283)
  if (req.method === 'GET' && new URL(req.url).pathname.endsWith('/health')) {
    return new Response(
      JSON.stringify({ ok: true, function: 'provision_restaurant' }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  if (!env) {
    return new Response(
      JSON.stringify({ success: false, error: 'Server configuration error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  const { supabaseUrl, serviceKey } = env

  // --- parse body ---
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid or missing request body' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  const payload = body as Record<string, unknown>

  // --- validate ---
  if (typeof payload['name'] !== 'string' || !(payload['name'] as string).trim()) {
    return new Response(
      JSON.stringify({ success: false, error: 'name is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }
  // Slug must start and end with an alphanumeric char; interior hyphens are allowed
  if (typeof payload['slug'] !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(payload['slug'] as string)) {
    return new Response(
      JSON.stringify({ success: false, error: 'slug is required and must be lowercase alphanumeric with hyphens (no leading/trailing hyphens)' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }
  if (typeof payload['owner_email'] !== 'string' || !(payload['owner_email'] as string).includes('@')) {
    return new Response(
      JSON.stringify({ success: false, error: 'owner_email is required and must be valid' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  const name = (payload['name'] as string).trim()
  const slug = (payload['slug'] as string).trim().toLowerCase()
  const ownerEmail = (payload['owner_email'] as string).trim().toLowerCase()
  const branchName = typeof payload['branch_name'] === 'string' && payload['branch_name'].trim()
    ? (payload['branch_name'] as string).trim()
    : null
  const ownerPassword = typeof payload['owner_password'] === 'string' && (payload['owner_password'] as string).length >= 8
    ? (payload['owner_password'] as string)
    : null
  const rawTimezone = typeof payload['timezone'] === 'string' && payload['timezone'].trim()
    ? (payload['timezone'] as string).trim()
    : 'Asia/Dhaka'
  // Validate against IANA timezone list
  const validTimezones: string[] = typeof (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf === 'function'
    ? ((Intl as { supportedValuesOf: (key: string) => string[] }).supportedValuesOf('timeZone') as string[])
    : []
  if (validTimezones.length > 0 && !validTimezones.includes(rawTimezone)) {
    return new Response(
      JSON.stringify({ success: false, error: `Invalid timezone "${rawTimezone}"` }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }
  const timezone = rawTimezone
  const currencyCode = typeof payload['currency_code'] === 'string' && payload['currency_code'].trim()
    ? (payload['currency_code'] as string).trim().toUpperCase()
    // legacy field name support
    : typeof payload['currency'] === 'string' && payload['currency'].trim()
      ? (payload['currency'] as string).trim().toUpperCase()
      : 'BDT'
  const currencySymbol = typeof payload['currency_symbol'] === 'string' && payload['currency_symbol'].trim()
    ? (payload['currency_symbol'] as string).trim()
    : currencyCode === 'BDT' ? '৳' : currencyCode
  const vatPercentage = typeof payload['vat_percentage'] === 'number'
    ? String(payload['vat_percentage'])
    : '0'
  const serviceCharge = typeof payload['service_charge_percentage'] === 'number'
    ? String(payload['service_charge_percentage'])
    : '0'

  const serviceHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  }

  // --- 1. Create restaurant ---
  const restaurantBody: Record<string, string | null> = { name, slug, timezone }
  if (branchName) restaurantBody['branch_name'] = branchName

  const restaurantRes = await fetchFn(`${supabaseUrl}/rest/v1/restaurants`, {
    method: 'POST',
    headers: { ...serviceHeaders, Prefer: 'return=representation' },
    body: JSON.stringify(restaurantBody),
  })

  if (!restaurantRes.ok) {
    const errBody = await restaurantRes.json().catch(() => ({})) as Record<string, unknown>
    const msg = String(errBody['message'] ?? errBody['details'] ?? 'Failed to create restaurant')
    // Duplicate slug will surface as a unique-violation
    const friendly = msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('duplicate')
      ? `Slug "${slug}" is already taken`
      : msg
    return new Response(
      JSON.stringify({ success: false, error: friendly }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  const restaurants = (await restaurantRes.json()) as Array<{ id: string; name: string; slug: string; timezone: string; created_at: string }>
  if (!restaurants || restaurants.length === 0) {
    return new Response(
      JSON.stringify({ success: false, error: 'Restaurant creation returned no data' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }
  const restaurant = restaurants[0]

  // Cleanup helper — best-effort, not awaited in the success path
  async function cleanupRestaurant(): Promise<void> {
    await fetchFn(`${supabaseUrl}/rest/v1/restaurants?id=eq.${restaurant.id}`, {
      method: 'DELETE',
      headers: serviceHeaders,
    }).catch(() => undefined)
  }

  // --- 2. Create owner auth account ---
  let authUserId: string

  if (ownerPassword) {
    // Create user with password via admin API and auto-confirm the email (#420).
    // This allows the owner to log in immediately after self-service registration.
    // Trade-off: we skip inbox-ownership verification. This is acceptable because
    //   (a) the registration form already required the user to type the email themselves,
    //   (b) duplicate-email is prevented by Supabase Auth's unique constraint,
    //   (c) rate-limiting should be enforced at the Supabase project / WAF layer to
    //       prevent bulk account creation with arbitrary emails.
    const createRes = await fetchFn(`${supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: serviceHeaders,
      body: JSON.stringify({
        email: ownerEmail,
        password: ownerPassword,
        email_confirm: true,
        user_metadata: { restaurant_id: restaurant.id },
      }),
    })

    if (!createRes.ok) {
      await cleanupRestaurant()
      const errBody = await createRes.json().catch(() => ({})) as Record<string, unknown>
      const errMsg = String(errBody['msg'] ?? errBody['message'] ?? 'Failed to create owner auth account')
      return new Response(
        JSON.stringify({ success: false, error: errMsg }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    const createdUser = (await createRes.json()) as { id: string }
    authUserId = createdUser.id
  } else {
    // Invite owner via Supabase Auth admin invite API — owner receives email
    const inviteRes = await fetchFn(`${supabaseUrl}/auth/v1/invite`, {
      method: 'POST',
      headers: serviceHeaders,
      body: JSON.stringify({ email: ownerEmail, data: { restaurant_id: restaurant.id } }),
    })

    if (!inviteRes.ok) {
      await cleanupRestaurant()
      const errBody = await inviteRes.json().catch(() => ({})) as Record<string, unknown>
      const errMsg = String(errBody['msg'] ?? errBody['message'] ?? 'Failed to create owner auth account')
      return new Response(
        JSON.stringify({ success: false, error: errMsg }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      )
    }

    const authUser = (await inviteRes.json()) as { id: string }
    authUserId = authUser.id
  }

  // --- 3. Create user row with role = owner ---
  const userRes = await fetchFn(`${supabaseUrl}/rest/v1/users`, {
    method: 'POST',
    headers: { ...serviceHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({
      id: authUserId,
      restaurant_id: restaurant.id,
      email: ownerEmail,
      role: 'owner',
      is_active: true,
    }),
  })

  if (!userRes.ok) {
    // Rollback auth user and restaurant
    await fetchFn(`${supabaseUrl}/auth/v1/admin/users/${authUserId}`, {
      method: 'DELETE',
      headers: serviceHeaders,
    }).catch(() => undefined)
    await cleanupRestaurant()
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to create owner user profile' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    )
  }

  // --- 4. Seed default config ---
  const defaultConfig = [
    { restaurant_id: restaurant.id, key: 'currency_code', value: currencyCode },
    { restaurant_id: restaurant.id, key: 'currency_symbol', value: currencySymbol },
    { restaurant_id: restaurant.id, key: 'vat_percentage', value: vatPercentage },
    { restaurant_id: restaurant.id, key: 'service_charge_percent', value: serviceCharge },
    // Round bill totals to nearest whole number by default (issue #371)
    { restaurant_id: restaurant.id, key: 'round_bill_totals', value: 'true' },
  ]

  // Best-effort — config seeding failure doesn't abort the provisioning
  await fetchFn(`${supabaseUrl}/rest/v1/config`, {
    method: 'POST',
    headers: { ...serviceHeaders, Prefer: 'resolution=ignore-duplicates' },
    body: JSON.stringify(defaultConfig),
  }).catch(() => undefined)

  // --- 5. Seed vat_rates row when VAT > 0 ---
  // fetchVatConfig reads from vat_rates, not from config.vat_percentage.
  // Without this row, bill preview always shows 0% VAT even when a rate was
  // provided at registration time.
  const vatNum = parseFloat(vatPercentage)
  if (!isNaN(vatNum) && vatNum > 0) {
    await fetchFn(`${supabaseUrl}/rest/v1/vat_rates`, {
      method: 'POST',
      headers: { ...serviceHeaders, Prefer: 'resolution=ignore-duplicates' },
      body: JSON.stringify([{
        restaurant_id: restaurant.id,
        label: 'Standard',
        percentage: vatNum,
        menu_id: null,
      }]),
    }).catch(() => undefined)
  }

  return new Response(
    JSON.stringify({
      success: true,
      data: {
        restaurant: {
          id: restaurant.id,
          name: restaurant.name,
          slug: restaurant.slug,
          timezone: restaurant.timezone,
          created_at: restaurant.created_at,
        },
        owner_email: ownerEmail,
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
  )
}

if (typeof (globalThis as { Deno?: unknown }).Deno !== 'undefined') {
  const g = globalThis as { Deno: { serve: (h: (req: Request) => Promise<Response>) => void } }
  g.Deno.serve((req: Request) => handler(req))
}
