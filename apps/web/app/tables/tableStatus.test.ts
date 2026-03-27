import { describe, it, expect } from 'vitest'
import { getTableStatus, OVERDUE_THRESHOLD_MINUTES } from './tableStatus'
import type { TableRow } from './tablesData'

function makeTable(overrides: Partial<TableRow> = {}): TableRow {
  return {
    id: 'table-1',
    label: 'T1',
    open_order_id: null,
    order_status: null,
    order_created_at: null,
    ...overrides,
  }
}

const NOW = new Date('2026-03-27T12:00:00Z').getTime()
const RECENT = new Date('2026-03-27T11:30:00Z').toISOString()   // 30 min ago → occupied
const OVERDUE_AT = new Date(NOW - (OVERDUE_THRESHOLD_MINUTES + 1) * 60 * 1000).toISOString() // just past threshold

describe('getTableStatus', () => {
  it('returns "available" when there is no open order', () => {
    expect(getTableStatus(makeTable(), NOW)).toBe('available')
  })

  it('returns "occupied" when there is a recent open order', () => {
    const table = makeTable({ open_order_id: 'order-1', order_status: 'open', order_created_at: RECENT })
    expect(getTableStatus(table, NOW)).toBe('occupied')
  })

  it('returns "bill_requested" when order status is pending_payment', () => {
    const table = makeTable({ open_order_id: 'order-1', order_status: 'pending_payment', order_created_at: RECENT })
    expect(getTableStatus(table, NOW)).toBe('bill_requested')
  })

  it('returns "overdue" when order is open and past the threshold', () => {
    const table = makeTable({ open_order_id: 'order-1', order_status: 'open', order_created_at: OVERDUE_AT })
    expect(getTableStatus(table, NOW)).toBe('overdue')
  })

  it('prioritises "bill_requested" over overdue age', () => {
    const table = makeTable({ open_order_id: 'order-1', order_status: 'pending_payment', order_created_at: OVERDUE_AT })
    expect(getTableStatus(table, NOW)).toBe('bill_requested')
  })

  it('returns "occupied" when order_created_at is null but order exists', () => {
    const table = makeTable({ open_order_id: 'order-1', order_status: 'open', order_created_at: null })
    expect(getTableStatus(table, NOW)).toBe('occupied')
  })
})
