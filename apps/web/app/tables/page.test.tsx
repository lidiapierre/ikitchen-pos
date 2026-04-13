import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { JSX } from 'react'
import TablesPage, { computeDeliveryChargeCents } from './page'
import { fetchTables } from './tablesData'
import type { TableRow } from './tablesData'

vi.mock('./tablesData', () => ({
  fetchTables: vi.fn(),
  fetchTakeawayDeliveryQueue: vi.fn().mockResolvedValue([]),
}))

vi.mock('./components/TableCard', () => ({
  default: ({ table }: { table: TableRow }): JSX.Element => (
    <div data-testid="table-card">{table.label}</div>
  ),
}))

vi.mock('@/lib/user-context', () => ({
  useUser: () => ({ accessToken: 'test-key', role: 'owner', isAdmin: true, loading: false }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('./components/FloorPlanView', () => ({
  default: (): JSX.Element => <div data-testid="floor-plan-view">FloorPlan</div>,
}))

vi.mock('@/lib/tablesCache', () => ({
  getTablesCache: () => null,
  setTablesCache: vi.fn(),
}))

const MOCK_TABLES: TableRow[] = [
  { id: 'table-uuid-001', label: '1', open_order_id: null, order_status: null, order_created_at: null, order_item_count: null, grid_x: null, grid_y: null, section_id: null, section_name: null, assigned_server_name: null, section_sort_order: null, merge_label: null, locked_by_order_id: null, primary_table_id: null },
  { id: 'table-uuid-002', label: '2', open_order_id: 'order-uuid-001', order_status: 'open', order_created_at: '2026-03-27T10:00:00Z', order_item_count: 1, grid_x: null, grid_y: null, section_id: null, section_name: null, assigned_server_name: null, section_sort_order: null, merge_label: null, locked_by_order_id: null, primary_table_id: null },
  { id: 'table-uuid-003', label: '3', open_order_id: null, order_status: null, order_created_at: null, order_item_count: null, grid_x: null, grid_y: null, section_id: null, section_name: null, assigned_server_name: null, section_sort_order: null, merge_label: null, locked_by_order_id: null, primary_table_id: null },
]

const originalEnv = process.env

beforeEach(() => {
  process.env = {
    ...originalEnv,
    NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-key',
  }
  vi.mocked(fetchTables).mockResolvedValue(MOCK_TABLES)
})

afterEach(() => {
  process.env = originalEnv
  vi.clearAllMocks()
})

describe('TablesPage', () => {
  describe('loading state', () => {
    it('shows "Loading tables…" while fetching', () => {
      vi.mocked(fetchTables).mockImplementation(() => new Promise(() => {}))
      render(<TablesPage />)
      expect(screen.getByText('Loading tables…')).toBeInTheDocument()
    })
  })

  describe('error state', () => {
    it('shows error message when Supabase is not configured', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = ''
      render(<TablesPage />)
      expect(await screen.findByText('Supabase is not configured')).toBeInTheDocument()
    })

    it('shows error message when fetchTables rejects', async () => {
      vi.mocked(fetchTables).mockRejectedValue(new Error('Network error'))
      render(<TablesPage />)
      expect(await screen.findByText('Network error')).toBeInTheDocument()
    })
  })

  describe('empty state', () => {
    it('shows "No tables configured." when no tables are returned', async () => {
      vi.mocked(fetchTables).mockResolvedValue([])
      render(<TablesPage />)
      expect(await screen.findByText('No tables configured.')).toBeInTheDocument()
    })
  })

  describe('success state', () => {
    it('renders the Tables heading', async () => {
      render(<TablesPage />)
      expect(await screen.findByRole('heading', { name: 'Tables' })).toBeInTheDocument()
    })

    it('renders one card for each table returned', async () => {
      render(<TablesPage />)
      await screen.findByRole('heading', { name: 'Tables' })
      expect(screen.getAllByTestId('table-card')).toHaveLength(3)
    })

    it('calls fetchTables with the configured Supabase URL and key', async () => {
      render(<TablesPage />)
      await screen.findByRole('heading', { name: 'Tables' })
      expect(vi.mocked(fetchTables)).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'test-key',
      )
    })
  })
})

// ─── computeDeliveryChargeCents — pure function unit tests (issue #393) ────────
// The IIFE in handleCreateDelivery was extracted so all three branches can be
// covered without mounting TablesPage.
describe('computeDeliveryChargeCents', () => {
  describe('zone selected path', () => {
    it('returns zone.charge_amount when a zone is selected (ignores isFree and customChargeStr)', () => {
      expect(computeDeliveryChargeCents({ charge_amount: 9900 }, false, '')).toBe(9900)
    })

    it('returns zone.charge_amount even when isFree is true (zone takes precedence)', () => {
      expect(computeDeliveryChargeCents({ charge_amount: 5000 }, true, '')).toBe(5000)
    })

    it('returns zone.charge_amount even when customChargeStr has a value (zone takes precedence)', () => {
      expect(computeDeliveryChargeCents({ charge_amount: 19900 }, false, '99')).toBe(19900)
    })
  })

  describe('free delivery toggle path (no zone)', () => {
    it('returns 0 when isFree is true and no zone is selected', () => {
      expect(computeDeliveryChargeCents(null, true, '')).toBe(0)
    })

    it('returns 0 when isFree is true even if customChargeStr has a value', () => {
      expect(computeDeliveryChargeCents(null, true, '49.50')).toBe(0)
    })
  })

  describe('manual custom charge path (no zone, not free)', () => {
    it('converts a valid BDT amount string to cents', () => {
      expect(computeDeliveryChargeCents(null, false, '49.50')).toBe(4950)
    })

    it('converts an integer amount string to cents', () => {
      expect(computeDeliveryChargeCents(null, false, '100')).toBe(10000)
    })

    it('returns 0 for an empty string', () => {
      expect(computeDeliveryChargeCents(null, false, '')).toBe(0)
    })

    it('returns 0 for a negative value (clamps to 0)', () => {
      expect(computeDeliveryChargeCents(null, false, '-5')).toBe(0)
    })

    it('returns 0 for a non-numeric string (NaN guard)', () => {
      expect(computeDeliveryChargeCents(null, false, 'abc')).toBe(0)
    })

    it('returns 0 for "0"', () => {
      expect(computeDeliveryChargeCents(null, false, '0')).toBe(0)
    })
  })
})
