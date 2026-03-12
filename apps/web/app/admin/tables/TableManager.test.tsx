import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import TableManager from './TableManager'
import { fetchAdminTables, fetchRestaurantId } from './tableAdminData'
import type { AdminTable } from './tableAdminData'
import { callCreateTable, callUpdateTable, callDeleteTable } from './tableAdminApi'

vi.mock('./tableAdminData', () => ({
  fetchAdminTables: vi.fn(),
  fetchRestaurantId: vi.fn(),
}))

vi.mock('./tableAdminApi', () => ({
  callCreateTable: vi.fn(),
  callUpdateTable: vi.fn(),
  callDeleteTable: vi.fn(),
}))

const MOCK_TABLES: AdminTable[] = [
  { id: 'table-1', label: 'Table 1', seat_count: 4, open_order_id: null },
  { id: 'table-2', label: 'Table 2', seat_count: 2, open_order_id: 'order-abc' },
  { id: 'table-3', label: 'Table 3', seat_count: 6, open_order_id: null },
]

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-key'
  vi.mocked(fetchRestaurantId).mockResolvedValue('rest-1')
  vi.mocked(fetchAdminTables).mockResolvedValue(MOCK_TABLES)
})

describe('TableManager', () => {
  it('shows loading state initially', () => {
    vi.mocked(fetchAdminTables).mockReturnValue(new Promise(() => {}))
    render(<TableManager />)
    expect(screen.getByText('Loading tables…')).toBeInTheDocument()
  })

  it('renders all tables after loading', async () => {
    render(<TableManager />)
    await waitFor(() => expect(screen.getByText('Table 1')).toBeInTheDocument())
    expect(screen.getByText('Table 2')).toBeInTheDocument()
    expect(screen.getByText('Table 3')).toBeInTheDocument()
  })

  it('shows seat count for each table', async () => {
    render(<TableManager />)
    await waitFor(() => expect(screen.getByText('Table 1')).toBeInTheDocument())
    expect(screen.getByText('4 seats')).toBeInTheDocument()
    expect(screen.getByText('2 seats')).toBeInTheDocument()
    expect(screen.getByText('6 seats')).toBeInTheDocument()
  })

  it('shows Available status for tables without open orders', async () => {
    render(<TableManager />)
    await waitFor(() => expect(screen.getByText('Table 1')).toBeInTheDocument())
    const availableItems = screen.getAllByText('Available')
    expect(availableItems.length).toBe(2)
  })

  it('shows Occupied status for tables with open orders', async () => {
    render(<TableManager />)
    await waitFor(() => expect(screen.getByText('Table 2')).toBeInTheDocument())
    expect(screen.getByText('Occupied')).toBeInTheDocument()
  })

  it('disables Delete button for tables with open orders', async () => {
    render(<TableManager />)
    await waitFor(() => expect(screen.getByText('Table 2')).toBeInTheDocument())
    const deleteButtons = screen.getAllByRole('button', { name: /Delete/i })
    const deleteTable2 = deleteButtons.find((btn) =>
      btn.getAttribute('aria-label')?.includes('Table 2'),
    )
    expect(deleteTable2).toBeDefined()
    expect(deleteTable2).toBeDisabled()
  })

  it('enables Delete button for tables without open orders', async () => {
    render(<TableManager />)
    await waitFor(() => expect(screen.getByText('Table 1')).toBeInTheDocument())
    const deleteTable1 = screen.getByRole('button', { name: 'Delete Table 1' })
    expect(deleteTable1).not.toBeDisabled()
  })

  it('shows error state when fetch fails', async () => {
    vi.mocked(fetchAdminTables).mockRejectedValue(new Error('Network error'))
    render(<TableManager />)
    await waitFor(() =>
      expect(screen.getByText('Unable to load table data. Please try again.')).toBeInTheDocument(),
    )
    expect(screen.getByText('Network error')).toBeInTheDocument()
  })

  it('shows empty state when no tables exist', async () => {
    vi.mocked(fetchAdminTables).mockResolvedValue([])
    render(<TableManager />)
    await waitFor(() =>
      expect(screen.getByText('No tables yet. Add a table to get started.')).toBeInTheDocument(),
    )
  })

  it('opens the Add Table form when the button is clicked', async () => {
    render(<TableManager />)
    await waitFor(() => expect(screen.getByText('Table 1')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '+ Add Table' }))
    expect(screen.getByText('New Table')).toBeInTheDocument()
    expect(screen.getByLabelText(/Table Label/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Seat Count/)).toBeInTheDocument()
  })

  it('shows validation errors when Add Table is submitted empty', async () => {
    render(<TableManager />)
    await waitFor(() => expect(screen.getByText('Table 1')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '+ Add Table' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add Table' }))
    expect(screen.getByText('Table label is required')).toBeInTheDocument()
    expect(screen.getByText('Seat count is required')).toBeInTheDocument()
  })

  it('adds a table successfully', async () => {
    vi.mocked(callCreateTable).mockResolvedValue('table-new')
    render(<TableManager />)
    await waitFor(() => expect(screen.getByText('Table 1')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '+ Add Table' }))
    fireEvent.change(screen.getByLabelText(/Table Label/), { target: { value: 'Table 9' } })
    fireEvent.change(screen.getByLabelText(/Seat Count/), { target: { value: '4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Table' }))
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Table "Table 9" added.'),
    )
    expect(screen.getByText('Table 9')).toBeInTheDocument()
  })

  it('opens the Edit form pre-filled when Edit is clicked', async () => {
    render(<TableManager />)
    await waitFor(() => expect(screen.getByText('Table 1')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Edit Table 1' }))
    expect(screen.getByText('Edit Table')).toBeInTheDocument()
    const labelInput = screen.getByLabelText(/Table Label/) as HTMLInputElement
    expect(labelInput.value).toBe('Table 1')
    const seatInput = screen.getByLabelText(/Seat Count/) as HTMLInputElement
    expect(seatInput.value).toBe('4')
  })

  it('saves edits successfully', async () => {
    vi.mocked(callUpdateTable).mockResolvedValue(undefined)
    render(<TableManager />)
    await waitFor(() => expect(screen.getByText('Table 1')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Edit Table 1' }))
    const labelInput = screen.getByLabelText(/Table Label/)
    fireEvent.change(labelInput, { target: { value: 'Table One' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Table "Table One" updated.'),
    )
    expect(screen.getByText('Table One')).toBeInTheDocument()
  })

  it('confirms and deletes a table', async () => {
    vi.mocked(callDeleteTable).mockResolvedValue(undefined)
    render(<TableManager />)
    await waitFor(() => expect(screen.getByText('Table 1')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Delete Table 1' }))
    expect(screen.getByText('Delete?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete Table 1' }))
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Table "Table 1" deleted.'),
    )
    expect(screen.queryByText('Table 1')).not.toBeInTheDocument()
  })

  it('cancels delete when No is clicked', async () => {
    render(<TableManager />)
    await waitFor(() => expect(screen.getByText('Table 1')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Delete Table 1' }))
    expect(screen.getByText('Delete?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel delete' }))
    expect(screen.queryByText('Delete?')).not.toBeInTheDocument()
    expect(screen.getByText('Table 1')).toBeInTheDocument()
  })

  it('all action buttons meet the 48px minimum touch target height', async () => {
    render(<TableManager />)
    await waitFor(() => expect(screen.getByText('Table 1')).toBeInTheDocument())
    const buttons = screen.getAllByRole('button')
    for (const btn of buttons) {
      expect(btn.className).toMatch(/min-h-\[48px\]/)
    }
  })
})
