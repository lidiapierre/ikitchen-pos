import { describe, it, expect, beforeEach } from 'vitest'
import {
  getTablesCache,
  setTablesCache,
  invalidateTablesCache,
} from './tablesCache'
import type { TableRow, TakeawayDeliveryOrder } from '@/app/tables/tablesData'

const TABLES: TableRow[] = [
  {
    id: 'table-1',
    label: 'Table 1',
    open_order_id: null,
    order_status: null,
    order_created_at: null,
    order_item_count: null,
    grid_x: null,
    grid_y: null, section_id: null, section_name: null, assigned_server_name: null,
  },
  {
    id: 'table-2',
    label: 'Table 2',
    open_order_id: 'order-1',
    order_status: 'open',
    order_created_at: '2026-03-31T05:00:00Z',
    order_item_count: 3,
    grid_x: null,
    grid_y: null, section_id: null, section_name: null, assigned_server_name: null,
  },
]

const QUEUE: TakeawayDeliveryOrder[] = [
  {
    id: 'order-99',
    order_type: 'takeaway',
    customer_name: null,
    delivery_note: null,
    status: 'open',
    created_at: '2026-03-31T06:00:00Z',
    item_count: 2,
  },
]

beforeEach(() => {
  invalidateTablesCache()
})

describe('getTablesCache', () => {
  it('returns null when cache is empty', () => {
    expect(getTablesCache()).toBeNull()
  })

  it('returns stored tables and queue after setTablesCache', () => {
    setTablesCache(TABLES, QUEUE)
    const result = getTablesCache()
    expect(result).not.toBeNull()
    expect(result?.tables).toEqual(TABLES)
    expect(result?.queue).toEqual(QUEUE)
  })
})

describe('setTablesCache', () => {
  it('overwrites previously cached data', () => {
    setTablesCache(TABLES, QUEUE)

    const updatedTables: TableRow[] = [
      { ...TABLES[0], label: 'Updated Table 1' },
    ]
    setTablesCache(updatedTables, [])

    const result = getTablesCache()
    expect(result?.tables).toHaveLength(1)
    expect(result?.tables[0].label).toBe('Updated Table 1')
    expect(result?.queue).toHaveLength(0)
  })

  it('stores an empty queue', () => {
    setTablesCache(TABLES, [])
    expect(getTablesCache()?.queue).toHaveLength(0)
  })
})

describe('invalidateTablesCache', () => {
  it('clears cached data', () => {
    setTablesCache(TABLES, QUEUE)
    invalidateTablesCache()
    expect(getTablesCache()).toBeNull()
  })

  it('is safe to call when cache is already empty', () => {
    expect(() => invalidateTablesCache()).not.toThrow()
  })
})
