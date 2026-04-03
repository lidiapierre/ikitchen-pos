export const PAYMENT_METHODS = ['cash', 'card', 'mobile'] as const
export type PaymentMethod = typeof PAYMENT_METHODS[number]

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  card: 'Card / POS',
  mobile: 'Mobile',
}
