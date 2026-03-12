export interface VatRate {
  id: string
  restaurant_id: string
  label: string
  percentage: number
  menu_id: string | null
}

export interface PricingMenuItem {
  id: string
  name: string
  price_cents: number
}

export interface PricingCategory {
  id: string
  name: string
  items: PricingMenuItem[]
}

export interface PricingAdminData {
  restaurantId: string
  vatRates: VatRate[]
  categories: PricingCategory[]
  taxInclusive: boolean
}

interface VatRateRow {
  id: string
  restaurant_id: string
  label: string
  percentage: number
  menu_id: string | null
}

interface MenuItemRow {
  id: string
  name: string
  price_cents: number
}

interface MenuRow {
  id: string
  name: string
  menu_items: MenuItemRow[]
}

interface ConfigRow {
  key: string
  value: string
}

interface RestaurantRow {
  id: string
}

async function fetchRestaurantId(supabaseUrl: string, apiKey: string): Promise<string> {
  const headers = { apikey: apiKey, Authorization: `Bearer ${apiKey}` }
  const url = new URL(`${supabaseUrl}/rest/v1/restaurants`)
  url.searchParams.set('select', 'id')
  url.searchParams.set('limit', '1')
  const res = await fetch(url.toString(), { headers })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Failed to fetch restaurant: ${res.status} ${res.statusText} — ${body}`)
  }
  const rows = (await res.json()) as RestaurantRow[]
  if (rows.length === 0) throw new Error('No restaurant found')
  return rows[0].id
}

async function fetchVatRates(
  supabaseUrl: string,
  apiKey: string,
  restaurantId: string,
): Promise<VatRate[]> {
  const headers = { apikey: apiKey, Authorization: `Bearer ${apiKey}` }
  const url = new URL(`${supabaseUrl}/rest/v1/vat_rates`)
  url.searchParams.set('select', 'id,restaurant_id,label,percentage,menu_id')
  url.searchParams.set('restaurant_id', `eq.${restaurantId}`)
  const res = await fetch(url.toString(), { headers })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Failed to fetch VAT rates: ${res.status} ${res.statusText} — ${body}`)
  }
  const rows = (await res.json()) as VatRateRow[]
  return rows.map((r) => ({
    id: r.id,
    restaurant_id: r.restaurant_id,
    label: r.label,
    percentage: Number(r.percentage),
    menu_id: r.menu_id,
  }))
}

async function fetchCategories(
  supabaseUrl: string,
  apiKey: string,
): Promise<PricingCategory[]> {
  const headers = { apikey: apiKey, Authorization: `Bearer ${apiKey}` }
  const url = new URL(`${supabaseUrl}/rest/v1/menus`)
  url.searchParams.set('select', 'id,name,menu_items(id,name,price_cents)')
  const res = await fetch(url.toString(), { headers })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Failed to fetch categories: ${res.status} ${res.statusText} — ${body}`)
  }
  const rows = (await res.json()) as MenuRow[]
  return rows.map((menu) => ({
    id: menu.id,
    name: menu.name,
    items: (menu.menu_items ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      price_cents: item.price_cents,
    })),
  }))
}

async function fetchTaxInclusive(
  supabaseUrl: string,
  apiKey: string,
  restaurantId: string,
): Promise<boolean> {
  const headers = { apikey: apiKey, Authorization: `Bearer ${apiKey}` }
  const url = new URL(`${supabaseUrl}/rest/v1/config`)
  url.searchParams.set('select', 'key,value')
  url.searchParams.set('restaurant_id', `eq.${restaurantId}`)
  url.searchParams.set('key', 'eq.tax_inclusive')
  url.searchParams.set('limit', '1')
  const res = await fetch(url.toString(), { headers })
  if (!res.ok) {
    return false
  }
  const rows = (await res.json()) as ConfigRow[]
  if (rows.length === 0) return false
  return rows[0].value === 'true'
}

export async function fetchPricingAdminData(
  supabaseUrl: string,
  apiKey: string,
): Promise<PricingAdminData> {
  const restaurantId = await fetchRestaurantId(supabaseUrl, apiKey)
  const [vatRates, categories, taxInclusive] = await Promise.all([
    fetchVatRates(supabaseUrl, apiKey, restaurantId),
    fetchCategories(supabaseUrl, apiKey),
    fetchTaxInclusive(supabaseUrl, apiKey, restaurantId),
  ])
  return { restaurantId, vatRates, categories, taxInclusive }
}
