export type Role = 'owner' | 'manager' | 'server' | 'kitchen'

export interface Restaurant {
  id: string
  name: string
  created_at: string
  updated_at: string
}

export interface User {
  id: string
  restaurant_id: string
  email: string
  role: Role
  created_at: string
  updated_at: string
}

export interface Table {
  id: string
  restaurant_id: string
  label: string
  created_at: string
  updated_at: string
}

export interface Menu {
  id: string
  restaurant_id: string
  name: string
  created_at: string
  updated_at: string
}

export interface MenuItem {
  id: string
  menu_id: string
  name: string
  price_cents: number
  created_at: string
  updated_at: string
}

export interface Modifier {
  id: string
  menu_item_id: string
  name: string
  price_delta_cents: number
  created_at: string
  updated_at: string
}

export type OrderStatus = 'open' | 'closed' | 'cancelled'

export interface Order {
  id: string
  restaurant_id: string
  table_id: string | null
  status: OrderStatus
  created_at: string
  updated_at: string
}

export interface OrderItem {
  id: string
  order_id: string
  menu_item_id: string
  quantity: number
  unit_price_cents: number
  voided: boolean
  created_at: string
  updated_at: string
}

export type PaymentMethod = 'cash' | 'card' | 'other'

export interface Payment {
  id: string
  order_id: string
  method: PaymentMethod
  amount_cents: number
  created_at: string
  updated_at: string
}

export interface Shift {
  id: string
  restaurant_id: string
  user_id: string
  opened_at: string
  closed_at: string | null
  created_at: string
  updated_at: string
}

export interface AuditLog {
  id: string
  restaurant_id: string
  user_id: string
  action: string
  entity_type: string
  entity_id: string
  payload: Record<string, unknown>
  created_at: string
}
