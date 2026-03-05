export interface OrderItem {
  id: string
  name: string
  quantity: number
  price_cents: number
}

export const MOCK_ORDER_ITEMS: OrderItem[] = [
  { id: '1', name: 'Bruschetta', quantity: 2, price_cents: 850 },
  { id: '2', name: 'Grilled Salmon', quantity: 1, price_cents: 1850 },
  { id: '3', name: 'House Wine', quantity: 2, price_cents: 950 },
]
