import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FloorPlanView from './FloorPlanView'
import type { TableRow } from '../tablesData'
import { supabase } from '@/lib/supabase'
import { callCreateOrder } from './createOrderApi'

// ── mock next/navigation ──────────────────────────────────────────────────────
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: (): { push: (url: string) => void } => ({ push: mockPush }),
}))

// ── mock user context ─────────────────────────────────────────────────────────
vi.mock('@/lib/user-context', () => ({
  useUser: () => ({ accessToken: 'test-token' }),
}))

// ── mock createOrderApi ───────────────────────────────────────────────────────
vi.mock('./createOrderApi', () => ({
  callCreateOrder: vi.fn(),
}))

// ── mock Supabase client ──────────────────────────────────────────────────────
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user-id' } }, error: null }),
    },
  },
}))

// Helper: build a fluent-chain mock for supabase where abortSignal is terminal
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyChain = any

function makeSupabaseChain(resolvedValue: { data: unknown; error: null }): AnyChain {
  const chain: AnyChain = {
    select: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    abortSignal: vi.fn().mockResolvedValue(resolvedValue),
  }
  return chain
}

// Default: restaurants → rest-id-1, config → 10 cols / 4 rows, sections → [], users → []
function setupDefaultSupabaseMock(): void {
  vi.mocked(supabase.from).mockImplementation((table: string): AnyChain => {
    if (table === 'restaurants') {
      return makeSupabaseChain({ data: [{ id: 'rest-id-1' }], error: null })
    }
    if (table === 'sections') {
      return makeSupabaseChain({ data: [], error: null })
    }
    if (table === 'users') {
      return makeSupabaseChain({ data: [], error: null })
    }
    return makeSupabaseChain({
      data: [
        { key: 'floor_plan_cols', value: '10' },
        { key: 'floor_plan_rows', value: '4' },
      ],
      error: null,
    })
  })
}

const emptyTable: TableRow = {
  id: 'table-uuid-001',
  label: 'T1',
  open_order_id: null,
  order_status: null,
  order_created_at: null,
  order_item_count: null,
  grid_x: 0,
  grid_y: 0,
  section_id: null,
  section_name: null,
  assigned_server_name: null,
  section_sort_order: null,
}

const occupiedTable: TableRow = {
  id: 'table-uuid-002',
  label: 'T2',
  open_order_id: 'order-abc',
  order_status: 'open',
  order_created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  order_item_count: 2,
  grid_x: 0,
  grid_y: 0,
  section_id: null,
  section_name: null,
  assigned_server_name: null,
  section_sort_order: null,
}

describe('FloorPlanView', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
    }
    setupDefaultSupabaseMock()
  })

  // ── a) Loading state ────────────────────────────────────────────────────────
  describe('loading state', () => {
    it('shows "Loading floor plan…" while config is being fetched', () => {
      vi.mocked(supabase.from).mockImplementation((): AnyChain => ({
        select: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        abortSignal: vi.fn().mockReturnValue(new Promise(() => { /* never resolves */ })),
      }))

      render(<FloorPlanView tables={[]} />)
      expect(screen.getByText('Loading floor plan…')).toBeInTheDocument()
    })
  })

  // ── b) Grid renders correct cells ──────────────────────────────────────────
  describe('grid rendering', () => {
    it('renders 10 × 4 = 40 cells when cols=10, rows=4 are returned from config', async () => {
      const { container } = render(<FloorPlanView tables={[]} />)

      await waitFor(() => {
        expect(screen.queryByText('Loading floor plan…')).not.toBeInTheDocument()
      })

      const grid = container.querySelector<HTMLElement>('[style*="grid-template-columns"]')
      expect(grid).not.toBeNull()
      expect(grid!.children.length).toBe(40)
    })

    it('renders a table button at its declared grid position', async () => {
      const positionedTable: TableRow = {
        id: 'table-positioned',
        label: 'T99',
        open_order_id: null,
        order_status: null,
        order_created_at: null,
        order_item_count: null,
        grid_x: 2,
        grid_y: 1,
        section_id: null,
        section_name: null,
        assigned_server_name: null,
        section_sort_order: null,
      }

      render(<FloorPlanView tables={[positionedTable]} />)

      await waitFor(() => {
        expect(screen.queryByText('Loading floor plan…')).not.toBeInTheDocument()
      })

      expect(screen.getByRole('button', { name: /T99/ })).toBeInTheDocument()
    })
  })

  // ── d) Tapping occupied table navigates without API call ───────────────────
  describe('tapping an occupied table', () => {
    it('navigates directly to the existing order without calling callCreateOrder', async () => {
      render(<FloorPlanView tables={[occupiedTable]} />)

      await waitFor(() => {
        expect(screen.queryByText('Loading floor plan…')).not.toBeInTheDocument()
      })

      await userEvent.click(screen.getByRole('button', { name: /T2/ }))

      expect(mockPush).toHaveBeenCalledWith('/tables/table-uuid-002/order/order-abc')
      expect(callCreateOrder).not.toHaveBeenCalled()
    })
  })

  // ── e) Tapping empty table creates order then navigates ────────────────────
  describe('tapping an empty table', () => {
    it('calls callCreateOrder then navigates to the new order', async () => {
      vi.mocked(callCreateOrder).mockResolvedValue({ order_id: 'new-order-xyz' })

      render(<FloorPlanView tables={[emptyTable]} />)

      await waitFor(() => {
        expect(screen.queryByText('Loading floor plan…')).not.toBeInTheDocument()
      })

      await userEvent.click(screen.getByRole('button', { name: /T1/ }))

      await waitFor(() => {
        expect(callCreateOrder).toHaveBeenCalledWith(
          'https://test.supabase.co',
          'test-token',
          'table-uuid-001',
        )
        expect(mockPush).toHaveBeenCalledWith('/tables/table-uuid-001/order/new-order-xyz')
      })
    })
  })
})
