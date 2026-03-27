import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import type { ReactNode, JSX } from 'react'
import OrderDetailClient from './OrderDetailClient'

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }): JSX.Element => (
    <a href={href}>{children as ReactNode}</a>
  ),
}))

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: (): { push: ReturnType<typeof vi.fn> } => ({ push: mockPush }),
}))

vi.mock('./closeOrderApi', () => ({
  callCloseOrder: vi.fn(),
}))

vi.mock('./recordPaymentApi', () => ({
  callRecordPayment: vi.fn(),
}))

vi.mock('./orderData', () => ({
  fetchOrderItems: vi.fn(),
  fetchOrderSummary: vi.fn(),
  calcItemDiscountCents: vi.fn().mockReturnValue(0),
}))

vi.mock('./voidItemApi', () => ({
  callVoidItem: vi.fn(),
}))

vi.mock('./cancelOrderApi', () => ({
  callCancelOrder: vi.fn(),
}))

vi.mock('./kotApi', () => ({
  markItemsSentToKitchen: vi.fn(),
}))

vi.mock('@/components/KotPrintView', () => ({
  default: (): JSX.Element => <div data-testid="kot-print-view" />,
}))

vi.mock('@/lib/fetchVatConfig', () => ({
  fetchOrderVatContext: vi.fn().mockResolvedValue({ restaurantId: 'rest-1', menuId: null }),
  fetchVatConfig: vi.fn().mockResolvedValue({ vatPercent: 15, taxInclusive: false }),
}))

const mockItems = [
  { id: '1', name: 'Bruschetta', quantity: 2, price_cents: 850, modifier_ids: [], modifier_names: [], sent_to_kitchen: false, comp: false, comp_reason: null, seat: null, course: 'main' as const, course_status: 'waiting' as const, menuId: null, printerType: 'kitchen' as const, item_discount_type: null, item_discount_value: null },
  { id: '2', name: 'Grilled Salmon', quantity: 1, price_cents: 1850, modifier_ids: [], modifier_names: [], sent_to_kitchen: false, comp: false, comp_reason: null, seat: null, course: 'main' as const, course_status: 'waiting' as const, menuId: null, printerType: 'kitchen' as const, item_discount_type: null, item_discount_value: null },
  { id: '3', name: 'House Wine', quantity: 2, price_cents: 950, modifier_ids: [], modifier_names: [], sent_to_kitchen: false, comp: false, comp_reason: null, seat: null, course: 'main' as const, course_status: 'waiting' as const, menuId: null, printerType: 'kitchen' as const, item_discount_type: null, item_discount_value: null },
]

describe('OrderDetailClient', () => {
  beforeEach(async (): Promise<void> => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'test-publishable-key')
    const { fetchOrderItems } = await import('./orderData')
    vi.mocked(fetchOrderItems).mockResolvedValue(mockItems)
    const { fetchOrderSummary } = await import('./orderData')
    vi.mocked(fetchOrderSummary).mockResolvedValue({ status: 'open', payment_method: null })
  })

  afterEach((): void => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  it('shows a loading state while items are being fetched', (): void => {
    render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

    expect(screen.getByText('Loading items…')).toBeInTheDocument()
  })

  it('renders all item names after loading', async (): Promise<void> => {
    render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

    expect(await screen.findByText('Bruschetta')).toBeInTheDocument()
    expect(screen.getByText('Grilled Salmon')).toBeInTheDocument()
    expect(screen.getByText('House Wine')).toBeInTheDocument()
  })

  it('renders item quantities', async (): Promise<void> => {
    render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

    await screen.findByText('Bruschetta')
    const spans = screen.getAllByText(/^×\d+$/)
    expect(spans.length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('×1')).toBeInTheDocument()
  })

  it('renders per-item prices', async (): Promise<void> => {
    render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

    expect(await screen.findByText('৳ 8.50 each')).toBeInTheDocument()
    expect(screen.getByText('৳ 18.50 each')).toBeInTheDocument()
    expect(screen.getByText('৳ 9.50 each')).toBeInTheDocument()
  })

  it('renders line totals for each item', async (): Promise<void> => {
    render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

    await screen.findByText('Bruschetta')
    // Bruschetta: 2 × ৳ 8.50 = ৳ 17.00
    expect(screen.getByText('৳ 17.00')).toBeInTheDocument()
    // Grilled Salmon: 1 × ৳ 18.50 = ৳ 18.50
    expect(screen.getByText('৳ 18.50')).toBeInTheDocument()
    // House Wine: 2 × ৳ 9.50 = ৳ 19.00
    expect(screen.getByText('৳ 19.00')).toBeInTheDocument()
  })

  it('renders the running order total', async (): Promise<void> => {
    render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

    // 2×850 + 1×1850 + 2×950 = 5450 cents = ৳ 54.50
    expect(await screen.findByText('৳ 54.50')).toBeInTheDocument()
  })

  it('shows an error state if the fetch fails', async (): Promise<void> => {
    const { fetchOrderItems } = await import('./orderData')
    vi.mocked(fetchOrderItems).mockRejectedValue(new Error('Network error'))

    render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

    expect(await screen.findByText('Network error')).toBeInTheDocument()
  })

  it('renders the Add Items link pointing to the menu', (): void => {
    render(<OrderDetailClient tableId="3" orderId="order-def-456" />)

    const link = screen.getByRole('link', { name: 'Add Items' })
    expect(link).toHaveAttribute('href', '/tables/3/order/order-def-456/menu')
  })

  it('Add Items link has minimum 48px touch target', (): void => {
    render(<OrderDetailClient tableId="1" orderId="order-xyz" />)

    const link = screen.getByRole('link', { name: 'Add Items' })
    expect(link.className).toContain('min-h-[48px]')
  })

  it('renders the Close Order button', (): void => {
    render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

    expect(screen.getByRole('button', { name: 'Close Order' })).toBeInTheDocument()
  })

  it('Close Order button has minimum 48px touch target', (): void => {
    render(<OrderDetailClient tableId="1" orderId="order-xyz" />)

    const btn = screen.getByRole('button', { name: 'Close Order' })
    expect(btn.className).toContain('min-h-[48px]')
  })

  it('shows "Closing…" and disables the button while the API call is in progress', async (): Promise<void> => {
    const { callCloseOrder } = await import('./closeOrderApi')
    vi.mocked(callCloseOrder).mockImplementation(
      (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 100)),
    )

    render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

    fireEvent.click(screen.getByRole('button', { name: 'Close Order' }))

    await waitFor((): void => {
      expect(screen.getByRole('button', { name: 'Closing…' })).toBeDisabled()
    })
  })

  it('shows payment step after order is closed successfully', async (): Promise<void> => {
    const { callCloseOrder } = await import('./closeOrderApi')
    vi.mocked(callCloseOrder).mockResolvedValue(undefined)

    render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

    fireEvent.click(screen.getByRole('button', { name: 'Close Order' }))

    await waitFor((): void => {
      expect(screen.getByText('Record Payment')).toBeInTheDocument()
    })
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('shows an error message when the close order API call fails', async (): Promise<void> => {
    const { callCloseOrder } = await import('./closeOrderApi')
    vi.mocked(callCloseOrder).mockRejectedValue(new Error('Order has no items'))

    render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

    fireEvent.click(screen.getByRole('button', { name: 'Close Order' }))

    await waitFor((): void => {
      expect(screen.getByText('Order has no items')).toBeInTheDocument()
    })
  })

  it('re-enables the Close Order button after an error', async (): Promise<void> => {
    const { callCloseOrder } = await import('./closeOrderApi')
    vi.mocked(callCloseOrder).mockRejectedValue(new Error('Server error'))

    render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

    fireEvent.click(screen.getByRole('button', { name: 'Close Order' }))

    await waitFor((): void => {
      expect(screen.getByRole('button', { name: 'Close Order' })).not.toBeDisabled()
    })
  })

  it('shows "API not configured" error when Supabase env vars are absent', async (): Promise<void> => {
    vi.unstubAllEnvs()

    render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

    fireEvent.click(screen.getByRole('button', { name: 'Close Order' }))

    await waitFor((): void => {
      expect(screen.getAllByText('API not configured').length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('void item', () => {
    it('renders a Void button for each item row', async (): Promise<void> => {
      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

      await screen.findByText('Bruschetta')

      const voidButtons = screen.getAllByRole('button', { name: 'Void' })
      expect(voidButtons).toHaveLength(mockItems.length)
    })

    it('each Void button has minimum 48px touch target', async (): Promise<void> => {
      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

      await screen.findByText('Bruschetta')

      const voidButtons = screen.getAllByRole('button', { name: 'Void' })
      voidButtons.forEach((btn) => {
        expect(btn.className).toContain('min-h-[48px]')
      })
    })

    it('tapping Void opens the void dialog for that item', async (): Promise<void> => {
      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

      await screen.findByText('Bruschetta')

      const voidButtons = screen.getAllByRole('button', { name: 'Void' })
      fireEvent.click(voidButtons[0])

      expect(screen.getByText('Void Item')).toBeInTheDocument()
      expect(screen.getByText(/Bruschetta/)).toBeInTheDocument()
    })

    it('Confirm Void is disabled when reason is empty', async (): Promise<void> => {
      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

      await screen.findByText('Bruschetta')

      const voidButtons = screen.getAllByRole('button', { name: 'Void' })
      fireEvent.click(voidButtons[0])

      expect(screen.getByRole('button', { name: 'Confirm Void' })).toBeDisabled()
    })

    it('Confirm Void is enabled after typing a reason', async (): Promise<void> => {
      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

      await screen.findByText('Bruschetta')

      const voidButtons = screen.getAllByRole('button', { name: 'Void' })
      fireEvent.click(voidButtons[0])

      fireEvent.change(screen.getByPlaceholderText('e.g. wrong item ordered'), {
        target: { value: 'customer changed mind' },
      })

      expect(screen.getByRole('button', { name: 'Confirm Void' })).not.toBeDisabled()
    })

    it('calls callVoidItem with the item id and reason', async (): Promise<void> => {
      const { callVoidItem } = await import('./voidItemApi')
      vi.mocked(callVoidItem).mockResolvedValue(undefined)

      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

      await screen.findByText('Bruschetta')

      const voidButtons = screen.getAllByRole('button', { name: 'Void' })
      fireEvent.click(voidButtons[0])

      fireEvent.change(screen.getByPlaceholderText('e.g. wrong item ordered'), {
        target: { value: 'wrong item' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Confirm Void' }))

      await waitFor((): void => {
        expect(callVoidItem).toHaveBeenCalledWith(
          'https://example.supabase.co',
          'test-publishable-key',
          '1',
          'wrong item',
        )
      })
    })

    it('shows "Voiding…" and disables Confirm Void while in progress', async (): Promise<void> => {
      const { callVoidItem } = await import('./voidItemApi')
      vi.mocked(callVoidItem).mockImplementation(
        (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 100)),
      )

      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

      await screen.findByText('Bruschetta')

      const voidButtons = screen.getAllByRole('button', { name: 'Void' })
      fireEvent.click(voidButtons[0])

      fireEvent.change(screen.getByPlaceholderText('e.g. wrong item ordered'), {
        target: { value: 'test' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Confirm Void' }))

      await waitFor((): void => {
        expect(screen.getByRole('button', { name: 'Voiding…' })).toBeDisabled()
      })
    })

    it('closes the dialog and refreshes items after a successful void', async (): Promise<void> => {
      const { callVoidItem } = await import('./voidItemApi')
      vi.mocked(callVoidItem).mockResolvedValue(undefined)
      const { fetchOrderItems } = await import('./orderData')
      vi.mocked(fetchOrderItems).mockResolvedValue(mockItems)

      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

      await screen.findByText('Bruschetta')

      const voidButtons = screen.getAllByRole('button', { name: 'Void' })
      fireEvent.click(voidButtons[0])

      fireEvent.change(screen.getByPlaceholderText('e.g. wrong item ordered'), {
        target: { value: 'test reason' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Confirm Void' }))

      await waitFor((): void => {
        expect(screen.queryByText('Void Item')).not.toBeInTheDocument()
      })
      expect(fetchOrderItems).toHaveBeenCalledTimes(2)
    })

    it('shows an inline error when void API call fails', async (): Promise<void> => {
      const { callVoidItem } = await import('./voidItemApi')
      vi.mocked(callVoidItem).mockRejectedValue(new Error('Item already voided'))

      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

      await screen.findByText('Bruschetta')

      const voidButtons = screen.getAllByRole('button', { name: 'Void' })
      fireEvent.click(voidButtons[0])

      fireEvent.change(screen.getByPlaceholderText('e.g. wrong item ordered'), {
        target: { value: 'test' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Confirm Void' }))

      await waitFor((): void => {
        expect(screen.getByText('Item already voided')).toBeInTheDocument()
      })
      // Dialog stays open
      expect(screen.getByText('Void Item')).toBeInTheDocument()
    })

    it('dismisses the void dialog when Cancel is clicked', async (): Promise<void> => {
      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

      await screen.findByText('Bruschetta')

      const voidButtons = screen.getAllByRole('button', { name: 'Void' })
      fireEvent.click(voidButtons[0])

      expect(screen.getByText('Void Item')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(screen.queryByText('Void Item')).not.toBeInTheDocument()
    })
  })

  describe('cancel order', () => {
    it('renders a Cancel order button', (): void => {
      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

      expect(screen.getByRole('button', { name: 'Cancel order' })).toBeInTheDocument()
    })

    it('Cancel order button has minimum 48px touch target', (): void => {
      render(<OrderDetailClient tableId="1" orderId="order-xyz" />)

      const btn = screen.getByRole('button', { name: 'Cancel order' })
      expect(btn.className).toContain('min-h-[48px]')
    })

    it('tapping Cancel order opens the cancel dialog', (): void => {
      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

      fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }))

      expect(screen.getByText('Cancel Order')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('e.g. customer left')).toBeInTheDocument()
    })

    it('Confirm Cancel is disabled when reason is empty', (): void => {
      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

      fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }))

      expect(screen.getByRole('button', { name: 'Confirm Cancel' })).toBeDisabled()
    })

    it('Confirm Cancel is enabled after typing a reason', (): void => {
      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

      fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }))

      fireEvent.change(screen.getByPlaceholderText('e.g. customer left'), {
        target: { value: 'customer left' },
      })

      expect(screen.getByRole('button', { name: 'Confirm Cancel' })).not.toBeDisabled()
    })

    it('calls callCancelOrder with the order id and reason', async (): Promise<void> => {
      const { callCancelOrder } = await import('./cancelOrderApi')
      vi.mocked(callCancelOrder).mockResolvedValue(undefined)

      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

      fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }))

      fireEvent.change(screen.getByPlaceholderText('e.g. customer left'), {
        target: { value: 'customer walked out' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Confirm Cancel' }))

      await waitFor((): void => {
        expect(callCancelOrder).toHaveBeenCalledWith(
          'https://example.supabase.co',
          'test-publishable-key',
          'order-abc-123',
          'customer walked out',
        )
      })
    })

    it('shows "Cancelling…" while cancel is in progress', async (): Promise<void> => {
      const { callCancelOrder } = await import('./cancelOrderApi')
      vi.mocked(callCancelOrder).mockImplementation(
        (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 100)),
      )

      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

      fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }))

      fireEvent.change(screen.getByPlaceholderText('e.g. customer left'), {
        target: { value: 'test' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Confirm Cancel' }))

      await waitFor((): void => {
        expect(screen.getByRole('button', { name: 'Cancelling…' })).toBeDisabled()
      })
    })

    it('navigates to table overview after successful cancel', async (): Promise<void> => {
      const { callCancelOrder } = await import('./cancelOrderApi')
      vi.mocked(callCancelOrder).mockResolvedValue(undefined)

      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

      fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }))

      fireEvent.change(screen.getByPlaceholderText('e.g. customer left'), {
        target: { value: 'customer left' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Confirm Cancel' }))

      await waitFor((): void => {
        expect(mockPush).toHaveBeenCalledWith('/tables/5')
      })
    })

    it('shows an inline error when cancel API call fails', async (): Promise<void> => {
      const { callCancelOrder } = await import('./cancelOrderApi')
      vi.mocked(callCancelOrder).mockRejectedValue(new Error('Order already cancelled'))

      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

      fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }))

      fireEvent.change(screen.getByPlaceholderText('e.g. customer left'), {
        target: { value: 'test' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Confirm Cancel' }))

      await waitFor((): void => {
        expect(screen.getByText('Order already cancelled')).toBeInTheDocument()
      })
      // Dialog stays open
      expect(screen.getByText('Cancel Order')).toBeInTheDocument()
    })

    it('dismisses the cancel dialog when Back is clicked', (): void => {
      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

      fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }))

      expect(screen.getByText('Cancel Order')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Back' }))

      expect(screen.queryByText('Cancel Order')).not.toBeInTheDocument()
    })
  })

  describe('payment step', () => {
    async function openPaymentStep(): Promise<void> {
      const { callCloseOrder } = await import('./closeOrderApi')
      vi.mocked(callCloseOrder).mockResolvedValue(undefined)
      fireEvent.click(screen.getByRole('button', { name: 'Close Order' }))
      await waitFor((): void => {
        expect(screen.getByText('Record Payment')).toBeInTheDocument()
      })
    }

    it('shows Cash and Card payment method buttons', async (): Promise<void> => {
      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)
      await openPaymentStep()

      expect(screen.getByRole('button', { name: 'Cash' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Card' })).toBeInTheDocument()
    })

    it('shows the confirm payment button with the total amount', async (): Promise<void> => {
      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)
      await openPaymentStep()

      expect(screen.getByRole('button', { name: /Confirm Payment/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /৳ 54\.50/ })).toBeInTheDocument()
    })

    it('confirm payment button has minimum 48px touch target', async (): Promise<void> => {
      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)
      await openPaymentStep()

      const btn = screen.getByRole('button', { name: /Confirm Payment/ })
      expect(btn.className).toContain('min-h-[48px]')
    })

    it('shows a Cancel button on the payment step', async (): Promise<void> => {
      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)
      await openPaymentStep()

      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    })

    it('Cancel button navigates back to the table overview', async (): Promise<void> => {
      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)
      await openPaymentStep()

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(mockPush).toHaveBeenCalledWith('/tables/5')
    })

    it('Cancel button has minimum 48px touch target', async (): Promise<void> => {
      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)
      await openPaymentStep()

      const btn = screen.getByRole('button', { name: 'Cancel' })
      expect(btn.className).toContain('min-h-[48px]')
    })

    it('calls callRecordPayment with cash method by default', async (): Promise<void> => {
      const { callRecordPayment } = await import('./recordPaymentApi')
      vi.mocked(callRecordPayment).mockResolvedValue({ change_due: 0 })

      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)
      await openPaymentStep()

      const input = screen.getByRole('spinbutton')
      fireEvent.change(input, { target: { value: '54.50' } })
      fireEvent.click(screen.getByRole('button', { name: /Confirm Payment/ }))

      await waitFor((): void => {
        expect(callRecordPayment).toHaveBeenCalledWith(
          'https://example.supabase.co',
          'test-publishable-key',
          'order-abc-123',
          5450,
          'cash',
          5450,
        )
      })
    })

    it('calls callRecordPayment with card method when card is selected', async (): Promise<void> => {
      const { callRecordPayment } = await import('./recordPaymentApi')
      vi.mocked(callRecordPayment).mockResolvedValue({ change_due: 0 })

      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)
      await openPaymentStep()

      fireEvent.click(screen.getByRole('button', { name: 'Card' }))
      fireEvent.click(screen.getByRole('button', { name: /Confirm Payment/ }))

      await waitFor((): void => {
        expect(callRecordPayment).toHaveBeenCalledWith(
          'https://example.supabase.co',
          'test-publishable-key',
          'order-abc-123',
          5450,
          'card',
          5450,
        )
      })
    })

    it('shows amount tendered input for cash payment', async (): Promise<void> => {
      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)
      await openPaymentStep()

      expect(screen.getByText('Amount tendered')).toBeInTheDocument()
      expect(screen.getByRole('spinbutton')).toBeInTheDocument()
    })

    it('does not show amount tendered input for card payment', async (): Promise<void> => {
      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)
      await openPaymentStep()

      fireEvent.click(screen.getByRole('button', { name: 'Card' }))

      expect(screen.queryByText('Amount tendered')).not.toBeInTheDocument()
    })

    it('shows error when amount tendered is less than order total', async (): Promise<void> => {
      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)
      await openPaymentStep()

      const input = screen.getByRole('spinbutton')
      fireEvent.change(input, { target: { value: '50.00' } })
      fireEvent.click(screen.getByRole('button', { name: /Confirm Payment/ }))

      await waitFor((): void => {
        expect(screen.getByText('Amount tendered must be at least the order total')).toBeInTheDocument()
      })
    })

    it('passes tendered amount to callRecordPayment for cash overpayment', async (): Promise<void> => {
      const { callRecordPayment } = await import('./recordPaymentApi')
      vi.mocked(callRecordPayment).mockResolvedValue({ change_due: 550 })

      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)
      await openPaymentStep()

      const input = screen.getByRole('spinbutton')
      fireEvent.change(input, { target: { value: '60.00' } })
      fireEvent.click(screen.getByRole('button', { name: /Confirm Payment/ }))

      await waitFor((): void => {
        expect(callRecordPayment).toHaveBeenCalledWith(
          'https://example.supabase.co',
          'test-publishable-key',
          'order-abc-123',
          6000,
          'cash',
          5450,
        )
      })
    })

    it('shows success state after successful card payment', async (): Promise<void> => {
      const { callRecordPayment } = await import('./recordPaymentApi')
      vi.mocked(callRecordPayment).mockResolvedValue({ change_due: 0 })

      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)
      await openPaymentStep()

      fireEvent.click(screen.getByRole('button', { name: 'Card' }))
      fireEvent.click(screen.getByRole('button', { name: /Confirm Payment/ }))

      await waitFor((): void => {
        expect(screen.getByText('Payment recorded — order closed')).toBeInTheDocument()
      })
      expect(mockPush).not.toHaveBeenCalled()
    })

    it('navigates to /tables after 1.5s following successful card payment', async (): Promise<void> => {
      const { callRecordPayment } = await import('./recordPaymentApi')
      vi.mocked(callRecordPayment).mockResolvedValue({ change_due: 0 })

      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)
      await openPaymentStep()

      fireEvent.click(screen.getByRole('button', { name: 'Card' }))
      fireEvent.click(screen.getByRole('button', { name: /Confirm Payment/ }))

      await waitFor((): void => {
        expect(screen.getByText('Payment recorded — order closed')).toBeInTheDocument()
      })

      expect(mockPush).not.toHaveBeenCalled()

      await act(async (): Promise<void> => {
        vi.advanceTimersByTime(1500)
      })

      expect(mockPush).toHaveBeenCalledWith('/tables')
    })

    it('shows change due screen after successful cash payment', async (): Promise<void> => {
      const { callRecordPayment } = await import('./recordPaymentApi')
      vi.mocked(callRecordPayment).mockResolvedValue({ change_due: 250 })

      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)
      await openPaymentStep()

      const input = screen.getByRole('spinbutton')
      fireEvent.change(input, { target: { value: '57.00' } })
      fireEvent.click(screen.getByRole('button', { name: /Confirm Payment/ }))

      await waitFor((): void => {
        expect(screen.getByText('Change Due')).toBeInTheDocument()
        expect(screen.getByText('৳ 2.50')).toBeInTheDocument()
      })
      expect(mockPush).not.toHaveBeenCalled()
    })

    it('shows success state when Done is clicked after cash payment', async (): Promise<void> => {
      const { callRecordPayment } = await import('./recordPaymentApi')
      vi.mocked(callRecordPayment).mockResolvedValue({ change_due: 0 })

      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)
      await openPaymentStep()

      const input = screen.getByRole('spinbutton')
      fireEvent.change(input, { target: { value: '54.50' } })
      fireEvent.click(screen.getByRole('button', { name: /Confirm Payment/ }))

      await waitFor((): void => {
        expect(screen.getByText('Change Due')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: 'Done' }))

      await waitFor((): void => {
        expect(screen.getByText('Payment recorded — order closed')).toBeInTheDocument()
      })
      expect(mockPush).not.toHaveBeenCalled()
    })

    it('navigates to /tables after 1.5s following Done click on cash payment', async (): Promise<void> => {
      const { callRecordPayment } = await import('./recordPaymentApi')
      vi.mocked(callRecordPayment).mockResolvedValue({ change_due: 0 })

      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)
      await openPaymentStep()

      const input = screen.getByRole('spinbutton')
      fireEvent.change(input, { target: { value: '54.50' } })
      fireEvent.click(screen.getByRole('button', { name: /Confirm Payment/ }))

      await waitFor((): void => {
        expect(screen.getByText('Change Due')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByRole('button', { name: 'Done' }))

      await waitFor((): void => {
        expect(screen.getByText('Payment recorded — order closed')).toBeInTheDocument()
      })

      expect(mockPush).not.toHaveBeenCalled()

      await act(async (): Promise<void> => {
        vi.advanceTimersByTime(1500)
      })

      expect(mockPush).toHaveBeenCalledWith('/tables')
    })

    it('shows inline error without losing form when payment API fails', async (): Promise<void> => {
      const { callRecordPayment } = await import('./recordPaymentApi')
      vi.mocked(callRecordPayment).mockRejectedValue(new Error('Payment declined'))

      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)
      await openPaymentStep()

      const input = screen.getByRole('spinbutton')
      fireEvent.change(input, { target: { value: '54.50' } })
      fireEvent.click(screen.getByRole('button', { name: /Confirm Payment/ }))

      await waitFor((): void => {
        expect(screen.getByText('Payment declined')).toBeInTheDocument()
      })
      // Form is still visible
      expect(screen.getByRole('button', { name: /Confirm Payment/ })).toBeInTheDocument()
    })

    it('shows "Recording…" and disables button while payment is in progress', async (): Promise<void> => {
      const { callRecordPayment } = await import('./recordPaymentApi')
      vi.mocked(callRecordPayment).mockImplementation(
        (): Promise<{ change_due: number }> => new Promise((resolve) => setTimeout(() => resolve({ change_due: 0 }), 100)),
      )

      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)
      await openPaymentStep()

      const input = screen.getByRole('spinbutton')
      fireEvent.change(input, { target: { value: '54.50' } })
      fireEvent.click(screen.getByRole('button', { name: /Confirm Payment/ }))

      await waitFor((): void => {
        expect(screen.getByRole('button', { name: 'Recording…' })).toBeDisabled()
      })
    })

    it('shows "API not configured" error when Supabase env vars are absent', async (): Promise<void> => {
      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)
      await openPaymentStep()

      vi.unstubAllEnvs()

      const input = screen.getByRole('spinbutton')
      fireEvent.change(input, { target: { value: '54.50' } })
      fireEvent.click(screen.getByRole('button', { name: /Confirm Payment/ }))

      await waitFor((): void => {
        expect(screen.getByText('API not configured')).toBeInTheDocument()
      })
    })
  })

  describe('modifier sub-lines', () => {
    it('shows modifier names beneath the item row when modifier_names is non-empty', async (): Promise<void> => {
      const { fetchOrderItems } = await import('./orderData')
      vi.mocked(fetchOrderItems).mockResolvedValue([
        {
          id: '1',
          name: 'Burger',
          quantity: 1,
          price_cents: 1200,
          modifier_ids: ['mod-001', 'mod-002'],
          modifier_names: ['Extra cheese', 'No onions'],
          sent_to_kitchen: false,
          comp: false,
          comp_reason: null,
          seat: null,
          course: 'main' as const,
          course_status: 'waiting' as const, menuId: null, printerType: 'kitchen' as const, item_discount_type: null, item_discount_value: null,
        },
      ])

      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

      await screen.findByText('Burger')

      expect(screen.getByText('+ Extra cheese')).toBeInTheDocument()
      expect(screen.getByText('+ No onions')).toBeInTheDocument()
    })

    it('does not render modifier sub-lines when modifier_names is empty', async (): Promise<void> => {
      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

      await screen.findByText('Bruschetta')

      // No "+ …" lines should appear for items without modifiers
      const plusLines = screen.queryAllByText(/^\+ /)
      expect(plusLines).toHaveLength(0)
    })

    it('shows modifier sub-lines in paid read-only view', async (): Promise<void> => {
      const { fetchOrderSummary } = await import('./orderData')
      const { fetchOrderItems } = await import('./orderData')

      vi.mocked(fetchOrderSummary).mockResolvedValue({ status: 'paid', payment_method: 'card' })
      vi.mocked(fetchOrderItems).mockResolvedValue([
        {
          id: '1',
          name: 'Burger',
          quantity: 1,
          price_cents: 1200,
          modifier_ids: ['mod-001'],
          modifier_names: ['Extra cheese'],
          sent_to_kitchen: false,
          comp: false,
          comp_reason: null,
          seat: null,
          course: 'main' as const,
          course_status: 'waiting' as const, menuId: null, printerType: 'kitchen' as const, item_discount_type: null, item_discount_value: null,
        },
      ])

      render(<OrderDetailClient tableId="5" orderId="order-paid-123" />)

      await waitFor((): void => {
        expect(screen.getByText('Paid')).toBeInTheDocument()
      })

      expect(screen.getByText('+ Extra cheese')).toBeInTheDocument()
    })
  })

  describe('paid order read-only view', () => {
    it('shows read-only paid state when navigating to an already-paid order', async (): Promise<void> => {
      const { fetchOrderSummary } = await import('./orderData')
      vi.mocked(fetchOrderSummary).mockResolvedValue({ status: 'paid', payment_method: 'card' })

      render(<OrderDetailClient tableId="5" orderId="order-paid-123" />)

      await waitFor((): void => {
        expect(screen.getByText('Paid')).toBeInTheDocument()
      })
    })

    it('shows payment method in paid read-only view', async (): Promise<void> => {
      const { fetchOrderSummary } = await import('./orderData')
      vi.mocked(fetchOrderSummary).mockResolvedValue({ status: 'paid', payment_method: 'cash' })

      render(<OrderDetailClient tableId="5" orderId="order-paid-123" />)

      await waitFor((): void => {
        expect(screen.getByText('Payment method')).toBeInTheDocument()
        expect(screen.getByText('cash')).toBeInTheDocument()
      })
    })

    it('does not show Close Order or Add Items in paid read-only view', async (): Promise<void> => {
      const { fetchOrderSummary } = await import('./orderData')
      vi.mocked(fetchOrderSummary).mockResolvedValue({ status: 'paid', payment_method: 'card' })

      render(<OrderDetailClient tableId="5" orderId="order-paid-123" />)

      await waitFor((): void => {
        expect(screen.getByText('Paid')).toBeInTheDocument()
      })

      expect(screen.queryByRole('button', { name: 'Close Order' })).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Add Items' })).not.toBeInTheDocument()
    })

    it('shows order total in paid read-only view', async (): Promise<void> => {
      const { fetchOrderSummary } = await import('./orderData')
      vi.mocked(fetchOrderSummary).mockResolvedValue({ status: 'paid', payment_method: 'card' })

      render(<OrderDetailClient tableId="5" orderId="order-paid-123" />)

      await waitFor((): void => {
        expect(screen.getByText('Paid')).toBeInTheDocument()
      })
      // 2×850 + 1×1850 + 2×950 = ৳ 54.50
      expect(screen.getByText('৳ 54.50')).toBeInTheDocument()
    })

    it('Back to tables link has minimum 48px touch target in paid view', async (): Promise<void> => {
      const { fetchOrderSummary } = await import('./orderData')
      vi.mocked(fetchOrderSummary).mockResolvedValue({ status: 'paid', payment_method: 'card' })

      render(<OrderDetailClient tableId="5" orderId="order-paid-123" />)

      await waitFor((): void => {
        expect(screen.getByText('Paid')).toBeInTheDocument()
      })

      const backLinks = screen.getAllByRole('link', { name: /Back to tables/ })
      backLinks.forEach((link) => {
        expect(link.className).toContain('min-h-[48px]')
      })
    })

    it('falls back to normal order view when fetchOrderSummary rejects', async (): Promise<void> => {
      const { fetchOrderSummary } = await import('./orderData')
      vi.mocked(fetchOrderSummary).mockRejectedValue(new Error('Network error'))

      render(<OrderDetailClient tableId="5" orderId="order-open-456" />)

      // Wait for items to load (fetchOrderItems succeeds)
      await screen.findByText('Bruschetta')

      // Normal order view is shown — no paid badge, actions still present
      expect(screen.queryByText('Paid')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Close Order' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Add Items' })).toBeInTheDocument()
    })

    it('shows normal view when env vars are not configured (loadOrderStatus early-exit)', async (): Promise<void> => {
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '')

      const { fetchOrderSummary } = await import('./orderData')

      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

      // loadOrderStatus returns early — fetchOrderSummary is never called
      // loadItems also returns early — shows API not configured error
      await waitFor((): void => {
        expect(screen.getByText('API not configured')).toBeInTheDocument()
      })
      expect(vi.mocked(fetchOrderSummary)).not.toHaveBeenCalled()
      expect(screen.queryByText('Paid')).not.toBeInTheDocument()
    })

    it('shows loading indicator for items in paid read-only view', async (): Promise<void> => {
      const { fetchOrderSummary } = await import('./orderData')
      const { fetchOrderItems } = await import('./orderData')

      vi.mocked(fetchOrderSummary).mockResolvedValue({ status: 'paid', payment_method: 'card' })
      // fetchOrderItems never resolves — items remain in loading state
      vi.mocked(fetchOrderItems).mockReturnValue(new Promise<never>(() => {}))

      render(<OrderDetailClient tableId="5" orderId="order-paid-loading" />)

      await waitFor((): void => {
        expect(screen.getByText('Paid')).toBeInTheDocument()
      })

      expect(screen.getByText('Loading items…')).toBeInTheDocument()
    })

    it('shows fetch error in paid read-only view when items fail to load', async (): Promise<void> => {
      const { fetchOrderSummary } = await import('./orderData')
      const { fetchOrderItems } = await import('./orderData')

      vi.mocked(fetchOrderSummary).mockResolvedValue({ status: 'paid', payment_method: 'card' })
      vi.mocked(fetchOrderItems).mockRejectedValue(new Error('Items load failed'))

      render(<OrderDetailClient tableId="5" orderId="order-paid-err" />)

      await waitFor((): void => {
        expect(screen.getByText('Paid')).toBeInTheDocument()
      })

      await waitFor((): void => {
        expect(screen.getByText('Items load failed')).toBeInTheDocument()
      })
    })

    it('shows empty state in paid read-only view when order has no items', async (): Promise<void> => {
      const { fetchOrderSummary } = await import('./orderData')
      const { fetchOrderItems } = await import('./orderData')

      vi.mocked(fetchOrderSummary).mockResolvedValue({ status: 'paid', payment_method: 'card' })
      vi.mocked(fetchOrderItems).mockResolvedValue([])

      render(<OrderDetailClient tableId="5" orderId="order-paid-empty" />)

      await waitFor((): void => {
        expect(screen.getByText('Paid')).toBeInTheDocument()
      })

      expect(screen.getByText('No items on this order.')).toBeInTheDocument()
    })
  })

  describe('reprint KOT', () => {
    it('renders the Reprint KOT button when the order has items', async (): Promise<void> => {
      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

      await screen.findByText('Bruschetta')

      expect(screen.getByRole('button', { name: /Reprint KOT/i })).toBeInTheDocument()
    })

    it('Reprint KOT button has minimum 48px touch target', async (): Promise<void> => {
      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

      await screen.findByText('Bruschetta')

      const btn = screen.getByRole('button', { name: /Reprint KOT/i })
      expect(btn.className).toContain('min-h-[48px]')
    })

    it('does not render the Reprint KOT button when order has no items', async (): Promise<void> => {
      const { fetchOrderItems } = await import('./orderData')
      vi.mocked(fetchOrderItems).mockResolvedValue([])

      render(<OrderDetailClient tableId="5" orderId="order-empty" />)

      await waitFor((): void => {
        expect(screen.getByText('No items yet — tap Add Items to start')).toBeInTheDocument()
      })

      expect(screen.queryByRole('button', { name: /Reprint KOT/i })).not.toBeInTheDocument()
    })

    it('shows "Reprinting…" and disables the button while the print dialog opens', async (): Promise<void> => {
      const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {})

      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

      await screen.findByText('Bruschetta')

      const btn = screen.getByRole('button', { name: /Reprint KOT/i })
      fireEvent.click(btn)

      // Reprinting state is set synchronously before the setTimeout fires
      expect(screen.getByRole('button', { name: 'Reprinting…' })).toBeDisabled()

      // Advance timers so the print() call fires
      await act(async (): Promise<void> => {
        vi.advanceTimersByTime(200)
      })

      expect(printSpy).toHaveBeenCalledTimes(1)

      // Button stays disabled until afterprint fires (print dialog still open)
      expect(screen.getByRole('button', { name: 'Reprinting…' })).toBeDisabled()

      // Simulate print dialog closing
      await act(async (): Promise<void> => {
        window.dispatchEvent(new Event('afterprint'))
      })

      // After afterprint, loading state resets
      expect(screen.getByRole('button', { name: /Reprint KOT/i })).not.toBeDisabled()

      printSpy.mockRestore()
    })

    it('calls window.print() when Reprint KOT is clicked', async (): Promise<void> => {
      const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {})

      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

      await screen.findByText('Bruschetta')

      fireEvent.click(screen.getByRole('button', { name: /Reprint KOT/i }))

      await act(async (): Promise<void> => {
        vi.advanceTimersByTime(200)
      })

      expect(printSpy).toHaveBeenCalledTimes(1)
      printSpy.mockRestore()
    })

    it('does NOT call markItemsSentToKitchen when Reprint KOT is clicked', async (): Promise<void> => {
      const { markItemsSentToKitchen } = await import('./kotApi')
      vi.spyOn(window, 'print').mockImplementation(() => {})

      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

      await screen.findByText('Bruschetta')

      fireEvent.click(screen.getByRole('button', { name: /Reprint KOT/i }))

      await act(async (): Promise<void> => {
        vi.advanceTimersByTime(200)
      })

      expect(markItemsSentToKitchen).not.toHaveBeenCalled()
    })
  })
})
