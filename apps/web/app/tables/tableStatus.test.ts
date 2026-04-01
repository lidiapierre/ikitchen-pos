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
    order_item_count: null,
    grid_x: null,
    grid_y: null,
    section_id: null,
    section_name: null,
    assigned_server_name: null,
    ...overrides,
  }
}

const NOW = new Date('2026-03-27T12:00:00Z').getTime()
const RECENT = new Date('2026-03-27T11:30:00Z').toISOString()   // 30 min ago → not overdue
const OVERDUE_AT = new Date(NOW - (OVERDUE_THRESHOLD_MINUTES + 1) * 60 * 1000).toISOString() // just past threshold

describe('getTableStatus', () => {
  it('returns "available" when there is no open order', () => {
    expect(getTableStatus(makeTable(), NOW)).toBe('available')
  })

  it('returns "seated" when an order exists but has zero non-voided items', () => {
    const table = makeTable({
      open_order_id: 'order-1',
      order_status: 'open',
      order_created_at: RECENT,
      order_item_count: 0,
    })
    expect(getTableStatus(table, NOW)).toBe('seated')
  })

  it('returns "seated" when order_item_count is null and not overdue', () => {
    const table = makeTable({
      open_order_id: 'order-1',
      order_status: 'open',
      order_created_at: RECENT,
      order_item_count: null,
    })
    expect(getTableStatus(table, NOW)).toBe('seated')
  })

  it('returns "ordered" when order has at least one non-voided item', () => {
    const table = makeTable({
      open_order_id: 'order-1',
      order_status: 'open',
      order_created_at: RECENT,
      order_item_count: 3,
    })
    expect(getTableStatus(table, NOW)).toBe('ordered')
  })

  it('returns "overdue" when order is past the threshold, regardless of item count', () => {
    const tableNoItems = makeTable({
      open_order_id: 'order-1',
      order_status: 'open',
      order_created_at: OVERDUE_AT,
      order_item_count: 0,
    })
    expect(getTableStatus(tableNoItems, NOW)).toBe('overdue')

    const tableWithItems = makeTable({
      open_order_id: 'order-1',
      order_status: 'open',
      order_created_at: OVERDUE_AT,
      order_item_count: 2,
    })
    expect(getTableStatus(tableWithItems, NOW)).toBe('overdue')
  })

  it('treats pending_payment + items as "ordered" (no bill_requested status)', () => {
    const table = makeTable({
      open_order_id: 'order-1',
      order_status: 'pending_payment',
      order_created_at: RECENT,
      order_item_count: 2,
    })
    expect(getTableStatus(table, NOW)).toBe('ordered')
  })

  it('treats pending_payment + no items as "seated"', () => {
    const table = makeTable({
      open_order_id: 'order-1',
      order_status: 'pending_payment',
      order_created_at: RECENT,
      order_item_count: 0,
    })
    expect(getTableStatus(table, NOW)).toBe('seated')
  })

  it('treats pending_payment + overdue as "overdue" (overdue takes priority)', () => {
    const table = makeTable({
      open_order_id: 'order-1',
      order_status: 'pending_payment',
      order_created_at: OVERDUE_AT,
      order_item_count: 2,
    })
    expect(getTableStatus(table, NOW)).toBe('overdue')
  })

  it('returns "seated" when order_created_at is null but order exists', () => {
    const table = makeTable({
      open_order_id: 'order-1',
      order_status: 'open',
      order_created_at: null,
      order_item_count: 0,
    })
    expect(getTableStatus(table, NOW)).toBe('seated')
  })
})
