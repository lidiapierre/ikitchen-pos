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
  /** FK to customers table — populated when customer_mobile is known (issue #277) */
  customer_id: string | null
  /** ID of the linked dine-in order — set by the Seat action (issue #277) */
  linked_order_id?: string | null
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

/** Returns midnight UTC for "today" as an ISO string, e.g. "2026-04-03T00:00:00.000Z" */
export function todayStartUtc(): string {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return d.toISOString()
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
  // Show future/today bookings (reservation_time set) OR walk-ins created today.
  // Waitlist entries (reservation_time IS NULL) older than today are excluded so
  // the waitlist resets each day while preserving historical records in the DB.
  url.searchParams.set(
    'or',
    `(reservation_time.not.is.null,created_at.gte.${todayStartUtc()})`,
  )
  url.searchParams.set('order', 'reservation_time.asc.nullsfirst,created_at.asc')
  url.searchParams.set('select', 'id,restaurant_id,customer_name,customer_mobile,party_size,reservation_time,table_id,status,notes,created_at,customer_id')
  const res = await fetch(url.toString(), {
    headers: buildHeaders(apiKey, accessToken),
  })
  if (!res.ok) throw new Error('Failed to fetch reservations')
  const reservations = (await res.json()) as Reservation[]

  // For seated reservations, fetch the linked active order id (reservation_id FK on orders)
  const seatedIds = reservations.filter((r) => r.status === 'seated').map((r) => r.id)
  if (seatedIds.length === 0) return reservations
  try {
    const ordUrl = new URL(`${supabaseUrl}/rest/v1/orders`)
    ordUrl.searchParams.set('select', 'id,reservation_id')
    ordUrl.searchParams.set('reservation_id', `in.(${seatedIds.join(',')})`)
    ordUrl.searchParams.set('status', 'in.(open,pending_payment)')
    const ordRes = await fetch(ordUrl.toString(), { headers: buildHeaders(apiKey, accessToken) })
    if (ordRes.ok) {
      const orders = (await ordRes.json()) as Array<{ id: string; reservation_id: string }>
      const orderByReservation = new Map(orders.map((o) => [o.reservation_id, o.id]))
      return reservations.map((r) => ({
        ...r,
        linked_order_id: orderByReservation.get(r.id) ?? null,
      }))
    }
  } catch {
    // non-fatal — linked_order_id will just be undefined
  }
  return reservations
}

/** Fetch all reservations (past + upcoming) for a specific customer by customer_id. */
export async function fetchCustomerReservations(
  supabaseUrl: string,
  apiKey: string,
  accessToken: string,
  customerId: string,
): Promise<Reservation[]> {
  const url = new URL(`${supabaseUrl}/rest/v1/reservations`)
  url.searchParams.set('customer_id', `eq.${encodeURIComponent(customerId)}`)
  url.searchParams.set('select', 'id,restaurant_id,customer_name,customer_mobile,party_size,reservation_time,table_id,status,notes,created_at,customer_id')
  url.searchParams.set('order', 'reservation_time.desc.nullslast,created_at.desc')
  url.searchParams.set('limit', '20')
  const res = await fetch(url.toString(), {
    headers: buildHeaders(apiKey, accessToken),
  })
  if (!res.ok) throw new Error('Failed to fetch customer reservations')
  return res.json() as Promise<Reservation[]>
}

/**
 * Upsert a customer record for a reservation (match on restaurant_id + mobile).
 * Returns the customer_id. Logs and returns null on failure — caller must not block.
 */
export async function upsertCustomerForReservation(
  supabaseUrl: string,
  serviceKey: string,
  restaurantId: string,
  mobile: string,
  name: string,
): Promise<string | null> {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/customers`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation,resolution=merge-duplicates',
      },
      body: JSON.stringify({
        restaurant_id: restaurantId,
        mobile,
        name: name || null,
      }),
    })
    if (!res.ok) {
      console.error('[upsertCustomerForReservation] failed', res.status, await res.text())
      return null
    }
    const rows = (await res.json()) as Array<{ id: string }>
    return rows[0]?.id ?? null
  } catch (err) {
    console.error('[upsertCustomerForReservation] error', err)
    return null
  }
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
  // Step 1: Upsert customer if mobile is provided, to link customer_id
  let customerId: string | null = null
  if (input.customer_mobile?.trim()) {
    try {
      const custRes = await fetch(`${supabaseUrl}/rest/v1/customers`, {
        method: 'POST',
        headers: {
          ...buildHeaders(apiKey, accessToken),
          Prefer: 'return=representation,resolution=merge-duplicates',
        },
        body: JSON.stringify({
          restaurant_id: input.restaurant_id,
          mobile: input.customer_mobile.trim(),
          name: input.customer_name || null,
        }),
      })
      if (custRes.ok) {
        const custRows = (await custRes.json()) as Array<{ id: string }>
        customerId = custRows[0]?.id ?? null
      } else {
        console.error('[createReservation] customer upsert failed', custRes.status, await custRes.text())
      }
    } catch (err) {
      console.error('[createReservation] customer upsert error', err)
      // Non-fatal: proceed without customer linkage
    }
  }

  // Step 2: Insert the reservation (with customer_id if available)
  const reservationBody: Record<string, unknown> = {
    restaurant_id: input.restaurant_id,
    customer_name: input.customer_name,
    customer_mobile: input.customer_mobile ?? null,
    party_size: input.party_size,
    reservation_time: input.reservation_time ?? null,
    table_id: input.table_id ?? null,
    notes: input.notes ?? null,
  }
  if (customerId !== null) reservationBody['customer_id'] = customerId

  const res = await fetch(`${supabaseUrl}/rest/v1/reservations`, {
    method: 'POST',
    headers: {
      ...buildHeaders(apiKey, accessToken),
      Prefer: 'return=representation',
    },
    body: JSON.stringify(reservationBody),
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

/**
 * Seat a reservation:
 * 1. Creates a dine-in order for the table
 * 2. PATCHes the order to set reservation_id
 * 3. PATCHes the reservation to status=seated
 * Returns the new order_id.
 */
export async function seatReservation(
  supabaseUrl: string,
  apiKey: string,
  accessToken: string,
  reservation: Reservation,
  tableId: string,
): Promise<string> {
  // Step 1: Create dine-in order via edge function
  const createRes = await fetch(`${supabaseUrl}/functions/v1/create_order`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      order_type: 'dine_in',
      table_id: tableId,
    }),
  })
  if (!createRes.ok) {
    const text = await createRes.text()
    throw new Error(`Failed to create order: ${createRes.status} — ${text}`)
  }
  const createJson = (await createRes.json()) as { success: boolean; data?: { order_id: string }; error?: string }
  if (!createJson.success || !createJson.data) {
    throw new Error(createJson.error ?? 'Failed to create order')
  }
  const orderId = createJson.data.order_id

  // Step 2: Link reservation_id on the order
  const patchOrderRes = await fetch(
    `${supabaseUrl}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`,
    {
      method: 'PATCH',
      headers: {
        ...buildHeaders(apiKey, accessToken),
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ reservation_id: reservation.id }),
    },
  )
  if (!patchOrderRes.ok) {
    // Non-fatal: log but don't block navigation
    console.error('[seatReservation] failed to link reservation_id on order', await patchOrderRes.text())
  }

  // Step 3: Mark reservation as seated (update table_id too if changed)
  await updateReservationStatus(supabaseUrl, apiKey, accessToken, reservation.id, 'seated', tableId)

  return orderId
}
