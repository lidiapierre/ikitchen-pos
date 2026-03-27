export interface Reservation {
  id: string
  restaurant_id: string
  customer_name: string
  customer_mobile: string | null
  party_size: number
  reservation_time: string | null
  table_id: string | null
  status: 'waiting' | 'seated' | 'cancelled' | 'no_show'
  notes: string | null
  created_at: string
}

export interface ReservationTable {
  id: string
  label: string
  seat_count: number
}

export interface CreateReservationInput {
  restaurant_id: string
  customer_name: string
  customer_mobile?: string
  party_size: number
  reservation_time?: string | null
  table_id?: string | null
  notes?: string
}

function buildHeaders(apiKey: string, accessToken?: string): Record<string, string> {
  return {
    apikey: apiKey,
    Authorization: `Bearer ${accessToken ?? apiKey}`,
    'Content-Type': 'application/json',
  }
}

export async function fetchReservations(
  supabaseUrl: string,
  apiKey: string,
  restaurantId: string,
  accessToken?: string,
): Promise<Reservation[]> {
  const url = new URL(`${supabaseUrl}/rest/v1/reservations`)
  url.searchParams.set('restaurant_id', `eq.${restaurantId}`)
  url.searchParams.set('status', 'in.(waiting,seated)')
  url.searchParams.set('order', 'reservation_time.asc.nullsfirst,created_at.asc')
  const res = await fetch(url.toString(), {
    headers: buildHeaders(apiKey, accessToken),
  })
  if (!res.ok) throw new Error('Failed to fetch reservations')
  return res.json() as Promise<Reservation[]>
}

export async function fetchTables(
  supabaseUrl: string,
  apiKey: string,
  restaurantId: string,
): Promise<ReservationTable[]> {
  const url = new URL(`${supabaseUrl}/rest/v1/tables`)
  url.searchParams.set('restaurant_id', `eq.${restaurantId}`)
  url.searchParams.set('select', 'id,label,seat_count')
  url.searchParams.set('order', 'label.asc')
  const res = await fetch(url.toString(), {
    headers: buildHeaders(apiKey),
  })
  if (!res.ok) throw new Error('Failed to fetch tables')
  return res.json() as Promise<ReservationTable[]>
}

export async function createReservation(
  supabaseUrl: string,
  apiKey: string,
  accessToken: string,
  input: CreateReservationInput,
): Promise<Reservation> {
  const res = await fetch(`${supabaseUrl}/rest/v1/reservations`, {
    method: 'POST',
    headers: {
      ...buildHeaders(apiKey, accessToken),
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      restaurant_id: input.restaurant_id,
      customer_name: input.customer_name,
      customer_mobile: input.customer_mobile ?? null,
      party_size: input.party_size,
      reservation_time: input.reservation_time ?? null,
      table_id: input.table_id ?? null,
      notes: input.notes ?? null,
    }),
  })
  if (!res.ok) throw new Error('Failed to create reservation')
  const rows = (await res.json()) as Reservation[]
  return rows[0]
}

export async function updateReservationStatus(
  supabaseUrl: string,
  apiKey: string,
  accessToken: string,
  reservationId: string,
  status: Reservation['status'],
  tableId?: string | null,
): Promise<void> {
  const body: Record<string, unknown> = { status }
  if (tableId !== undefined) body['table_id'] = tableId
  const res = await fetch(
    `${supabaseUrl}/rest/v1/reservations?id=eq.${encodeURIComponent(reservationId)}`,
    {
      method: 'PATCH',
      headers: {
        ...buildHeaders(apiKey, accessToken),
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(body),
    },
  )
  if (!res.ok) throw new Error('Failed to update reservation')
}
