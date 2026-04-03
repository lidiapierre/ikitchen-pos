import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NewTakeawayOrderPage from './page'

const mockReplace = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: (): { replace: (url: string) => void } => ({ replace: mockReplace }),
}))

vi.mock('@/lib/user-context', () => ({
  useUser: (): { accessToken: string | null } => ({ accessToken: 'test-token' }),
}))

vi.mock('../../../components/createOrderApi', () => ({
  callCreateOrder: vi.fn(),
}))

const originalEnv = process.env

describe('NewTakeawayOrderPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
    }

    const { callCreateOrder } = await import('../../../components/createOrderApi')
    vi.mocked(callCreateOrder).mockReset()
  })

  describe('initial render', () => {
    it('shows the order page shell with takeaway badge while waiting for callCreateOrder', async () => {
      const { callCreateOrder } = await import('../../../components/createOrderApi')
      vi.mocked(callCreateOrder).mockReturnValue(new Promise(() => { /* never resolves */ }))

      render(<NewTakeawayOrderPage />)

      // Order page chrome is immediately visible
      expect(screen.getByRole('heading', { name: 'Order', level: 1 })).toBeInTheDocument()
      // Takeaway badge
      expect(screen.getByText('Takeaway')).toBeInTheDocument()
      // Inline creating indicator
      expect(screen.getByRole('status', { name: 'Creating order…' })).toBeInTheDocument()
      expect(screen.getByText('Creating order…')).toBeInTheDocument()
    })
  })

  describe('on success', () => {
    it('redirects to the real takeaway order page via router.replace', async () => {
      const { callCreateOrder } = await import('../../../components/createOrderApi')
      vi.mocked(callCreateOrder).mockResolvedValue({ order_id: 'takeaway-order-abc' })

      render(<NewTakeawayOrderPage />)

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/tables/takeaway/order/takeaway-order-abc')
      })
    })

    it('calls callCreateOrder with orderType takeaway', async () => {
      const { callCreateOrder } = await import('../../../components/createOrderApi')
      vi.mocked(callCreateOrder).mockResolvedValue({ order_id: 'takeaway-order-abc' })

      render(<NewTakeawayOrderPage />)

      await waitFor(() => {
        expect(callCreateOrder).toHaveBeenCalledWith(
          'https://test.supabase.co',
          'test-token',
          { orderType: 'takeaway' },
          expect.any(AbortSignal),
        )
      })
    })
  })

  describe('on failure', () => {
    it('shows the error message and a Go back button', async () => {
      const { callCreateOrder } = await import('../../../components/createOrderApi')
      vi.mocked(callCreateOrder).mockRejectedValue(new Error('Failed to create takeaway order'))

      render(<NewTakeawayOrderPage />)

      await waitFor(() => {
        expect(screen.getByText('Failed to create takeaway order')).toBeInTheDocument()
      })
      expect(screen.getByRole('button', { name: /go back to tables/i })).toBeInTheDocument()
    })

    it('"Go back" button navigates to /tables via router.replace', async () => {
      const { callCreateOrder } = await import('../../../components/createOrderApi')
      vi.mocked(callCreateOrder).mockRejectedValue(new Error('Network error'))

      render(<NewTakeawayOrderPage />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /go back to tables/i })).toBeInTheDocument()
      })

      await userEvent.click(screen.getByRole('button', { name: /go back to tables/i }))
      expect(mockReplace).toHaveBeenCalledWith('/tables')
    })

    it('does not redirect to an order page on failure', async () => {
      const { callCreateOrder } = await import('../../../components/createOrderApi')
      vi.mocked(callCreateOrder).mockRejectedValue(new Error('create_order failed: 500'))

      render(<NewTakeawayOrderPage />)

      await waitFor(() => {
        expect(screen.queryByRole('status', { name: 'Creating order…' })).not.toBeInTheDocument()
      })

      expect(mockReplace).not.toHaveBeenCalled()
    })
  })
})
