import type { TableRow } from './tablesData'

/**
 * Overdue threshold in minutes.
 * TODO: make this configurable via the admin config table (key: 'table_overdue_minutes').
 */
export const OVERDUE_THRESHOLD_MINUTES = 120

export type TableStatus = 'available' | 'occupied' | 'bill_requested' | 'overdue'

export function getTableStatus(
  table: TableRow,
  nowMs: number = Date.now(),
): TableStatus {
  if (table.open_order_id === null) return 'available'

  if (table.order_status === 'pending_payment') return 'bill_requested'

  if (table.order_created_at !== null) {
    const ageMs = nowMs - new Date(table.order_created_at).getTime()
    if (ageMs > OVERDUE_THRESHOLD_MINUTES * 60 * 1000) return 'overdue'
  }

  return 'occupied'
}

export interface StatusConfig {
  label: string
  cardClass: string
  badgeClass: string
}

export const STATUS_CONFIG: Record<TableStatus, StatusConfig> = {
  available: {
    label: 'Empty',
    cardClass: 'bg-zinc-800 border-zinc-600 hover:border-zinc-400',
    badgeClass: 'bg-zinc-700 text-zinc-300',
  },
  occupied: {
    label: 'Occupied',
    cardClass: 'bg-green-900 border-green-600 hover:bg-green-800',
    badgeClass: 'bg-green-600 text-white',
  },
  bill_requested: {
    label: 'Bill Requested',
    cardClass: 'bg-orange-900 border-orange-500 hover:bg-orange-800',
    badgeClass: 'bg-orange-500 text-white',
  },
  overdue: {
    label: 'Overdue',
    cardClass: 'bg-red-900 border-red-500 hover:bg-red-800',
    badgeClass: 'bg-red-500 text-white',
  },
}
