import type { TableRow } from './tablesData'

/**
 * Overdue threshold in minutes.
 * TODO: make this configurable via the admin config table (key: 'table_overdue_minutes').
 */
export const OVERDUE_THRESHOLD_MINUTES = 120

export type TableStatus = 'available' | 'seated' | 'ordered' | 'overdue' | 'merged' | 'due'

/**
 * Derive a table's display status from its current data snapshot.
 *
 * Priority rules:
 *  1. locked_by_order_id set → merged (secondary table, part of a merge)
 *  2. No active order → available
 *  3. order_status === 'due' → due (bill presented, payment deferred — issue #370)
 *  4. Order created_at > 2 h ago → overdue  (takes priority over seated/ordered)
 *  5. At least one non-voided item → ordered
 *  6. Order exists but zero non-voided items → seated
 *
 * `pending_payment` orders are treated the same as `open` orders - there is no
 * longer a separate `bill_requested` status.
 */
export function getTableStatus(
  table: TableRow,
  nowMs: number = Date.now(),
): TableStatus {
  // Secondary table locked in a merge - show as "Merged"
  if (table.locked_by_order_id !== null && table.open_order_id === null) return 'merged'

  if (table.open_order_id === null) return 'available'

  // Due status: bill presented, awaiting deferred payment (issue #370)
  if (table.order_status === 'due') return 'due'

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
  labelClass: string
}

export const STATUS_CONFIG: Record<TableStatus, StatusConfig> = {
  available: {
    label: 'Empty',
    // Quiet neutral card, still visible against the off-white floor canvas.
    cardClass: 'bg-white border-brand-grey/80 hover:border-brand-blue shadow-sm',
    badgeClass: 'bg-brand-offwhite text-brand-navy border border-brand-grey/70',
    labelClass: 'text-brand-navy',
  },
  seated: {
    label: 'Seated',
    // Blue tint keeps it clearly distinct from empty and ordered.
    cardClass: 'bg-brand-blue/15 border-brand-blue hover:bg-brand-blue/20 shadow-sm',
    badgeClass: 'bg-brand-blue text-white border border-brand-blue',
    labelClass: 'text-brand-navy',
  },
  ordered: {
    label: 'Ordered',
    // Gold is the highest-signal "active order" state in the new palette.
    cardClass: 'bg-brand-gold/20 border-brand-gold hover:bg-brand-gold/25 shadow-sm',
    badgeClass: 'bg-brand-gold text-brand-navy border border-brand-gold',
    labelClass: 'text-brand-navy',
  },
  overdue: {
    label: 'Overdue',
    // Keep semantic danger red so it cannot be confused with the brand statuses.
    cardClass: 'bg-red-50 border-red-500 hover:bg-red-100 shadow-sm',
    badgeClass: 'bg-red-600 text-white border border-red-600',
    labelClass: 'text-red-900',
  },
  merged: {
    label: 'Merged',
    // Purple/violet to clearly distinguish from other states (issue #274).
    cardClass: 'bg-purple-50 border-purple-400 hover:bg-purple-100 shadow-sm',
    badgeClass: 'bg-purple-600 text-white border border-purple-600',
    labelClass: 'text-purple-900',
  },
  due: {
    label: 'Due',
    // Orange to indicate bill presented, payment pending (issue #370).
    cardClass: 'bg-orange-50 border-orange-400 hover:bg-orange-100 shadow-sm',
    badgeClass: 'bg-orange-500 text-white border border-orange-500',
    labelClass: 'text-orange-900',
  },
}
