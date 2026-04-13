import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NewTakeawayOrderPage from './page'

const mockReplace = vi.fn()

// Mutable search params map — tests can set these before rendering
const searchParamsMap: Record<string, string | null> = {}

vi.mock('next/navigation', () => ({
  useRouter: (): { replace: (url: string) => void } => ({ replace: mockReplace }),
  useSearchParams: (): { get: (key: string) => string | null } => ({
    get: (key: string): string | null => searchParamsMap[key] ?? null,
  }),
}))

vi.mock('@/lib/user-context', () => ({
  useUser: (): { accessToken: string | null } => ({ accessToken: 'test-token' }),
}))

vi.mock('../../../components/createOrderApi', () => ({
  callCreateOrder: vi.fn(),
}))

const originalEnv = process.env

/** Helper: set URL search params for the current test */
function setSearchParams(params: Record<string, string>): void {
  // Clear previous params
  for (const key of Object.keys(searchParamsMap)) {
    delete searchParamsMap[key]
  }
  Object.assign(searchParamsMap, params)
}

const VALID_PARAMS = {
  customerName: 'Ahmed Khan',
  customerPhone: '+8801712345678',
  scheduledTime: new Date(Date.now() + 3600_000).toISOString(),
}

describe('NewTakeawayOrderPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    setSearchParams({})
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
    }

    const { callCreateOrder } = await import('../../../components/createOrderApi')
    vi.mocked(callCreateOrder).mockReset()
  })

  describe('initial render', () => {
    it('shows the order page shell with takeaway badge while waiting for callCreateOrder', async () => {
      setSearchParams(VALID_PARAMS)
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

  describe('validation — missing required fields (issue #392)', () => {
    it('shows error when customerName is missing', async () => {
      setSearchParams({
        customerPhone: '+8801712345678',
        scheduledTime: VALID_PARAMS.scheduledTime,
      })
      const { callCreateOrder } = await import('../../../components/createOrderApi')
      vi.mocked(callCreateOrder).mockResolvedValue({ order_id: 'takeaway-order-abc' })

      render(<NewTakeawayOrderPage />)

      await waitFor(() => {
        expect(screen.getByText('Customer name is required for takeaway orders')).toBeInTheDocument()
      })
      expect(callCreateOrder).not.toHaveBeenCalled()
    })

    it('shows error when customerPhone is missing', async () => {
      setSearchParams({
        customerName: 'Ahmed Khan',
        scheduledTime: VALID_PARAMS.scheduledTime,
      })
      const { callCreateOrder } = await import('../../../components/createOrderApi')
      vi.mocked(callCreateOrder).mockResolvedValue({ order_id: 'takeaway-order-abc' })

      render(<NewTakeawayOrderPage />)

      await waitFor(() => {
        expect(screen.getByText('Mobile number is required for takeaway orders')).toBeInTheDocument()
      })
      expect(callCreateOrder).not.toHaveBeenCalled()
    })

    it('shows error when scheduledTime is missing', async () => {
      setSearchParams({
        customerName: 'Ahmed Khan',
        customerPhone: '+8801712345678',
      })
      const { callCreateOrder } = await import('../../../components/createOrderApi')
      vi.mocked(callCreateOrder).mockResolvedValue({ order_id: 'takeaway-order-abc' })

      render(<NewTakeawayOrderPage />)

      await waitFor(() => {
        expect(screen.getByText('Pickup Time is required for takeaway orders')).toBeInTheDocument()
      })
      expect(callCreateOrder).not.toHaveBeenCalled()
    })

    it('shows "Failed to create order" header alongside the validation error message', async () => {
      setSearchParams({
        customerPhone: '+8801712345678',
        scheduledTime: VALID_PARAMS.scheduledTime,
      })

      render(<NewTakeawayOrderPage />)

      await waitFor(() => {
        expect(screen.getByText('Failed to create order')).toBeInTheDocument()
      })
      expect(screen.getByRole('button', { name: /go back to tables/i })).toBeInTheDocument()
    })

    it('does not call callCreateOrder when customerName is missing', async () => {
      setSearchParams({
        customerPhone: '+8801712345678',
        scheduledTime: VALID_PARAMS.scheduledTime,
      })
      const { callCreateOrder } = await import('../../../components/createOrderApi')

      render(<NewTakeawayOrderPage />)

      // Wait a tick to let any async operations settle
      await waitFor(() => {
        expect(screen.queryByRole('status', { name: 'Creating order…' })).not.toBeInTheDocument()
      })
      expect(callCreateOrder).not.toHaveBeenCalled()
    })
  })

  describe('on success', () => {
    it('redirects to the real takeaway order page via router.replace', async () => {
      setSearchParams(VALID_PARAMS)
      const { callCreateOrder } = await import('../../../components/createOrderApi')
      vi.mocked(callCreateOrder).mockResolvedValue({ order_id: 'takeaway-order-abc' })

      render(<NewTakeawayOrderPage />)

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/tables/takeaway/order/takeaway-order-abc')
      })
    })

    it('calls callCreateOrder with orderType takeaway, customerName, and customerMobile', async () => {
      setSearchParams(VALID_PARAMS)
      const { callCreateOrder } = await import('../../../components/createOrderApi')
      vi.mocked(callCreateOrder).mockResolvedValue({ order_id: 'takeaway-order-abc' })

      render(<NewTakeawayOrderPage />)

      await waitFor(() => {
        expect(callCreateOrder).toHaveBeenCalledWith(
          'https://test.supabase.co',
          'test-token',
          {
            orderType: 'takeaway',
            customerName: VALID_PARAMS.customerName,
            customerMobile: VALID_PARAMS.customerPhone,
            scheduledTime: VALID_PARAMS.scheduledTime,
          },
          expect.any(AbortSignal),
        )
      })
    })
  })

  describe('on failure', () => {
    it('shows the error message and a Go back button', async () => {
      setSearchParams(VALID_PARAMS)
      const { callCreateOrder } = await import('../../../components/createOrderApi')
      vi.mocked(callCreateOrder).mockRejectedValue(new Error('Failed to create takeaway order'))

      render(<NewTakeawayOrderPage />)

      await waitFor(() => {
        expect(screen.getByText('Failed to create takeaway order')).toBeInTheDocument()
      })
      expect(screen.getByRole('button', { name: /go back to tables/i })).toBeInTheDocument()
    })

    it('"Go back" button navigates to /tables via router.replace', async () => {
      setSearchParams(VALID_PARAMS)
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
      setSearchParams(VALID_PARAMS)
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
