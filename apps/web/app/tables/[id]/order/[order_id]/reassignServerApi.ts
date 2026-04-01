const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''

export interface ServerOption {
  id: string
  name: string | null
  email: string
}

export async function fetchServerList(accessToken: string): Promise<ServerOption[]> {
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
  const url = new URL(`${supabaseUrl}/rest/v1/users`)
  url.searchParams.set('select', 'id,name,email,role')
  url.searchParams.set('is_active', 'eq.true')
  url.searchParams.set('role', 'in.(server,manager,owner)')
  url.searchParams.set('order', 'name.asc')

  const res = await fetch(url.toString(), {
    headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return []
  const rows = (await res.json()) as Array<{ id: string; name: string | null; email: string }>
  return rows.map(r => ({ id: r.id, name: r.name, email: r.email }))
}

export async function callReassignOrderServer(
  accessToken: string,
  orderId: string,
  newServerId: string,
): Promise<void> {
  const res = await fetch(`${supabaseUrl}/functions/v1/reassign_order_server`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ order_id: orderId, new_server_id: newServerId }),
  })
  if (!res.ok) {
    let message = 'Failed to reassign server'
    try {
      const data = (await res.json()) as { error?: string }
      if (data.error) message = data.error
    } catch { /* ignore */ }
    throw new Error(message)
  }
}
