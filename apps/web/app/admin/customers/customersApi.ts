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
}

export interface CustomerOrder {
  id: string
  created_at: string
  status: string
  final_total_cents: number | null
  bill_number: string | null
  order_type: string
  table_id: string | null
}

export async function fetchCustomers(
  supabaseUrl: string,
  supabaseKey: string,
  restaurantId: string,
  search: string = '',
): Promise<Customer[]> {
  let url = `${supabaseUrl}/rest/v1/customers?restaurant_id=eq.${encodeURIComponent(restaurantId)}&order=last_visit_at.desc.nullsfirst`
  if (search.trim()) {
    const s = encodeURIComponent(`%${search.trim()}%`)
    url += `&or=(mobile.ilike.${s},name.ilike.${s})`
  }
  const res = await fetch(url, {
    headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
  })
  if (!res.ok) throw new Error('Failed to fetch customers')
  return res.json() as Promise<Customer[]>
}

export async function fetchCustomerOrders(
  supabaseUrl: string,
  supabaseKey: string,
  restaurantId: string,
  mobile: string,
): Promise<CustomerOrder[]> {
  const url = `${supabaseUrl}/rest/v1/orders?restaurant_id=eq.${encodeURIComponent(restaurantId)}&customer_mobile=eq.${encodeURIComponent(mobile)}&status=in.(paid,pending_payment)&order=created_at.desc&select=id,created_at,status,final_total_cents,bill_number,order_type,table_id`
  const res = await fetch(url, {
    headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
  })
  if (!res.ok) throw new Error('Failed to fetch customer orders')
  return res.json() as Promise<CustomerOrder[]>
}

export async function updateCustomer(
  supabaseUrl: string,
  supabaseKey: string,
  accessToken: string,
  customerId: string,
  data: { name?: string; notes?: string },
): Promise<void> {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/customers?id=eq.${encodeURIComponent(customerId)}`,
    {
      method: 'PATCH',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(data),
    },
  )
  if (!res.ok) throw new Error('Failed to update customer')
}
