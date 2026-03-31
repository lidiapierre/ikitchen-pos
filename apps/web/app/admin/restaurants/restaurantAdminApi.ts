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

/** Auto-generate a URL-safe slug from a restaurant name */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 48)
}

export interface ProvisionRestaurantInput {
  name: string
  ownerEmail: string
  ownerPassword: string
  branchName?: string
  currencyCode?: string
  currencySymbol?: string
  vatPercentage?: number
  serviceChargePercentage?: number
}

export async function callProvisionRestaurant(
  supabaseUrl: string,
  accessToken: string,
  input: ProvisionRestaurantInput,
): Promise<{ restaurantId: string }> {
  const slug = slugify(input.name)

  const res = await fetch(`${supabaseUrl}/functions/v1/provision_restaurant`, {
    method: 'POST',
    headers: buildHeaders(accessToken),
    body: JSON.stringify({
      name: input.name,
      slug,
      owner_email: input.ownerEmail,
      owner_password: input.ownerPassword,
      ...(input.branchName ? { branch_name: input.branchName } : {}),
      currency_code: input.currencyCode ?? 'BDT',
      currency_symbol: input.currencySymbol ?? '৳',
      vat_percentage: input.vatPercentage ?? 0,
      service_charge_percentage: input.serviceChargePercentage ?? 0,
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

  const restaurant = json.data['restaurant'] as { id: string }
  return { restaurantId: restaurant.id }
}
