interface ActionResponse {
  success: boolean
  data?: Record<string, unknown>
  error?: string
}

function buildHeaders(accessToken: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  }
}

export interface ProvisionRestaurantParams {
  name: string
  slug: string
  timezone: string
  currency: string
  ownerEmail: string
}

export interface ProvisionedRestaurant {
  restaurant: {
    id: string
    name: string
    slug: string
    timezone: string
    created_at: string
  }
  owner_email: string
}

export async function callProvisionRestaurant(
  supabaseUrl: string,
  accessToken: string,
  params: ProvisionRestaurantParams,
): Promise<ProvisionedRestaurant> {
  const res = await fetch(`${supabaseUrl}/functions/v1/provision_restaurant`, {
    method: 'POST',
    headers: buildHeaders(accessToken),
    body: JSON.stringify({
      name: params.name,
      slug: params.slug,
      timezone: params.timezone,
      currency: params.currency,
      owner_email: params.ownerEmail,
    }),
  })

  const json = (await res.json().catch(() => ({
    success: false,
    error: 'Request failed',
  }))) as ActionResponse

  if (!res.ok || !json.success) {
    throw new Error(json.error ?? 'provision_restaurant failed')
  }

  if (!json.data || typeof json.data['restaurant'] !== 'object') {
    throw new Error('Invalid response from provision_restaurant')
  }

  return json.data as unknown as ProvisionedRestaurant
}
