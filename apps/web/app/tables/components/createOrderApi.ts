export interface CreateOrderResponse {
  success: boolean
  data?: { order_id: string; status: string }
  error?: string
}

export interface CreateOrderResult {
  order_id: string
}

const REQUEST_TIMEOUT_MS = 10_000

export async function callCreateOrder(
  supabaseUrl: string,
  apiKey: string,
  tableId: number,
): Promise<CreateOrderResult> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/create_order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        apikey: apiKey,
      },
      body: JSON.stringify({ table_id: tableId, staff_id: 'placeholder-staff' }),
      signal: controller.signal,
    })
    const json = (await res.json()) as CreateOrderResponse
    if (!json.success || !json.data) {
      throw new Error(json.error ?? 'Failed to create order')
    }
    return { order_id: json.data.order_id }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.')
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}
