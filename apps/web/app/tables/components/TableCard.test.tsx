import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TableCard from './TableCard'
import type { TableRow } from '../tablesData'

const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: (): { push: (url: string) => void } => ({ push: mockPush }),
}))

// useUser is still imported by TableCard (to ensure context availability)
vi.mock('@/lib/user-context', () => ({
  useUser: (): { accessToken: string | null } => ({ accessToken: 'test-token' }),
}))

const emptyTable: TableRow = { id: 'table-uuid-001', label: '1', open_order_id: null, order_status: null, order_created_at: null, order_item_count: null, grid_x: null, grid_y: null }
const occupiedTable: TableRow = {
  id: 'table-uuid-002',
  label: '2',
  open_order_id: 'order-abc-123',
  order_status: 'open',
  order_created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  order_item_count: 2,
  grid_x: null,
  grid_y: null,
}

describe('TableCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('when table is occupied with an open order', () => {
    it('navigates directly to the existing order without any loading state', async () => {
      render(<TableCard table={occupiedTable} />)
      await userEvent.click(screen.getByRole('button'))

      expect(mockPush).toHaveBeenCalledWith('/tables/table-uuid-002/order/order-abc-123')
    })
  })

  describe('when table is empty (optimistic navigation — issue #298)', () => {
    it('navigates immediately to /tables/[id]/order/new without async wait', async () => {
      render(<TableCard table={emptyTable} />)
      await userEvent.click(screen.getByRole('button'))

      // Navigation happens synchronously — no API call, no loading state
      expect(mockPush).toHaveBeenCalledWith('/tables/table-uuid-001/order/new')
    })

    it('does not disable the button after tapping', async () => {
      render(<TableCard table={emptyTable} />)
      const button = screen.getByRole('button')
      await userEvent.click(button)

      // Button is never disabled — no more loading state on the card
      expect(button).not.toBeDisabled()
    })

    it('does not show a "Creating…" label', async () => {
      render(<TableCard table={emptyTable} />)
      await userEvent.click(screen.getByRole('button'))

      expect(screen.queryByText('Creating…')).not.toBeInTheDocument()
    })

    it('does not make any fetch calls', async () => {
      const fetchSpy = vi.fn()
      global.fetch = fetchSpy

      render(<TableCard table={emptyTable} />)
      await userEvent.click(screen.getByRole('button'))

      expect(fetchSpy).not.toHaveBeenCalled()
    })
  })

  describe('touch targets', () => {
    it('button has minimum 48px height class for touch-target compliance', () => {
      render(<TableCard table={emptyTable} />)
      const button = screen.getByRole('button')
      // min-h-[160px] exceeds the 48px minimum required by the tablet-first UI guidelines
      expect(button.className).toMatch(/min-h-\[/)
    })
  })

  describe('rendering', () => {
    it('renders the table label', () => {
      render(<TableCard table={emptyTable} />)
      expect(screen.getByText('1')).toBeInTheDocument()
    })

    it('renders "Empty" status for an empty table', () => {
      render(<TableCard table={emptyTable} />)
      expect(screen.getByText('Empty')).toBeInTheDocument()
    })

    it('renders "Ordered" status for a table with an active order and items', () => {
      render(<TableCard table={occupiedTable} />)
      expect(screen.getByText('Ordered')).toBeInTheDocument()
    })
  })
})
