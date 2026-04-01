export interface ShiftRevenue {
  orderCount: number
  totalCents: number
  cashCents: number
  cardCents: number
}

type PaymentRow = {
  order_id: string
  method: string
  amount_cents: number
}

export async function fetchShiftRevenue(openedAt: string, closedAt: string, accessToken?: string): Promise<ShiftRevenue> {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
  const url =
    `${baseUrl}/rest/v1/payments` +
    `?select=order_id,method,amount_cents,orders!inner(status)` +
    `&orders.status=eq.paid` +
    `&created_at=gte.${encodeURIComponent(openedAt)}` +
    `&created_at=lte.${encodeURIComponent(closedAt)}`

  const headers: Record<string, string> = {}
  if (publishableKey) {
    headers['apikey'] = publishableKey
    headers['Authorization'] = `Bearer ${accessToken ?? publishableKey}`
  }

  const res = await fetch(url, { headers })
  if (!res.ok) {
    throw new Error(`Failed to fetch shift revenue: ${res.status}`)
  }

  const rows = (await res.json()) as PaymentRow[]

  const orderIds = new Set<string>()
  let totalCents = 0
  let cashCents = 0
  let cardCents = 0

  for (const row of rows) {
    orderIds.add(row.order_id)
    totalCents += row.amount_cents
    if (row.method === 'cash') {
      cashCents += row.amount_cents
    } else if (row.method === 'card') {
      cardCents += row.amount_cents
    }
  }

  return { orderCount: orderIds.size, totalCents, cashCents, cardCents }
}

export { formatPrice as formatDollars } from '@/lib/formatPrice'
