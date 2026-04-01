import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NewOrderPage from './page'

const mockReplace = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: (): { replace: (url: string) => void } => ({ replace: mockReplace }),
  useParams: (): { id: string } => ({ id: 'table-uuid-001' }),
}))

vi.mock('@/lib/user-context', () => ({
  useUser: (): { accessToken: string | null } => ({ accessToken: 'test-token' }),
}))

vi.mock('../../../components/createOrderApi', () => ({
  callCreateOrder: vi.fn(),
}))

const originalEnv = process.env

describe('NewOrderPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
    }

    // Re-import the module fresh for each test so the mock resolves properly
    const { callCreateOrder } = await import('../../../components/createOrderApi')
    vi.mocked(callCreateOrder).mockReset()
  })

  describe('loading state', () => {
    it('shows the loading spinner while waiting for callCreateOrder', async () => {
      const { callCreateOrder } = await import('../../../components/createOrderApi')
      vi.mocked(callCreateOrder).mockReturnValue(new Promise(() => { /* never resolves */ }))

      render(<NewOrderPage />)

      expect(screen.getByRole('status', { name: 'Creating order…' })).toBeInTheDocument()
      expect(screen.getByText('Creating order…')).toBeInTheDocument()
    })
  })

  describe('on success', () => {
    it('redirects to the real order page via router.replace', async () => {
      const { callCreateOrder } = await import('../../../components/createOrderApi')
      vi.mocked(callCreateOrder).mockResolvedValue({ order_id: 'new-order-xyz' })

      render(<NewOrderPage />)

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/tables/table-uuid-001/order/new-order-xyz')
      })
    })

    it('calls callCreateOrder with the correct arguments', async () => {
      const { callCreateOrder } = await import('../../../components/createOrderApi')
      vi.mocked(callCreateOrder).mockResolvedValue({ order_id: 'new-order-xyz' })

      render(<NewOrderPage />)

      await waitFor(() => {
        expect(callCreateOrder).toHaveBeenCalledWith(
          'https://test.supabase.co',
          'test-token',
          'table-uuid-001',
          expect.any(AbortSignal),
        )
      })
    })
  })

  describe('on failure', () => {
    it('shows the error message and a Go back button', async () => {
      const { callCreateOrder } = await import('../../../components/createOrderApi')
      vi.mocked(callCreateOrder).mockRejectedValue(new Error('Table already has an open order'))

      render(<NewOrderPage />)

      await waitFor(() => {
        expect(screen.getByText('Table already has an open order')).toBeInTheDocument()
      })
      expect(screen.getByRole('button', { name: /go back to tables/i })).toBeInTheDocument()
    })

    it('"Go back" button navigates to /tables via router.replace', async () => {
      const { callCreateOrder } = await import('../../../components/createOrderApi')
      vi.mocked(callCreateOrder).mockRejectedValue(new Error('Network error'))

      render(<NewOrderPage />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /go back to tables/i })).toBeInTheDocument()
      })

      await userEvent.click(screen.getByRole('button', { name: /go back to tables/i }))

      expect(mockReplace).toHaveBeenCalledWith('/tables')
    })

    it('does not redirect to an order page on failure', async () => {
      const { callCreateOrder } = await import('../../../components/createOrderApi')
      vi.mocked(callCreateOrder).mockRejectedValue(new Error('create_order failed: 500'))

      render(<NewOrderPage />)

      await waitFor(() => {
        expect(screen.queryByText('Creating order…')).not.toBeInTheDocument()
      })

      expect(mockReplace).not.toHaveBeenCalled()
    })
  })
})
