import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { JSX } from 'react'
import TablesPage from './page'
import { fetchTables } from './tablesData'
import type { TableRow } from './tablesData'

vi.mock('./tablesData', () => ({
  fetchTables: vi.fn(),
}))

vi.mock('./components/TableCard', () => ({
  default: ({ table }: { table: TableRow }): JSX.Element => (
    <div data-testid="table-card">{table.label}</div>
  ),
}))

const MOCK_TABLES: TableRow[] = [
  { id: 'table-uuid-001', label: '1', open_order_id: null, order_status: null, order_created_at: null, order_item_count: null },
  { id: 'table-uuid-002', label: '2', open_order_id: 'order-uuid-001', order_status: 'open', order_created_at: '2026-03-27T10:00:00Z', order_item_count: 1 },
  { id: 'table-uuid-003', label: '3', open_order_id: null, order_status: null, order_created_at: null, order_item_count: null },
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
