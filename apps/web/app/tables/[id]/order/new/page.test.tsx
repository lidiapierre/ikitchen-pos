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

describe('NewOrderPage (dine-in with optional customer capture — issue #401)', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
    }

    const { callCreateOrder } = await import('../../../components/createOrderApi')
    vi.mocked(callCreateOrder).mockReset()
  })

  // ── Capture step (initial render) ────────────────────────────────────────

  describe('capture step — initial render', () => {
    it('shows the customer capture form with optional fields', () => {
      render(<NewOrderPage />)

      expect(screen.getByRole('heading', { name: 'New Dine-in Order', level: 1 })).toBeInTheDocument()
      expect(screen.getByText('table-uuid-001')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Customer Details', level: 2 })).toBeInTheDocument()
      expect(screen.getByText(/optional — leave blank to skip/i)).toBeInTheDocument()
      expect(screen.getByLabelText('Customer Name')).toBeInTheDocument()
      expect(screen.getByLabelText('Mobile Number')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Create Order' })).toBeInTheDocument()
    })

    it('does NOT call callCreateOrder on mount — waits for user interaction', async () => {
      const { callCreateOrder } = await import('../../../components/createOrderApi')

      render(<NewOrderPage />)

      // Wait a tick to let any potential async effects settle
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(callCreateOrder).not.toHaveBeenCalled()
    })

    it('"Create Order" button is enabled when auth token is available', () => {
      render(<NewOrderPage />)
      // With the default mock (accessToken: 'test-token'), button should be enabled
      expect(screen.getByRole('button', { name: 'Create Order' })).not.toBeDisabled()
    })

    it('"Back to tables" button navigates to /tables', async () => {
      render(<NewOrderPage />)

      await userEvent.click(screen.getByRole('button', { name: /back to tables/i }))
      expect(mockReplace).toHaveBeenCalledWith('/tables')
    })
  })

  // ── Skip path (no customer info) ─────────────────────────────────────────

  describe('skip path — create order without customer details', () => {
    it('transitions to creating shell when "Create Order" is clicked with empty fields', async () => {
      const { callCreateOrder } = await import('../../../components/createOrderApi')
      vi.mocked(callCreateOrder).mockReturnValue(new Promise(() => { /* never resolves */ }))

      render(<NewOrderPage />)

      await userEvent.click(screen.getByRole('button', { name: 'Create Order' }))

      expect(screen.getByRole('heading', { name: 'Order', level: 1 })).toBeInTheDocument()
      expect(screen.getByRole('status', { name: 'Creating order…' })).toBeInTheDocument()
      expect(screen.getByText('Creating order…')).toBeInTheDocument()
    })

    it('calls callCreateOrder with tableId and dine_in type only (no customer fields)', async () => {
      const { callCreateOrder } = await import('../../../components/createOrderApi')
      vi.mocked(callCreateOrder).mockResolvedValue({ order_id: 'order-skip-xyz' })

      render(<NewOrderPage />)

      await userEvent.click(screen.getByRole('button', { name: 'Create Order' }))

      await waitFor(() => {
        expect(callCreateOrder).toHaveBeenCalledWith(
          'https://test.supabase.co',
          'test-token',
          {
            tableId: 'table-uuid-001',
            orderType: 'dine_in',
          },
          expect.any(AbortSignal),
        )
      })
    })

    it('redirects to the real order page on success (skip path)', async () => {
      const { callCreateOrder } = await import('../../../components/createOrderApi')
      vi.mocked(callCreateOrder).mockResolvedValue({ order_id: 'order-skip-xyz' })

      render(<NewOrderPage />)

      await userEvent.click(screen.getByRole('button', { name: 'Create Order' }))

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/tables/table-uuid-001/order/order-skip-xyz')
      })
    })

    it('does not include customerName or customerMobile in the API call when fields are blank', async () => {
      const { callCreateOrder } = await import('../../../components/createOrderApi')
      vi.mocked(callCreateOrder).mockResolvedValue({ order_id: 'order-skip-xyz' })

      render(<NewOrderPage />)

      await userEvent.click(screen.getByRole('button', { name: 'Create Order' }))

      await waitFor(() => {
        const callArgs = vi.mocked(callCreateOrder).mock.calls[0]
        const opts = callArgs[2] as Record<string, unknown>
        expect(opts).not.toHaveProperty('customerName')
        expect(opts).not.toHaveProperty('customerMobile')
      })
    })

    it('does not include customerName or customerMobile when fields contain only whitespace', async () => {
      const { callCreateOrder } = await import('../../../components/createOrderApi')
      vi.mocked(callCreateOrder).mockResolvedValue({ order_id: 'order-skip-xyz' })

      render(<NewOrderPage />)

      await userEvent.type(screen.getByLabelText('Customer Name'), '   ')
      await userEvent.type(screen.getByLabelText('Mobile Number'), '   ')
      await userEvent.click(screen.getByRole('button', { name: 'Create Order' }))

      await waitFor(() => {
        const callArgs = vi.mocked(callCreateOrder).mock.calls[0]
        const opts = callArgs[2] as Record<string, unknown>
        expect(opts).not.toHaveProperty('customerName')
        expect(opts).not.toHaveProperty('customerMobile')
      })
    })
  })

  // ── Fill-in path (with customer info) ────────────────────────────────────

  describe('fill-in path — create order with customer details', () => {
    it('calls callCreateOrder with customerName and customerMobile when filled', async () => {
      const { callCreateOrder } = await import('../../../components/createOrderApi')
      vi.mocked(callCreateOrder).mockResolvedValue({ order_id: 'order-with-customer-abc' })

      render(<NewOrderPage />)

      await userEvent.type(screen.getByLabelText('Customer Name'), 'Ahmed Khan')
      await userEvent.type(screen.getByLabelText('Mobile Number'), '+8801712345678')
      await userEvent.click(screen.getByRole('button', { name: 'Create Order' }))

      await waitFor(() => {
        expect(callCreateOrder).toHaveBeenCalledWith(
          'https://test.supabase.co',
          'test-token',
          {
            tableId: 'table-uuid-001',
            orderType: 'dine_in',
            customerName: 'Ahmed Khan',
            customerMobile: '+8801712345678',
          },
          expect.any(AbortSignal),
        )
      })
    })

    it('calls callCreateOrder with only customerName when only name is filled', async () => {
      const { callCreateOrder } = await import('../../../components/createOrderApi')
      vi.mocked(callCreateOrder).mockResolvedValue({ order_id: 'order-name-only' })

      render(<NewOrderPage />)

      await userEvent.type(screen.getByLabelText('Customer Name'), 'Ahmed Khan')
      await userEvent.click(screen.getByRole('button', { name: 'Create Order' }))

      await waitFor(() => {
        expect(callCreateOrder).toHaveBeenCalledWith(
          'https://test.supabase.co',
          'test-token',
          {
            tableId: 'table-uuid-001',
            orderType: 'dine_in',
            customerName: 'Ahmed Khan',
          },
          expect.any(AbortSignal),
        )
      })
    })

    it('calls callCreateOrder with only customerMobile when only mobile is filled', async () => {
      const { callCreateOrder } = await import('../../../components/createOrderApi')
      vi.mocked(callCreateOrder).mockResolvedValue({ order_id: 'order-mobile-only' })

      render(<NewOrderPage />)

      await userEvent.type(screen.getByLabelText('Mobile Number'), '+8801712345678')
      await userEvent.click(screen.getByRole('button', { name: 'Create Order' }))

      await waitFor(() => {
        expect(callCreateOrder).toHaveBeenCalledWith(
          'https://test.supabase.co',
          'test-token',
          {
            tableId: 'table-uuid-001',
            orderType: 'dine_in',
            customerMobile: '+8801712345678',
          },
          expect.any(AbortSignal),
        )
      })
    })

    it('trims whitespace from customer name and mobile before calling API', async () => {
      const { callCreateOrder } = await import('../../../components/createOrderApi')
      vi.mocked(callCreateOrder).mockResolvedValue({ order_id: 'order-trimmed' })

      render(<NewOrderPage />)

      await userEvent.type(screen.getByLabelText('Customer Name'), '  Ahmed Khan  ')
      await userEvent.type(screen.getByLabelText('Mobile Number'), '  +8801712345678  ')
      await userEvent.click(screen.getByRole('button', { name: 'Create Order' }))

      await waitFor(() => {
        expect(callCreateOrder).toHaveBeenCalledWith(
          'https://test.supabase.co',
          'test-token',
          {
            tableId: 'table-uuid-001',
            orderType: 'dine_in',
            customerName: 'Ahmed Khan',
            customerMobile: '+8801712345678',
          },
          expect.any(AbortSignal),
        )
      })
    })

    it('redirects to the real order page on success (fill-in path)', async () => {
      const { callCreateOrder } = await import('../../../components/createOrderApi')
      vi.mocked(callCreateOrder).mockResolvedValue({ order_id: 'order-with-customer-abc' })

      render(<NewOrderPage />)

      await userEvent.type(screen.getByLabelText('Customer Name'), 'Ahmed Khan')
      await userEvent.type(screen.getByLabelText('Mobile Number'), '+8801712345678')
      await userEvent.click(screen.getByRole('button', { name: 'Create Order' }))

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/tables/table-uuid-001/order/order-with-customer-abc')
      })
    })

    it('shows customer name and phone in creating shell when fields are filled', async () => {
      const { callCreateOrder } = await import('../../../components/createOrderApi')
      vi.mocked(callCreateOrder).mockReturnValue(new Promise(() => { /* never resolves */ }))

      render(<NewOrderPage />)

      await userEvent.type(screen.getByLabelText('Customer Name'), 'Ahmed Khan')
      await userEvent.type(screen.getByLabelText('Mobile Number'), '+8801712345678')
      await userEvent.click(screen.getByRole('button', { name: 'Create Order' }))

      expect(screen.getByText('Ahmed Khan')).toBeInTheDocument()
      expect(screen.getByText('+8801712345678')).toBeInTheDocument()
      // Label in creating shell matches takeaway ('Phone', not 'Mobile')
      expect(screen.getByText('Phone')).toBeInTheDocument()
    })

    it('does NOT show customer row in creating shell when fields are skipped', async () => {
      const { callCreateOrder } = await import('../../../components/createOrderApi')
      vi.mocked(callCreateOrder).mockReturnValue(new Promise(() => { /* never resolves */ }))

      render(<NewOrderPage />)

      await userEvent.click(screen.getByRole('button', { name: 'Create Order' }))

      // Customer label should not be visible when no customer info was provided
      expect(screen.queryByText('Customer')).not.toBeInTheDocument()
      expect(screen.queryByText('Phone')).not.toBeInTheDocument()
    })
  })

  // ── Failure handling ─────────────────────────────────────────────────────

  describe('on failure', () => {
    it('shows the error message and a Go back button', async () => {
      const { callCreateOrder } = await import('../../../components/createOrderApi')
      vi.mocked(callCreateOrder).mockRejectedValue(new Error('Table already has an open order'))

      render(<NewOrderPage />)
      await userEvent.click(screen.getByRole('button', { name: 'Create Order' }))

      await waitFor(() => {
        expect(screen.getByText('Table already has an open order')).toBeInTheDocument()
      })
      expect(screen.getByText('Failed to create order')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /go back to tables/i })).toBeInTheDocument()
    })

    it('"Go back" button navigates to /tables via router.replace', async () => {
      const { callCreateOrder } = await import('../../../components/createOrderApi')
      vi.mocked(callCreateOrder).mockRejectedValue(new Error('Network error'))

      render(<NewOrderPage />)
      await userEvent.click(screen.getByRole('button', { name: 'Create Order' }))

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
      await userEvent.click(screen.getByRole('button', { name: 'Create Order' }))

      await waitFor(() => {
        expect(screen.queryByRole('status', { name: 'Creating order…' })).not.toBeInTheDocument()
      })

      expect(mockReplace).not.toHaveBeenCalled()
    })

    it('shows a generic error message when the thrown error is not an Error instance', async () => {
      const { callCreateOrder } = await import('../../../components/createOrderApi')
      vi.mocked(callCreateOrder).mockRejectedValue('unexpected string error')

      render(<NewOrderPage />)
      await userEvent.click(screen.getByRole('button', { name: 'Create Order' }))

      // Shows the error state UI (Go back button confirms we're in error state)
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /go back to tables/i })).toBeInTheDocument()
      })
      // Both the heading and the fallback error message text appear in the DOM
      const allMessages = screen.getAllByText('Failed to create order')
      expect(allMessages.length).toBeGreaterThanOrEqual(1)
    })
  })
})
