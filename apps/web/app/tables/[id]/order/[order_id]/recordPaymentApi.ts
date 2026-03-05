export interface RecordPaymentResponse {
  success: boolean
  data?: { payment_id: string; change_due: number }
  error?: string
}

export async function callRecordPayment(
  supabaseUrl: string,
  apiKey: string,
  orderId: string,
  amountCents: number,
  method: 'cash' | 'card',
): Promise<void> {
  const res = await fetch(`${supabaseUrl}/functions/v1/record_payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
      'x-demo-staff-id': '00000000-0000-0000-0000-000000000010',
    },
    body: JSON.stringify({ order_id: orderId, amount: amountCents, method }),
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  const json = (await res.json()) as RecordPaymentResponse
  if (!json.success) {
    throw new Error(json.error ?? 'Failed to record payment')
  }
}
