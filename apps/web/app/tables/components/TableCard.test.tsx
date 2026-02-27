import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TableCard, { type Table } from './TableCard'

const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: (): { push: (url: string) => void } => ({ push: mockPush }),
}))

const emptyTable: Table = { id: 1, number: 1, status: 'empty', seats: 4 }
const occupiedTable: Table = {
  id: 2,
  number: 2,
  status: 'occupied',
  seats: 4,
  open_order_id: 'order-abc-123',
}

describe('TableCard', () => {
  const originalFetch = global.fetch
  const originalEnv = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-anon-key',
    }
  })

  afterEach(() => {
    global.fetch = originalFetch
    process.env = originalEnv
  })

  describe('when table is occupied with an open order', () => {
    it('navigates directly to the existing order without calling the API', async () => {
      const fetchSpy = vi.fn()
      global.fetch = fetchSpy

      render(<TableCard table={occupiedTable} />)
      await userEvent.click(screen.getByRole('button'))

      expect(mockPush).toHaveBeenCalledWith('/tables/2/order/order-abc-123')
      expect(fetchSpy).not.toHaveBeenCalled()
    })
  })

  describe('when table is empty', () => {
    it('calls create_order API with the correct table_id and navigates on success', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        json: (): Promise<{ success: boolean; data: { order_id: string; status: string } }> =>
          Promise.resolve({ success: true, data: { order_id: 'new-order-xyz', status: 'open' } }),
      })

      render(<TableCard table={emptyTable} />)
      await userEvent.click(screen.getByRole('button'))

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/tables/1/order/new-order-xyz')
      })

      expect(global.fetch).toHaveBeenCalledWith(
        'https://test.supabase.co/functions/v1/create_order',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ table_id: 1, staff_id: 'placeholder-staff' }),
        }),
      )
    })

    it('shows the API error message when create_order returns success: false', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        json: (): Promise<{ success: boolean; error: string }> =>
          Promise.resolve({ success: false, error: 'Table already has an open order' }),
      })

      render(<TableCard table={emptyTable} />)
      await userEvent.click(screen.getByRole('button'))

      await waitFor(() => {
        expect(screen.getByText('Table already has an open order')).toBeInTheDocument()
      })
      expect(mockPush).not.toHaveBeenCalled()
    })

    it('shows a generic error message when the fetch throws a network error', async () => {
      global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'))

      render(<TableCard table={emptyTable} />)
      await userEvent.click(screen.getByRole('button'))

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument()
      })
      expect(mockPush).not.toHaveBeenCalled()
    })

    it('shows "API not configured" when NEXT_PUBLIC_SUPABASE_URL is missing', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = ''

      render(<TableCard table={emptyTable} />)
      await userEvent.click(screen.getByRole('button'))

      await waitFor(() => {
        expect(screen.getByText('API not configured')).toBeInTheDocument()
      })
    })

    it('shows "API not configured" when NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ''

      render(<TableCard table={emptyTable} />)
      await userEvent.click(screen.getByRole('button'))

      await waitFor(() => {
        expect(screen.getByText('API not configured')).toBeInTheDocument()
      })
    })
  })

  describe('loading state', () => {
    it('shows "Creating…" label while the API call is in flight', async () => {
      let resolveJson!: (value: unknown) => void
      global.fetch = vi.fn().mockResolvedValueOnce({
        json: (): Promise<unknown> =>
          new Promise((resolve) => {
            resolveJson = resolve
          }),
      })

      render(<TableCard table={emptyTable} />)
      await userEvent.click(screen.getByRole('button'))

      expect(screen.getByText('Creating…')).toBeInTheDocument()

      resolveJson({ success: true, data: { order_id: 'order-id', status: 'open' } })
      await waitFor(() => {
        expect(screen.queryByText('Creating…')).not.toBeInTheDocument()
      })
    })

    it('disables the button while the API call is in flight', async () => {
      let resolveJson!: (value: unknown) => void
      global.fetch = vi.fn().mockResolvedValueOnce({
        json: (): Promise<unknown> =>
          new Promise((resolve) => {
            resolveJson = resolve
          }),
      })

      render(<TableCard table={emptyTable} />)
      const button = screen.getByRole('button')
      await userEvent.click(button)

      expect(button).toBeDisabled()

      resolveJson({ success: true, data: { order_id: 'order-id', status: 'open' } })
      await waitFor(() => {
        expect(button).not.toBeDisabled()
      })
    })
  })

  describe('rendering', () => {
    it('renders the table number', () => {
      render(<TableCard table={emptyTable} />)
      expect(screen.getByText('1')).toBeInTheDocument()
    })

    it('renders "Empty" status for an empty table', () => {
      render(<TableCard table={emptyTable} />)
      expect(screen.getByText('Empty')).toBeInTheDocument()
    })

    it('renders "Occupied" status for an occupied table', () => {
      render(<TableCard table={occupiedTable} />)
      expect(screen.getByText('Occupied')).toBeInTheDocument()
    })

    it('renders the seat count', () => {
      render(<TableCard table={emptyTable} />)
      expect(screen.getByText('4 seats')).toBeInTheDocument()
    })
  })
})
