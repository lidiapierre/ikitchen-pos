const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''

export interface Customer {
  id: string
  restaurant_id: string
  mobile: string
  name: string | null
  notes: string | null
  visit_count: number
  total_spend_cents: number
  last_visit_at: string | null
  created_at: string
  // Extended profile fields (issue #356)
  date_of_birth: string | null
  email: string | null
  delivery_address: string | null
  loyalty_points: number
  membership_status: 'regular' | 'silver' | 'gold'
}

export interface CustomerOrder {
  id: string
  created_at: string
  status: string
  final_total_cents: number | null
  bill_number: string | null
  order_type: string
  table_id: string | null
  total_cents: number | null
}

export async function fetchCustomers(
  supabaseUrl: string,
  accessToken: string,
  restaurantId: string,
  search: string = '',
): Promise<Customer[]> {
  let url = `${supabaseUrl}/rest/v1/customers?restaurant_id=eq.${encodeURIComponent(restaurantId)}&order=last_visit_at.desc.nullsfirst`
  if (search.trim()) {
    const s = encodeURIComponent(`%${search.trim()}%`)
    url += `&or=(mobile.ilike.${s},name.ilike.${s})`
  }
  const res = await fetch(url, {
    headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error('Failed to fetch customers')
  return res.json() as Promise<Customer[]>
}

export async function fetchCustomerOrders(
  supabaseUrl: string,
  accessToken: string,
  restaurantId: string,
  mobile: string,
): Promise<CustomerOrder[]> {
  const url = `${supabaseUrl}/rest/v1/orders?restaurant_id=eq.${encodeURIComponent(restaurantId)}&customer_mobile=eq.${encodeURIComponent(mobile)}&status=in.(paid,pending_payment)&order=created_at.desc&select=id,created_at,status,final_total_cents,bill_number,order_type,table_id`
  const res = await fetch(url, {
    headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error('Failed to fetch customer orders')
  return res.json() as Promise<CustomerOrder[]>
}

/**
 * Fetch order history for a customer by their UUID (issue #276).
 * Uses orders.customer_id FK — covers all order types (dine-in, takeaway, delivery).
 */
export async function fetchCustomerOrdersById(
  supabaseUrl: string,
  accessToken: string,
  customerId: string,
): Promise<CustomerOrder[]> {
  const url = `${supabaseUrl}/rest/v1/orders?customer_id=eq.${encodeURIComponent(customerId)}&status=in.(paid,pending_payment)&select=id,order_type,status,created_at,final_total_cents,bill_number,table_id&order=created_at.desc&limit=20`
  const res = await fetch(url, {
    headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error('Failed to fetch customer orders')
  const rows = await res.json() as Array<{
    id: string
    order_type: string
    status: string
    created_at: string
    final_total_cents: number | null
    bill_number: string | null
    table_id: string | null
  }>
  return rows.map((r) => ({
    id: r.id,
    created_at: r.created_at,
    status: r.status,
    final_total_cents: r.final_total_cents,
    bill_number: r.bill_number,
    order_type: r.order_type,
    table_id: r.table_id,
    total_cents: null,
  }))
}

export async function updateCustomer(
  supabaseUrl: string,
  accessToken: string,
  customerId: string,
  data: {
    name?: string
    notes?: string
    date_of_birth?: string | null
    email?: string | null
    delivery_address?: string | null
  },
): Promise<void> {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/customers?id=eq.${encodeURIComponent(customerId)}`,
    {
      method: 'PATCH',
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(data),
    },
  )
  if (!res.ok) throw new Error('Failed to update customer')
}
