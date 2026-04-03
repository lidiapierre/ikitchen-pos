import type { TableRow } from './tablesData'

/**
 * Overdue threshold in minutes.
 * TODO: make this configurable via the admin config table (key: 'table_overdue_minutes').
 */
export const OVERDUE_THRESHOLD_MINUTES = 120

export type TableStatus = 'available' | 'seated' | 'ordered' | 'overdue'

/**
 * Derive a table's display status from its current data snapshot.
 *
 * Priority rules:
 *  1. No active order → available
 *  2. Order created_at > 2 h ago → overdue  (takes priority over seated/ordered)
 *  3. At least one non-voided item → ordered
 *  4. Order exists but zero non-voided items → seated
 *
 * `pending_payment` orders are treated the same as `open` orders — there is no
 * longer a separate `bill_requested` status.
 */
export function getTableStatus(
  table: TableRow,
  nowMs: number = Date.now(),
): TableStatus {
  if (table.open_order_id === null) return 'available'

  if (table.order_created_at !== null) {
    const ageMs = nowMs - new Date(table.order_created_at).getTime()
    if (ageMs > OVERDUE_THRESHOLD_MINUTES * 60 * 1000) return 'overdue'
  }

  return (table.order_item_count ?? 0) > 0 ? 'ordered' : 'seated'
}

export interface StatusConfig {
  label: string
  cardClass: string
  badgeClass: string
}

export const STATUS_CONFIG: Record<TableStatus, StatusConfig> = {
  available: {
    label: 'Empty',
    // Off-white card, grey border — brand neutral
    cardClass: 'bg-brand-offwhite border-brand-grey hover:border-brand-blue',
    badgeClass: 'bg-brand-grey text-brand-navy',
  },
  seated: {
    label: 'Seated',
    // Brand blue — interactive/active state
    cardClass: 'bg-brand-blue border-brand-blue hover:bg-brand-blue/80',
    badgeClass: 'bg-brand-navy text-white',
  },
  ordered: {
    label: 'Ordered',
    // Brand navy — primary, prominent
    cardClass: 'bg-brand-navy border-brand-gold hover:bg-brand-navy/90',
    badgeClass: 'bg-brand-gold text-brand-navy',
  },
  overdue: {
    label: 'Overdue',
    // Red — keep semantic meaning clear
    cardClass: 'bg-red-900 border-red-500 hover:bg-red-800',
    badgeClass: 'bg-red-500 text-white',
  },
}
