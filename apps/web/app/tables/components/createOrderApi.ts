export type OrderType = 'dine_in' | 'takeaway' | 'delivery'

export interface CreateOrderResponse {
  success: boolean
  data?: { order_id: string; status: string }
  error?: string
}

export interface CreateOrderResult {
  order_id: string
}

export interface CreateOrderOptions {
  tableId?: string
  orderType?: OrderType
  customerName?: string
  deliveryNote?: string
}

export async function callCreateOrder(
  supabaseUrl: string,
  accessToken: string,
  tableIdOrOptions: string | CreateOrderOptions,
  signal?: AbortSignal,
): Promise<CreateOrderResult> {
  // Support legacy call signature (tableId as string) for backward compatibility
  let opts: CreateOrderOptions
  if (typeof tableIdOrOptions === 'string') {
    opts = { tableId: tableIdOrOptions, orderType: 'dine_in' }
  } else {
    opts = tableIdOrOptions
  }

  const { tableId, orderType = 'dine_in', customerName, deliveryNote } = opts

  const bodyPayload: Record<string, string> = {
    order_type: orderType,
  }
  if (tableId) bodyPayload['table_id'] = tableId
  if (customerName) bodyPayload['customer_name'] = customerName
  if (deliveryNote) bodyPayload['delivery_note'] = deliveryNote

  const res = await fetch(`${supabaseUrl}/functions/v1/create_order`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(bodyPayload),
    signal,
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`create_order failed: ${res.status} ${res.statusText} — ${body}`)
  }
  const json = (await res.json()) as CreateOrderResponse
  if (!json.success || !json.data) {
    throw new Error(json.error ?? 'Failed to create order')
  }
  return { order_id: json.data.order_id }
}
