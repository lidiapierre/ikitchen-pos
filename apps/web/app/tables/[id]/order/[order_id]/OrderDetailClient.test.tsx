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
  callRecordSplitPayment: vi.fn(),
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

vi.mock('@/lib/kotPrint', () => ({
  printKot: vi.fn(),
  printBill: vi.fn(),
  findPrinter: vi.fn().mockReturnValue(null),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: vi.fn().mockResolvedValue({ data: null }),
    }),
  },
}))

vi.mock('@/lib/user-context', () => ({
  useUser: vi.fn().mockReturnValue({ accessToken: null, isAdmin: false, role: null, loading: false }),
}))

vi.mock('@/components/KotPrintView', () => ({
  default: (): JSX.Element => <div data-testid="kot-print-view" />,
}))

vi.mock('./orderItemNotesApi', () => ({
  updateOrderItemNotes: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./updateQuantityApi', () => ({
  updateOrderItemQuantity: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/fetchVatConfig', () => ({
  fetchOrderVatContext: vi.fn().mockResolvedValue({ restaurantId: 'rest-1', menuId: null }),
  fetchVatConfig: vi.fn().mockResolvedValue({ vatPercent: 15, taxInclusive: false }),
}))

const mockItems = [
  { id: '1', name: 'Bruschetta', quantity: 2, price_cents: 850, modifier_ids: [], modifier_names: [], sent_to_kitchen: false, comp: false, comp_reason: null, seat: null, course: 'main' as const, course_status: 'waiting' as const, menuId: null, printerType: 'kitchen' as const, item_discount_type: null, item_discount_value: null, notes: null },
  { id: '2', name: 'Grilled Salmon', quantity: 1, price_cents: 1850, modifier_ids: [], modifier_names: [], sent_to_kitchen: false, comp: false, comp_reason: null, seat: null, course: 'main' as const, course_status: 'waiting' as const, menuId: null, printerType: 'kitchen' as const, item_discount_type: null, item_discount_value: null, notes: null },
  { id: '3', name: 'House Wine', quantity: 2, price_cents: 950, modifier_ids: [], modifier_names: [], sent_to_kitchen: false, comp: false, comp_reason: null, seat: null, course: 'main' as const, course_status: 'waiting' as const, menuId: null, printerType: 'kitchen' as const, item_discount_type: null, item_discount_value: null, notes: null },
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
    vi.mocked(fetchOrderSummary).mockResolvedValue({ status: 'open', payment_method: null, order_type: 'dine_in', customer_name: null, delivery_note: null, customer_mobile: null, bill_number: null, reservation_id: null, customer_id: null, order_number: null, scheduled_time: null, delivery_zone_name: null, delivery_charge: 0, delivery_zone_id: null, merge_label: null, payment_lines: [] })
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
    // qty > 1 items show ×N badge (amber highlight, issue #389)
    const qtyBadges = screen.getAllByText(/^×\d+$/)
    expect(qtyBadges.length).toBeGreaterThanOrEqual(2) // ×2 for Bruschetta and House Wine
    // qty = 1 item shows plain number (no × prefix)
    const qtyOne = screen.getByRole('button', { name: 'Quantity 1, tap to edit' })
    expect(qtyOne).toHaveTextContent('1')
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

  it('clicking Close Order shows the bill preview screen', async (): Promise<void> => {
    render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

    await screen.findByText('Bruschetta')
    fireEvent.click(screen.getByRole('button', { name: 'Close Order' }))

    await waitFor((): void => {
      expect(screen.getByText('Bill Preview')).toBeInTheDocument()
    })
  })

  it('shows "Processing…" and disables the button while Proceed to Payment API call is in progress', async (): Promise<void> => {
    const { callCloseOrder } = await import('./closeOrderApi')
    vi.mocked(callCloseOrder).mockImplementation(
      (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 100)),
    )

    render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

    await screen.findByText('Bruschetta')
    fireEvent.click(screen.getByRole('button', { name: 'Close Order' }))
    await waitFor((): void => {
      expect(screen.getByText('Bill Preview')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Proceed to Payment' }))

    await waitFor((): void => {
      expect(screen.getByRole('button', { name: 'Processing…' })).toBeDisabled()
    })
  })

  it('shows bill preview after clicking Close Order, then payment step after Proceed to Payment', async (): Promise<void> => {
    const { callCloseOrder } = await import('./closeOrderApi')
    vi.mocked(callCloseOrder).mockResolvedValue(undefined)

    render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

    await screen.findByText('Bruschetta')
    fireEvent.click(screen.getByRole('button', { name: 'Close Order' }))

    await waitFor((): void => {
      expect(screen.getByText('Bill Preview')).toBeInTheDocument()
    })
    expect(mockPush).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Proceed to Payment' }))

    await waitFor((): void => {
      expect(screen.getByText('Record Payment')).toBeInTheDocument()
    })
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('shows an error message when the close order API call fails (from bill preview)', async (): Promise<void> => {
    const { callCloseOrder } = await import('./closeOrderApi')
    vi.mocked(callCloseOrder).mockRejectedValue(new Error('Order has no items'))

    render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

    await screen.findByText('Bruschetta')
    fireEvent.click(screen.getByRole('button', { name: 'Close Order' }))
    await waitFor((): void => {
      expect(screen.getByText('Bill Preview')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Proceed to Payment' }))

    await waitFor((): void => {
      expect(screen.getByText('Order has no items')).toBeInTheDocument()
    })
  })

  it('re-enables the Proceed to Payment button after an error', async (): Promise<void> => {
    const { callCloseOrder } = await import('./closeOrderApi')
    vi.mocked(callCloseOrder).mockRejectedValue(new Error('Server error'))

    render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

    await screen.findByText('Bruschetta')
    fireEvent.click(screen.getByRole('button', { name: 'Close Order' }))
    await waitFor((): void => {
      expect(screen.getByText('Bill Preview')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Proceed to Payment' }))

    await waitFor((): void => {
      expect(screen.getByRole('button', { name: 'Proceed to Payment' })).not.toBeDisabled()
    })
  })

  it('shows "API not configured" error on bill preview when Supabase env vars are absent', async (): Promise<void> => {
    vi.unstubAllEnvs()

    render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

    await screen.findByText('Bruschetta')
    fireEvent.click(screen.getByRole('button', { name: 'Close Order' }))
    await waitFor((): void => {
      expect(screen.getByText('Bill Preview')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Proceed to Payment' }))

    await waitFor((): void => {
      expect(screen.getAllByText('Not authenticated').length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('bill preview', () => {
    async function openBillPreview(): Promise<void> {
      await screen.findByText('Bruschetta')
      fireEvent.click(screen.getByRole('button', { name: 'Close Order' }))
      await waitFor((): void => {
        expect(screen.getByText('Bill Preview')).toBeInTheDocument()
      })
    }

    it('bill preview shows all item names', async (): Promise<void> => {
      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)
      await openBillPreview()

      expect(screen.getAllByText('Bruschetta').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('Grilled Salmon').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('House Wine').length).toBeGreaterThanOrEqual(1)
    })

    it('bill preview shows item quantities', async (): Promise<void> => {
      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)
      await openBillPreview()

      // Bruschetta ×2, House Wine ×2
      const times2 = screen.getAllByText('×2')
      expect(times2.length).toBeGreaterThanOrEqual(2)
      // Grilled Salmon ×1
      expect(screen.getAllByText('×1').length).toBeGreaterThanOrEqual(1)
    })

    it('bill preview shows the grand total', async (): Promise<void> => {
      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)
      await openBillPreview()

      // Grand Total heading and total value should be visible
      expect(screen.getByText('Grand Total')).toBeInTheDocument()
    })

    it('bill preview Back button returns to order screen', async (): Promise<void> => {
      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)
      await openBillPreview()

      fireEvent.click(screen.getByRole('button', { name: '← Back' }))

      await waitFor((): void => {
        expect(screen.getByRole('button', { name: 'Close Order' })).toBeInTheDocument()
      })
      expect(screen.queryByText('Bill Preview')).not.toBeInTheDocument()
    })

    it('bill preview Proceed to Payment button has minimum 48px touch target', async (): Promise<void> => {
      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)
      await openBillPreview()

      const btn = screen.getByRole('button', { name: 'Proceed to Payment' })
      expect(btn.className).toContain('min-h-[48px]')
    })

    it('bill preview Back button has minimum 48px touch target', async (): Promise<void> => {
      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)
      await openBillPreview()

      const btn = screen.getByRole('button', { name: '← Back' })
      expect(btn.className).toContain('min-h-[48px]')
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
      await screen.findByText('Bruschetta')
      fireEvent.click(screen.getByRole('button', { name: 'Close Order' }))
      await waitFor((): void => {
        expect(screen.getByText('Bill Preview')).toBeInTheDocument()
      })
      fireEvent.click(screen.getByRole('button', { name: 'Proceed to Payment' }))
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
          course_status: 'waiting' as const, menuId: null, printerType: 'kitchen' as const, item_discount_type: null, item_discount_value: null, notes: null,
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

      vi.mocked(fetchOrderSummary).mockResolvedValue({ status: 'paid', payment_method: 'card', order_type: 'dine_in', customer_name: null, delivery_note: null, customer_mobile: null, bill_number: null, reservation_id: null, customer_id: null, order_number: null, scheduled_time: null, delivery_zone_id: null, delivery_zone_name: null, delivery_charge: 0, merge_label: null, payment_lines: [] })
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
          course_status: 'waiting' as const, menuId: null, printerType: 'kitchen' as const, item_discount_type: null, item_discount_value: null, notes: null,
        },
      ])

      render(<OrderDetailClient tableId="5" orderId="order-paid-123" />)

      await waitFor((): void => {
        expect(screen.getByText('Paid')).toBeInTheDocument()
      })

      expect(screen.getByText('+ Extra cheese')).toBeInTheDocument()
    })
  })

  describe('per-item notes (issue #272)', () => {
    it('shows existing note inline below the item name', async (): Promise<void> => {
      const { fetchOrderItems } = await import('./orderData')
      vi.mocked(fetchOrderItems).mockResolvedValue([
        {
          id: '1',
          name: 'Burger',
          quantity: 1,
          price_cents: 1200,
          modifier_ids: [],
          modifier_names: [],
          sent_to_kitchen: false,
          comp: false,
          comp_reason: null,
          seat: null,
          course: 'main' as const,
          course_status: 'waiting' as const,
          menuId: null,
          printerType: 'kitchen' as const,
          item_discount_type: null,
          item_discount_value: null,
          notes: 'no onions',
        },
      ])

      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

      await screen.findByText('Burger')
      expect(screen.getByText('↳ no onions')).toBeInTheDocument()
    })

    it('does not show note line when notes is null', async (): Promise<void> => {
      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

      await screen.findByText('Bruschetta')
      // No note text should appear for items with null notes
      expect(screen.queryByText(/^↳/)).not.toBeInTheDocument()
    })

    it('shows pencil button to add note on unsent items in order step', async (): Promise<void> => {
      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

      await screen.findByText('Bruschetta')
      // Pencil / Add note buttons should appear
      const addNoteButtons = screen.getAllByRole('button', { name: /Add note|Edit note/i })
      expect(addNoteButtons.length).toBeGreaterThan(0)
    })

    it('shows note input when pencil button is clicked', async (): Promise<void> => {
      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

      await screen.findByText('Bruschetta')
      const addNoteButtons = screen.getAllByRole('button', { name: /Add note/i })
      fireEvent.click(addNoteButtons[0])

      expect(screen.getByPlaceholderText(/Add note/i)).toBeInTheDocument()
    })

    it('saves note and updates local state on blur', async (): Promise<void> => {
      vi.mock('./orderItemNotesApi', () => ({
        updateOrderItemNotes: vi.fn().mockResolvedValue(undefined),
      }))

      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

      await screen.findByText('Bruschetta')
      const addNoteButtons = screen.getAllByRole('button', { name: /Add note/i })
      fireEvent.click(addNoteButtons[0])

      const input = screen.getByPlaceholderText(/Add note/i)
      fireEvent.change(input, { target: { value: 'extra spicy' } })
      fireEvent.blur(input)

      await waitFor((): void => {
        expect(screen.getByText('↳ extra spicy')).toBeInTheDocument()
      })
    })
  })

  describe('paid order read-only view', () => {
    it('shows read-only paid state when navigating to an already-paid order', async (): Promise<void> => {
      const { fetchOrderSummary } = await import('./orderData')
      vi.mocked(fetchOrderSummary).mockResolvedValue({ status: 'paid', payment_method: 'card', order_type: 'dine_in', customer_name: null, delivery_note: null, customer_mobile: null, bill_number: null, reservation_id: null, customer_id: null, order_number: null, scheduled_time: null, delivery_zone_id: null, delivery_zone_name: null, delivery_charge: 0, merge_label: null, payment_lines: [] })

      render(<OrderDetailClient tableId="5" orderId="order-paid-123" />)

      await waitFor((): void => {
        expect(screen.getByText('Paid')).toBeInTheDocument()
      })
    })

    it('shows payment method in paid read-only view', async (): Promise<void> => {
      const { fetchOrderSummary } = await import('./orderData')
      vi.mocked(fetchOrderSummary).mockResolvedValue({ status: 'paid', payment_method: 'cash', order_type: 'dine_in', customer_name: null, delivery_note: null, customer_mobile: null, bill_number: null, reservation_id: null, customer_id: null, order_number: null, scheduled_time: null, delivery_zone_id: null, delivery_zone_name: null, delivery_charge: 0, merge_label: null, payment_lines: [] })

      render(<OrderDetailClient tableId="5" orderId="order-paid-123" />)

      await waitFor((): void => {
        expect(screen.getByText('Payment method')).toBeInTheDocument()
        expect(screen.getByText('cash')).toBeInTheDocument()
      })
    })

    it('does not show Close Order or Add Items in paid read-only view', async (): Promise<void> => {
      const { fetchOrderSummary } = await import('./orderData')
      vi.mocked(fetchOrderSummary).mockResolvedValue({ status: 'paid', payment_method: 'card', order_type: 'dine_in', customer_name: null, delivery_note: null, customer_mobile: null, bill_number: null, reservation_id: null, customer_id: null, order_number: null, scheduled_time: null, delivery_zone_id: null, delivery_zone_name: null, delivery_charge: 0, merge_label: null, payment_lines: [] })

      render(<OrderDetailClient tableId="5" orderId="order-paid-123" />)

      await waitFor((): void => {
        expect(screen.getByText('Paid')).toBeInTheDocument()
      })

      expect(screen.queryByRole('button', { name: 'Close Order' })).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Add Items' })).not.toBeInTheDocument()
    })

    it('shows order total in paid read-only view', async (): Promise<void> => {
      const { fetchOrderSummary } = await import('./orderData')
      vi.mocked(fetchOrderSummary).mockResolvedValue({ status: 'paid', payment_method: 'card', order_type: 'dine_in', customer_name: null, delivery_note: null, customer_mobile: null, bill_number: null, reservation_id: null, customer_id: null, order_number: null, scheduled_time: null, delivery_zone_id: null, delivery_zone_name: null, delivery_charge: 0, merge_label: null, payment_lines: [] })

      render(<OrderDetailClient tableId="5" orderId="order-paid-123" />)

      await waitFor((): void => {
        expect(screen.getByText('Paid')).toBeInTheDocument()
      })
      // 2×850 + 1×1850 + 2×950 = ৳ 54.50
      expect(screen.getByText('৳ 54.50')).toBeInTheDocument()
    })

    it('Back to tables link has minimum 48px touch target in paid view', async (): Promise<void> => {
      const { fetchOrderSummary } = await import('./orderData')
      vi.mocked(fetchOrderSummary).mockResolvedValue({ status: 'paid', payment_method: 'card', order_type: 'dine_in', customer_name: null, delivery_note: null, customer_mobile: null, bill_number: null, reservation_id: null, customer_id: null, order_number: null, scheduled_time: null, delivery_zone_id: null, delivery_zone_name: null, delivery_charge: 0, merge_label: null, payment_lines: [] })

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

      vi.mocked(fetchOrderSummary).mockResolvedValue({ status: 'paid', payment_method: 'card', order_type: 'dine_in', customer_name: null, delivery_note: null, customer_mobile: null, bill_number: null, reservation_id: null, customer_id: null, order_number: null, scheduled_time: null, delivery_zone_id: null, delivery_zone_name: null, delivery_charge: 0, merge_label: null, payment_lines: [] })
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

      vi.mocked(fetchOrderSummary).mockResolvedValue({ status: 'paid', payment_method: 'card', order_type: 'dine_in', customer_name: null, delivery_note: null, customer_mobile: null, bill_number: null, reservation_id: null, customer_id: null, order_number: null, scheduled_time: null, delivery_zone_id: null, delivery_zone_name: null, delivery_charge: 0, merge_label: null, payment_lines: [] })
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

      vi.mocked(fetchOrderSummary).mockResolvedValue({ status: 'paid', payment_method: 'card', order_type: 'dine_in', customer_name: null, delivery_note: null, customer_mobile: null, bill_number: null, reservation_id: null, customer_id: null, order_number: null, scheduled_time: null, delivery_zone_id: null, delivery_zone_name: null, delivery_charge: 0, merge_label: null, payment_lines: [] })
      vi.mocked(fetchOrderItems).mockResolvedValue([])

      render(<OrderDetailClient tableId="5" orderId="order-paid-empty" />)

      await waitFor((): void => {
        expect(screen.getByText('Paid')).toBeInTheDocument()
      })

      expect(screen.getByText('No items on this order.')).toBeInTheDocument()
    })

    it('shows Delivery Fee row in paid read-only view for delivery orders (issue #393)', async (): Promise<void> => {
      // Regression guard: the Delivery Fee row added to the paid-order <dl> in OrderDetailClient.tsx
      // must render for delivery orders with a non-zero charge. Previously all paid-order tests
      // used order_type: 'dine_in' + delivery_charge: 0, leaving this render path uncovered.
      vi.useRealTimers()

      const { fetchOrderSummary } = await import('./orderData')
      const { fetchOrderItems } = await import('./orderData')

      vi.mocked(fetchOrderSummary).mockResolvedValue({
        status: 'paid',
        payment_method: 'cash',
        order_type: 'delivery',
        customer_name: 'Ahmed Khan',
        delivery_note: 'Road 12, House 5',
        customer_mobile: '+880 1711 123456',
        bill_number: null,
        reservation_id: null,
        customer_id: null,
        order_number: 99,
        scheduled_time: null,
        delivery_zone_name: 'Zone A',
        delivery_charge: 9900,
        delivery_zone_id: 'zone-1',
        merge_label: null, payment_lines: [],
      })
      vi.mocked(fetchOrderItems).mockResolvedValue([])

      render(<OrderDetailClient tableId="delivery" orderId="order-paid-delivery-99" />)

      await waitFor((): void => {
        expect(screen.getByText('Paid')).toBeInTheDocument()
      }, { timeout: 10000 })

      // "Delivery Fee" label and the formatted amount should both appear in the paid view
      expect(screen.getAllByText('Delivery Fee').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('৳ 99.00')).toBeInTheDocument()
    })

    it('shows Free Delivery in paid read-only view for delivery orders with zero charge (issue #393)', async (): Promise<void> => {
      vi.useRealTimers()

      const { fetchOrderSummary } = await import('./orderData')
      const { fetchOrderItems } = await import('./orderData')

      vi.mocked(fetchOrderSummary).mockResolvedValue({
        status: 'paid',
        payment_method: 'cash',
        order_type: 'delivery',
        customer_name: 'Ahmed Khan',
        delivery_note: 'Road 12, House 5',
        customer_mobile: '+880 1711 123456',
        bill_number: null,
        reservation_id: null,
        customer_id: null,
        order_number: 100,
        scheduled_time: null,
        delivery_zone_name: null,
        delivery_charge: 0,
        delivery_zone_id: null,
        merge_label: null, payment_lines: [],
      })
      vi.mocked(fetchOrderItems).mockResolvedValue([])

      render(<OrderDetailClient tableId="delivery" orderId="order-paid-delivery-free" />)

      await waitFor((): void => {
        expect(screen.getByText('Paid')).toBeInTheDocument()
      }, { timeout: 10000 })

      expect(screen.getAllByText('Delivery Fee').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('Free Delivery')).toBeInTheDocument()
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

  describe('KOT send — browser vs network print path', () => {
    it('navigates to /tables immediately for browser print without awaiting markItemsSentToKitchen', async (): Promise<void> => {
      const { printKot } = await import('@/lib/kotPrint')
      const { markItemsSentToKitchen } = await import('./kotApi')

      // printKot returns browser method
      vi.mocked(printKot).mockResolvedValue({ method: 'browser', success: true })

      // markItemsSentToKitchen never resolves — to prove we don't await it
      vi.mocked(markItemsSentToKitchen).mockReturnValue(new Promise(() => {}))

      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)
      await screen.findByText('Bruschetta')

      fireEvent.click(screen.getByRole('button', { name: /← Back to tables/i }))

      await waitFor((): void => {
        expect(mockPush).toHaveBeenCalledWith('/tables')
      })

      // markItemsSentToKitchen was called (fire-and-forget) but we didn't await it
      expect(markItemsSentToKitchen).toHaveBeenCalled()
    })

    it('awaits markItemsSentToKitchen before navigating for TCP/IP (network) print', async (): Promise<void> => {
      const { printKot } = await import('@/lib/kotPrint')
      const { markItemsSentToKitchen } = await import('./kotApi')

      // printKot returns network method
      vi.mocked(printKot).mockResolvedValue({ method: 'network', success: true })

      // markItemsSentToKitchen: controllable promise
      let resolveMarkItems!: () => void
      vi.mocked(markItemsSentToKitchen).mockReturnValue(
        new Promise<void>((resolve) => { resolveMarkItems = resolve }),
      )

      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)
      await screen.findByText('Bruschetta')

      fireEvent.click(screen.getByRole('button', { name: /← Back to tables/i }))

      // Should NOT have navigated yet — waiting for markItemsSentToKitchen
      await act(async (): Promise<void> => { await Promise.resolve() })
      expect(mockPush).not.toHaveBeenCalled()

      // Resolve markItemsSentToKitchen — now it should navigate
      await act(async (): Promise<void> => { resolveMarkItems() })

      await waitFor((): void => {
        expect(mockPush).toHaveBeenCalledWith('/tables')
      })
    })
  })

  describe('handleQtyButton — + and − quantity controls (issue #389)', () => {
    beforeEach(async (): Promise<void> => {
      // Provide a real access token so handleQtyButton doesn't early-return on !accessToken
      const { useUser } = await import('@/lib/user-context')
      vi.mocked(useUser).mockReturnValue({
        accessToken: 'test-token', isAdmin: false, role: 'server', loading: false,
      })
    })

    it('tapping + immediately shows incremented quantity (optimistic update)', async (): Promise<void> => {
      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)
      await screen.findByText('Grilled Salmon') // wait for items to load; Grilled Salmon has qty=1

      // Grilled Salmon is the second item; click its + button
      const plusButtons = screen.getAllByRole('button', { name: 'Increase quantity' })
      fireEvent.click(plusButtons[1]) // index 1 = Grilled Salmon

      // Optimistic update: qty=1 → qty=2; badge now shows ×2 (amber, issue #389)
      await waitFor((): void => {
        expect(screen.getAllByRole('button', { name: 'Quantity 2, tap to edit' }).length).toBeGreaterThanOrEqual(1)
      })
    })

    it('coalesces rapid + taps into a single API call after the debounce delay', async (): Promise<void> => {
      const { updateOrderItemQuantity } = await import('./updateQuantityApi')

      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)
      await screen.findByText('Bruschetta') // Bruschetta is first item, qty=2

      // Tap Bruschetta's + button three times quickly
      const plusButtons = screen.getAllByRole('button', { name: 'Increase quantity' })
      fireEvent.click(plusButtons[0])
      fireEvent.click(plusButtons[0])
      fireEvent.click(plusButtons[0])

      // No API call yet — still within debounce window
      expect(updateOrderItemQuantity).not.toHaveBeenCalled()

      // Advance past the 400 ms debounce window
      await act(async (): Promise<void> => {
        vi.advanceTimersByTime(500)
      })

      // Exactly one API call with the final coalesced qty (2 + 3 taps = 5)
      expect(updateOrderItemQuantity).toHaveBeenCalledTimes(1)
      expect(updateOrderItemQuantity).toHaveBeenCalledWith(
        'https://example.supabase.co',
        'test-token',
        '1', // Bruschetta id
        5,   // started at qty=2, tapped + 3 times → 5
      )
    })

    it('rolls back to original quantity when the API call fails', async (): Promise<void> => {
      const { updateOrderItemQuantity } = await import('./updateQuantityApi')
      let rejectQty!: (err: Error) => void
      vi.mocked(updateOrderItemQuantity).mockReturnValueOnce(
        new Promise<void>((_, reject) => { rejectQty = reject }),
      )

      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)
      await screen.findByText('Grilled Salmon') // qty=1

      // Click Grilled Salmon's + button (index 1)
      const plusButtons = screen.getAllByRole('button', { name: 'Increase quantity' })
      fireEvent.click(plusButtons[1])

      // Advance past debounce — API call fires
      await act(async (): Promise<void> => {
        vi.advanceTimersByTime(500)
      })

      // Reject the API call
      await act(async (): Promise<void> => {
        rejectQty(new Error('Network error'))
        await Promise.resolve()
      })

      // UI must roll back to the original qty=1 (plain number button, no × prefix)
      await waitFor((): void => {
        expect(screen.getByRole('button', { name: 'Quantity 1, tap to edit' })).toBeInTheDocument()
      })
    })

    it('rapid − taps to 0 open the void dialog and roll back intermediate optimistic state', async (): Promise<void> => {
      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)
      await screen.findByText('Bruschetta') // qty=2

      // Tap Bruschetta's − twice:
      //   Tap 1: qty=2→1 (optimistic), debounce starts, originalItems snapshot captured
      //   Tap 2: newQty=0 → void path: cancel pending, roll back to snapshot (qty=2), open dialog
      const minusButtons = screen.getAllByRole('button', { name: 'Decrease quantity' })
      fireEvent.click(minusButtons[0]) // optimistic: qty 2→1
      fireEvent.click(minusButtons[0]) // newQty=0 → void dialog + rollback

      // Void dialog should be open
      await waitFor((): void => {
        expect(screen.getByText('Void Item')).toBeInTheDocument()
      })

      // Bruschetta qty badge should have rolled back to ×2 (not show 1 or 0)
      expect(screen.getAllByRole('button', { name: 'Quantity 2, tap to edit' }).length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('overpayment / tip (issue #390)', () => {
    // Helpers shared across tests in this block
    async function openPaymentStepForIssue390(): Promise<void> {
      const { callCloseOrder } = await import('./closeOrderApi')
      vi.mocked(callCloseOrder).mockResolvedValue(undefined)
      const { fetchOrderSummary } = await import('./orderData')
      vi.mocked(fetchOrderSummary).mockResolvedValue({
        status: 'open', payment_method: null, order_type: 'dine_in',
        customer_name: null, delivery_note: null, customer_mobile: null,
        bill_number: null, reservation_id: null, customer_id: null,
        order_number: null, scheduled_time: null, delivery_zone_name: null,
        delivery_zone_id: null, delivery_charge: 0, merge_label: null, payment_lines: [],
      })
      render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)
      await screen.findByText('Bruschetta')
      fireEvent.click(screen.getByRole('button', { name: /Close Order/ }))
      await waitFor((): void => { expect(screen.getByRole('button', { name: /Proceed to Payment/ })).toBeInTheDocument() })
      fireEvent.click(screen.getByRole('button', { name: /Proceed to Payment/ }))
      await waitFor((): void => { expect(screen.getByRole('button', { name: /Confirm Payment/ })).toBeInTheDocument() })
    }

    it('allows adding a cash amount that exceeds the bill total (cash tip / rounding)', async (): Promise<void> => {
      // Bill total = ৳54.50 (5450 cents). Customer tenders ৳60.00 — over-tender by ৳5.50.
      await openPaymentStepForIssue390()

      // Enter cash 60.00 (exceeds 54.50 bill)
      const amountInput = screen.getByRole('spinbutton')
      fireEvent.change(amountInput, { target: { value: '60.00' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))

      // No error should appear
      await waitFor((): void => {
        expect(screen.queryByText(/exceeds remaining balance/i)).not.toBeInTheDocument()
      })

      // Summary should show tendered amount and change
      await waitFor((): void => {
        expect(screen.getByText('Total tendered')).toBeInTheDocument()
        expect(screen.getByText('Change due')).toBeInTheDocument()
      })

      // Confirm Payment button must be enabled
      expect(screen.getByRole('button', { name: /Confirm Payment/ })).not.toBeDisabled()
    })

    it('allows adding a card amount that exceeds the bill total (tip on card)', async (): Promise<void> => {
      // Bill total = ৳54.50. Customer pays ৳60.00 by card — card tip of ৳5.50.
      await openPaymentStepForIssue390()

      // Select Card method
      fireEvent.click(screen.getByRole('button', { name: 'Card' }))

      // Enter card 60.00
      const amountInput = screen.getByRole('spinbutton')
      fireEvent.change(amountInput, { target: { value: '60.00' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))

      // No validation error
      await waitFor((): void => {
        expect(screen.queryByText(/exceeds remaining balance/i)).not.toBeInTheDocument()
      })

      // Summary shows tip / overpayment label for non-cash
      await waitFor((): void => {
        expect(screen.getByText('Total tendered')).toBeInTheDocument()
        expect(screen.getByText('Tip / overpayment')).toBeInTheDocument()
      })

      // Confirm button is enabled
      expect(screen.getByRole('button', { name: /Confirm Payment/ })).not.toBeDisabled()
    })

    it('allows split: cash first, then card that slightly exceeds remaining balance', async (): Promise<void> => {
      // Bill: ৳54.50 (5450 cents). Cash: ৳4.50 (450 cents), Card: ৳50.10 (5010 cents).
      // Card 5010 > remaining (5450 - 450 = 5000) by 10 cents — should be allowed.
      await openPaymentStepForIssue390()

      // Add cash 4.50
      const amountInput = screen.getByRole('spinbutton')
      fireEvent.change(amountInput, { target: { value: '4.50' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))

      // Remaining now shown (50.00)
      await waitFor((): void => {
        expect(screen.getByText(/Remaining/)).toBeInTheDocument()
      })

      // Select Card, enter 50.10
      fireEvent.click(screen.getByRole('button', { name: 'Card' }))
      const amountInput2 = screen.getByRole('spinbutton')
      fireEvent.change(amountInput2, { target: { value: '50.10' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))

      // No error
      await waitFor((): void => {
        expect(screen.queryByText(/exceeds remaining balance/i)).not.toBeInTheDocument()
      })

      // Confirm button enabled
      await waitFor((): void => {
        expect(screen.getByRole('button', { name: /Confirm Payment/ })).not.toBeDisabled()
      })
    })

    it('shows change/tip step after overpayment by non-cash method', async (): Promise<void> => {
      const { callRecordSplitPayment } = await import('./recordPaymentApi')
      vi.mocked(callRecordSplitPayment).mockResolvedValue({ change_due: 550 })

      await openPaymentStepForIssue390()

      // Add card 60.00 (over-tenders ৳54.50 bill by ৳5.50)
      fireEvent.click(screen.getByRole('button', { name: 'Card' }))
      const amountInput = screen.getByRole('spinbutton')
      fireEvent.change(amountInput, { target: { value: '60.00' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add' }))

      await waitFor((): void => {
        expect(screen.getByRole('button', { name: /Confirm Payment/ })).not.toBeDisabled()
      })
      fireEvent.click(screen.getByRole('button', { name: /Confirm Payment/ }))

      // Should show tip/overpayment step (not "Change Due" since no cash)
      await waitFor((): void => {
        expect(screen.getByText('Tip / Overpayment')).toBeInTheDocument()
      })
    })
  })

  // ─── Delivery fee visibility — issue #393 ─────────────────────────────────
  // NOTE: these tests use vi.useRealTimers() locally because vi.useFakeTimers()
  // (set in beforeEach) prevents waitFor's internal polling from advancing,
  // causing all async tests to time-out (pre-existing infra issue).
  describe('delivery fee visibility (issue #393)', () => {
    it('shows Delivery Fee in the order header for a delivery order', async (): Promise<void> => {
      vi.useRealTimers()

      const { fetchOrderSummary } = await import('./orderData')
      vi.mocked(fetchOrderSummary).mockResolvedValue({
        status: 'open',
        payment_method: null,
        order_type: 'delivery',
        customer_name: 'Ahmed Khan',
        delivery_note: 'Road 12, House 5',
        customer_mobile: '+880 1711 123456',
        bill_number: null,
        reservation_id: null,
        customer_id: null,
        order_number: 42,
        scheduled_time: '2026-04-06T18:00:00.000Z',
        delivery_zone_name: 'Zone A',
        delivery_charge: 9900,
        delivery_zone_id: 'zone-1',
        merge_label: null, payment_lines: [],
      })

      render(<OrderDetailClient tableId="delivery" orderId="order-delivery-1" />)

      await waitFor((): void => {
        expect(screen.getAllByText('Delivery Fee').length).toBeGreaterThanOrEqual(1)
      }, { timeout: 10000 })
    })

    it('shows Waive Delivery Fee button for non-admin staff on delivery orders (issue #393)', async (): Promise<void> => {
      vi.useRealTimers()

      const { fetchOrderSummary } = await import('./orderData')
      vi.mocked(fetchOrderSummary).mockResolvedValue({
        status: 'open',
        payment_method: null,
        order_type: 'delivery',
        customer_name: 'Ahmed Khan',
        delivery_note: 'Road 12, House 5',
        customer_mobile: '+880 1711 123456',
        bill_number: null,
        reservation_id: null,
        customer_id: null,
        order_number: 42,
        scheduled_time: '2026-04-06T18:00:00.000Z',
        delivery_zone_name: 'Zone A',
        delivery_charge: 9900,
        delivery_zone_id: 'zone-1',
        merge_label: null, payment_lines: [],
      })

      // Non-admin user — previously this button was admin-only
      const { useUser } = await import('@/lib/user-context')
      vi.mocked(useUser).mockReturnValue({ accessToken: 'test-token', isAdmin: false, role: 'waiter', loading: false })

      render(<OrderDetailClient tableId="delivery" orderId="order-delivery-1" />)

      await waitFor((): void => {
        expect(screen.getByRole('button', { name: /waive delivery fee/i })).toBeInTheDocument()
      }, { timeout: 10000 })
    })
  })
})

// ─── Post-payment breakdown — issue #391 ───────────────────────────────────────
// Separate describe outside the main suite: uses vi.useRealTimers() to avoid
// the fake-timer deadlock that affects most tests inside the main suite.
describe('OrderDetailClient — post-payment payment breakdown (issue #391)', () => {
  const mockItems391 = [
    { id: '1', name: 'Bruschetta', quantity: 2, price_cents: 850, modifier_ids: [], modifier_names: [], sent_to_kitchen: true, comp: false, comp_reason: null, seat: null, course: 'main' as const, course_status: 'waiting' as const, menuId: null, printerType: 'kitchen' as const, item_discount_type: null, item_discount_value: null, notes: null },
    { id: '2', name: 'Grilled Salmon', quantity: 1, price_cents: 1850, modifier_ids: [], modifier_names: [], sent_to_kitchen: true, comp: false, comp_reason: null, seat: null, course: 'main' as const, course_status: 'waiting' as const, menuId: null, printerType: 'kitchen' as const, item_discount_type: null, item_discount_value: null, notes: null },
    { id: '3', name: 'Bruschetta2', quantity: 2, price_cents: 950, modifier_ids: [], modifier_names: [], sent_to_kitchen: true, comp: false, comp_reason: null, seat: null, course: 'main' as const, course_status: 'waiting' as const, menuId: null, printerType: 'kitchen' as const, item_discount_type: null, item_discount_value: null, notes: null },
  ]

  beforeEach(async (): Promise<void> => {
    vi.clearAllMocks()
    vi.useRealTimers()
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'test-publishable-key')
    const { fetchOrderItems } = await import('./orderData')
    vi.mocked(fetchOrderItems).mockResolvedValue(mockItems391)
    const { fetchOrderSummary } = await import('./orderData')
    vi.mocked(fetchOrderSummary).mockResolvedValue({
      status: 'open', payment_method: null, order_type: 'dine_in',
      customer_name: null, delivery_note: null, customer_mobile: null,
      bill_number: null, reservation_id: null, customer_id: null,
      order_number: null, scheduled_time: null, delivery_zone_name: null,
      delivery_zone_id: null, delivery_charge: 0, merge_label: null, payment_lines: [],
    })
    const { callCloseOrder } = await import('./closeOrderApi')
    vi.mocked(callCloseOrder).mockResolvedValue(undefined)
  })

  afterEach((): void => {
    vi.unstubAllEnvs()
  })

  async function openPaymentStep391(): Promise<void> {
    render(<OrderDetailClient tableId="5" orderId="order-abc-391" />)
    await screen.findByText('Bruschetta')
    fireEvent.click(screen.getByRole('button', { name: /Close Order/ }))
    await waitFor((): void => { expect(screen.getByRole('button', { name: /Proceed to Payment/ })).toBeInTheDocument() })
    fireEvent.click(screen.getByRole('button', { name: /Proceed to Payment/ }))
    await waitFor((): void => { expect(screen.getByRole('button', { name: /Confirm Payment/ })).toBeInTheDocument() })
  }

  it('shows "Payment breakdown" section and bill total on success screen after card payment', async (): Promise<void> => {
    const { callRecordSplitPayment } = await import('./recordPaymentApi')
    vi.mocked(callRecordSplitPayment).mockResolvedValue({ change_due: 0 })

    await openPaymentStep391()
    fireEvent.click(screen.getByRole('button', { name: 'Card' }))
    fireEvent.click(screen.getByRole('button', { name: /Confirm Payment/ }))

    await waitFor((): void => {
      expect(screen.getByText('Payment recorded — order closed')).toBeInTheDocument()
    })

    expect(screen.getByText('Payment breakdown')).toBeInTheDocument()
    expect(screen.getByText('Bill total')).toBeInTheDocument()
    // Card / POS method shown in breakdown
    expect(screen.getAllByText('Card / POS').length).toBeGreaterThanOrEqual(1)
  })

  it('shows breakdown with method, bill total, tendered, and change on change screen', async (): Promise<void> => {
    const { callRecordSplitPayment } = await import('./recordPaymentApi')
    vi.mocked(callRecordSplitPayment).mockResolvedValue({ change_due: 250 })

    await openPaymentStep391()
    // cash 57.00 on a 54.50 bill → change 2.50
    const input = screen.getByRole('spinbutton')
    fireEvent.change(input, { target: { value: '57.00' } })
    fireEvent.click(screen.getByRole('button', { name: /Confirm Payment/ }))

    await waitFor((): void => {
      expect(screen.getByText('Change Due')).toBeInTheDocument()
    })

    expect(screen.getByText('Payment breakdown')).toBeInTheDocument()
    expect(screen.getByText('Bill total')).toBeInTheDocument()
    expect(screen.getByText('Total tendered')).toBeInTheDocument()
    expect(screen.getByText('Change to return')).toBeInTheDocument()
  })

  it('shows both methods in breakdown on success screen for split cash+card payment', async (): Promise<void> => {
    const { callRecordSplitPayment } = await import('./recordPaymentApi')
    vi.mocked(callRecordSplitPayment).mockResolvedValue({ change_due: 0 })

    await openPaymentStep391()

    // Add cash 30.00
    const cashInput = screen.getByRole('spinbutton')
    fireEvent.change(cashInput, { target: { value: '30.00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    // Add card to cover remaining
    await waitFor((): void => { expect(screen.getByText(/Remaining/)).toBeInTheDocument() })
    fireEvent.click(screen.getByRole('button', { name: 'Card' }))
    const cardInput = screen.getByRole('spinbutton')
    fireEvent.change(cardInput, { target: { value: '24.50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor((): void => {
      expect(screen.getByRole('button', { name: /Confirm Payment/ })).not.toBeDisabled()
    })
    fireEvent.click(screen.getByRole('button', { name: /Confirm Payment/ }))

    await waitFor((): void => {
      expect(screen.getByText('Payment recorded — order closed')).toBeInTheDocument()
    })

    // Both methods visible in the breakdown card
    expect(screen.getAllByText('Cash').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Card / POS').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Bill total')).toBeInTheDocument()
  })

  it('change screen → Done button advances to success screen showing "Change given" (issue #391)', async (): Promise<void> => {
    const { callRecordSplitPayment } = await import('./recordPaymentApi')
    vi.mocked(callRecordSplitPayment).mockResolvedValue({ change_due: 500 })

    await openPaymentStep391()
    // Cash 59.50 on a 54.50 bill → ৳5 change
    const input = screen.getByRole('spinbutton')
    fireEvent.change(input, { target: { value: '59.50' } })
    fireEvent.click(screen.getByRole('button', { name: /Confirm Payment/ }))

    await waitFor((): void => {
      expect(screen.getByText('Change Due')).toBeInTheDocument()
    })
    // "Done" button on change screen
    fireEvent.click(screen.getByRole('button', { name: /Done/ }))

    await waitFor((): void => {
      expect(screen.getByText('Payment recorded — order closed')).toBeInTheDocument()
    })
    // Success screen shows payment breakdown and change given
    expect(screen.getByText('Payment breakdown')).toBeInTheDocument()
    expect(screen.getByText('Change given')).toBeInTheDocument()
  })

  it('paid order header shows per-method breakdown when paidPaymentLines are populated (issue #391)', async (): Promise<void> => {
    const { fetchOrderSummary } = await import('./orderData')
    vi.mocked(fetchOrderSummary).mockResolvedValue({
      status: 'paid',
      payment_method: 'cash',
      order_type: 'dine_in',
      customer_name: null, delivery_note: null, customer_mobile: null,
      bill_number: null, reservation_id: null, customer_id: null,
      order_number: null, scheduled_time: null, delivery_zone_name: null,
      delivery_zone_id: null, delivery_charge: 0, merge_label: null,
      payment_lines: [
        { method: 'cash', amount_cents: 60000 },
        { method: 'card', amount_cents: 54500 },
      ],
    })

    render(<OrderDetailClient tableId="5" orderId="order-paid-391" />)

    await waitFor((): void => {
      expect(screen.getByText('Cash')).toBeInTheDocument()
    })
    expect(screen.getByText('Card / POS')).toBeInTheDocument()
    // Both method amounts shown
    expect(screen.getByText('৳ 600.00')).toBeInTheDocument()
    expect(screen.getByText('৳ 545.00')).toBeInTheDocument()
  })
})
