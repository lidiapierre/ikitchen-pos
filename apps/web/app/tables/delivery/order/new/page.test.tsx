import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Import the client component directly — page.tsx is a thin Suspense wrapper
// that doesn't need to be tested here.
import NewDeliveryOrderClient from './NewDeliveryOrderClient'

const mockReplace = vi.fn()
const mockSearchParamsGet = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: (): { replace: (url: string) => void } => ({ replace: mockReplace }),
  useSearchParams: () => ({ get: mockSearchParamsGet }),
}))

vi.mock('@/lib/user-context', () => ({
  useUser: (): { accessToken: string | null } => ({ accessToken: 'test-token' }),
}))

vi.mock('../../../components/createOrderApi', () => ({
  callCreateOrder: vi.fn(),
}))

const originalEnv = process.env

describe('NewDeliveryOrderPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
    }

    // Default: search params with all required fields (issue #358)
    mockSearchParamsGet.mockImplementation((key: string) => {
      const params: Record<string, string> = {
        customerName: 'Ahmed Khan',
        customerPhone: '+880 1711 123456',
        deliveryNote: 'Road 12, House 5',
        scheduledTime: '2026-04-06T18:00:00.000Z',
      }
      return params[key] ?? null
    })

    const { callCreateOrder } = await import('../../../components/createOrderApi')
    vi.mocked(callCreateOrder).mockReset()
  })

  describe('initial render', () => {
    it('shows the order page shell with delivery badge and customer info while waiting', async () => {
      const { callCreateOrder } = await import('../../../components/createOrderApi')
      vi.mocked(callCreateOrder).mockReturnValue(new Promise(() => { /* never resolves */ }))

      render(<NewDeliveryOrderClient />)

      // Order page chrome is immediately visible
      expect(screen.getByRole('heading', { name: 'Order', level: 1 })).toBeInTheDocument()
      // Delivery badge
      expect(screen.getByText('Delivery')).toBeInTheDocument()
      // Customer name from search params
      expect(screen.getByText('Ahmed Khan')).toBeInTheDocument()
      // Inline creating indicator
      expect(screen.getByRole('status', { name: 'Creating order…' })).toBeInTheDocument()
      expect(screen.getByText('Creating order…')).toBeInTheDocument()
    })
  })

  describe('on success', () => {
    it('redirects to the real delivery order page via router.replace', async () => {
      const { callCreateOrder } = await import('../../../components/createOrderApi')
      vi.mocked(callCreateOrder).mockResolvedValue({ order_id: 'delivery-order-xyz' })

      render(<NewDeliveryOrderClient />)

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/tables/delivery/order/delivery-order-xyz')
      })
    })

    it('calls callCreateOrder with customerName, customerMobile, and deliveryNote from search params', async () => {
      const { callCreateOrder } = await import('../../../components/createOrderApi')
      vi.mocked(callCreateOrder).mockResolvedValue({ order_id: 'delivery-order-xyz' })

      render(<NewDeliveryOrderClient />)

      await waitFor(() => {
        expect(callCreateOrder).toHaveBeenCalledWith(
          'https://test.supabase.co',
          'test-token',
          {
            orderType: 'delivery',
            customerName: 'Ahmed Khan',
            customerMobile: '+880 1711 123456',
            deliveryNote: 'Road 12, House 5',
            scheduledTime: '2026-04-06T18:00:00.000Z',
          },
          expect.any(AbortSignal),
        )
      })
    })
  })

  describe('on failure', () => {
    it('shows the error message and a Go back button', async () => {
      const { callCreateOrder } = await import('../../../components/createOrderApi')
      vi.mocked(callCreateOrder).mockRejectedValue(new Error('Failed to create delivery order'))

      render(<NewDeliveryOrderClient />)

      await waitFor(() => {
        expect(screen.getByText('Failed to create delivery order')).toBeInTheDocument()
      })
      expect(screen.getByRole('button', { name: /go back to tables/i })).toBeInTheDocument()
    })

    it('"Go back" button navigates to /tables via router.replace', async () => {
      const { callCreateOrder } = await import('../../../components/createOrderApi')
      vi.mocked(callCreateOrder).mockRejectedValue(new Error('Network error'))

      render(<NewDeliveryOrderClient />)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /go back to tables/i })).toBeInTheDocument()
      })

      await userEvent.click(screen.getByRole('button', { name: /go back to tables/i }))
      expect(mockReplace).toHaveBeenCalledWith('/tables')
    })

    it('does not redirect to an order page on failure', async () => {
      const { callCreateOrder } = await import('../../../components/createOrderApi')
      vi.mocked(callCreateOrder).mockRejectedValue(new Error('create_order failed: 500'))

      render(<NewDeliveryOrderClient />)

      await waitFor(() => {
        expect(screen.queryByRole('status', { name: 'Creating order…' })).not.toBeInTheDocument()
      })

      expect(mockReplace).not.toHaveBeenCalled()
    })
  })

  describe('missing customerName', () => {
    it('shows an error when customerName search param is absent', async () => {
      mockSearchParamsGet.mockReturnValue(null)

      const { callCreateOrder } = await import('../../../components/createOrderApi')
      vi.mocked(callCreateOrder).mockResolvedValue({ order_id: 'should-not-reach' })

      render(<NewDeliveryOrderClient />)

      await waitFor(() => {
        expect(screen.getByText('Customer name is required for delivery orders')).toBeInTheDocument()
      })
      expect(callCreateOrder).not.toHaveBeenCalled()
      expect(mockReplace).not.toHaveBeenCalled()
    })
  })

  describe('missing customerPhone (issue #358)', () => {
    it('shows an error when customerPhone search param is absent', async () => {
      mockSearchParamsGet.mockImplementation((key: string) => {
        if (key === 'customerName') return 'Ahmed Khan'
        if (key === 'deliveryNote') return 'Road 12, House 5'
        return null
      })

      const { callCreateOrder } = await import('../../../components/createOrderApi')
      vi.mocked(callCreateOrder).mockResolvedValue({ order_id: 'should-not-reach' })

      render(<NewDeliveryOrderClient />)

      await waitFor(() => {
        expect(screen.getByText('Mobile number is required for delivery orders')).toBeInTheDocument()
      })
      expect(callCreateOrder).not.toHaveBeenCalled()
      expect(mockReplace).not.toHaveBeenCalled()
    })
  })

  describe('missing deliveryNote/address (issue #358)', () => {
    it('shows an error when deliveryNote search param is absent', async () => {
      mockSearchParamsGet.mockImplementation((key: string) => {
        if (key === 'customerName') return 'Ahmed Khan'
        if (key === 'customerPhone') return '+880 1711 123456'
        return null
      })

      const { callCreateOrder } = await import('../../../components/createOrderApi')
      vi.mocked(callCreateOrder).mockResolvedValue({ order_id: 'should-not-reach' })

      render(<NewDeliveryOrderClient />)

      await waitFor(() => {
        expect(screen.getByText('Delivery address is required for delivery orders')).toBeInTheDocument()
      })
      expect(callCreateOrder).not.toHaveBeenCalled()
      expect(mockReplace).not.toHaveBeenCalled()
    })
  })

  describe('delivery fee display (issue #393)', () => {
    it('shows the delivery fee prominently when deliveryCharge param is provided and > 0', async () => {
      mockSearchParamsGet.mockImplementation((key: string) => {
        const params: Record<string, string> = {
          customerName: 'Ahmed Khan',
          customerPhone: '+880 1711 123456',
          deliveryNote: 'Road 12, House 5',
          scheduledTime: '2026-04-06T18:00:00.000Z',
          deliveryZoneName: 'Zone A',
          deliveryCharge: '9900',  // ৳99.00 in cents
        }
        return params[key] ?? null
      })

      const { callCreateOrder } = await import('../../../components/createOrderApi')
      vi.mocked(callCreateOrder).mockReturnValue(new Promise(() => { /* never resolves */ }))

      render(<NewDeliveryOrderClient />)

      // Delivery Fee label and amount visible immediately
      expect(screen.getByText('Delivery Fee')).toBeInTheDocument()
      expect(screen.getByText('৳99.00')).toBeInTheDocument()
    })

    it('shows "Free Delivery" when deliveryCharge param is 0', async () => {
      mockSearchParamsGet.mockImplementation((key: string) => {
        const params: Record<string, string> = {
          customerName: 'Ahmed Khan',
          customerPhone: '+880 1711 123456',
          deliveryNote: 'Road 12, House 5',
          scheduledTime: '2026-04-06T18:00:00.000Z',
          deliveryCharge: '0',  // Free delivery
        }
        return params[key] ?? null
      })

      const { callCreateOrder } = await import('../../../components/createOrderApi')
      vi.mocked(callCreateOrder).mockReturnValue(new Promise(() => { /* never resolves */ }))

      render(<NewDeliveryOrderClient />)

      expect(screen.getByText('Delivery Fee')).toBeInTheDocument()
      expect(screen.getByText('Free Delivery')).toBeInTheDocument()
    })

    it('callCreateOrder is called without deliveryChargeCents when deliveryCharge is 0 (free delivery)', async () => {
      // Regression guard: deliveryChargeCents must NOT be sent when charge = 0
      // (charge=0 means free delivery; omitting the field keeps the API call minimal)
      mockSearchParamsGet.mockImplementation((key: string) => {
        const params: Record<string, string> = {
          customerName: 'Ahmed Khan',
          customerPhone: '+880 1711 123456',
          deliveryNote: 'Road 12, House 5',
          scheduledTime: '2026-04-06T18:00:00.000Z',
          deliveryCharge: '0',  // Free delivery
        }
        return params[key] ?? null
      })

      const { callCreateOrder } = await import('../../../components/createOrderApi')
      vi.mocked(callCreateOrder).mockResolvedValue({ order_id: 'delivery-order-free' })

      render(<NewDeliveryOrderClient />)

      await waitFor(() => {
        expect(callCreateOrder).toHaveBeenCalledWith(
          'https://test.supabase.co',
          'test-token',
          expect.not.objectContaining({ deliveryChargeCents: expect.anything() }),
          expect.any(AbortSignal),
        )
      })
    })

    it('shows "Free Delivery" for invalid (non-numeric) deliveryCharge param — NaN guard', async () => {
      // Regression guard for parseInt NaN on a corrupt URL param
      mockSearchParamsGet.mockImplementation((key: string) => {
        const params: Record<string, string> = {
          customerName: 'Ahmed Khan',
          customerPhone: '+880 1711 123456',
          deliveryNote: 'Road 12, House 5',
          scheduledTime: '2026-04-06T18:00:00.000Z',
          deliveryCharge: 'INVALID',
        }
        return params[key] ?? null
      })

      const { callCreateOrder } = await import('../../../components/createOrderApi')
      vi.mocked(callCreateOrder).mockReturnValue(new Promise(() => { /* never resolves */ }))

      render(<NewDeliveryOrderClient />)

      // deliveryChargeStr is non-empty but NaN after parseInt — treated as free
      expect(screen.getByText('Delivery Fee')).toBeInTheDocument()
      expect(screen.getByText('Free Delivery')).toBeInTheDocument()
    })

    it('does not show Delivery Fee row when deliveryCharge param is absent (backward compat)', async () => {
      // No deliveryCharge param (old URL format)
      mockSearchParamsGet.mockImplementation((key: string) => {
        const params: Record<string, string> = {
          customerName: 'Ahmed Khan',
          customerPhone: '+880 1711 123456',
          deliveryNote: 'Road 12, House 5',
          scheduledTime: '2026-04-06T18:00:00.000Z',
        }
        return params[key] ?? null
      })

      const { callCreateOrder } = await import('../../../components/createOrderApi')
      vi.mocked(callCreateOrder).mockReturnValue(new Promise(() => { /* never resolves */ }))

      render(<NewDeliveryOrderClient />)

      expect(screen.queryByText('Delivery Fee')).not.toBeInTheDocument()
    })

    it('shows zone name separately from the fee', async () => {
      mockSearchParamsGet.mockImplementation((key: string) => {
        const params: Record<string, string> = {
          customerName: 'Ahmed Khan',
          customerPhone: '+880 1711 123456',
          deliveryNote: 'Road 12, House 5',
          scheduledTime: '2026-04-06T18:00:00.000Z',
          deliveryZoneName: 'Zone B',
          deliveryCharge: '19900',  // ৳199.00 in cents
        }
        return params[key] ?? null
      })

      const { callCreateOrder } = await import('../../../components/createOrderApi')
      vi.mocked(callCreateOrder).mockReturnValue(new Promise(() => { /* never resolves */ }))

      render(<NewDeliveryOrderClient />)

      // Zone and fee are shown as separate rows
      expect(screen.getByText('Zone B')).toBeInTheDocument()
      expect(screen.getByText('৳199.00')).toBeInTheDocument()
    })
  })
})
