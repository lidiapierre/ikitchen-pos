import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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

vi.mock('./orderData', () => ({
  MOCK_ORDER_ITEMS: [
    { id: '1', name: 'Bruschetta', quantity: 2, price_cents: 850 },
    { id: '2', name: 'Grilled Salmon', quantity: 1, price_cents: 1850 },
    { id: '3', name: 'House Wine', quantity: 2, price_cents: 950 },
  ],
}))

describe('OrderDetailClient', () => {
  beforeEach((): void => {
    vi.clearAllMocks()
  })

  it('renders all mock item names', (): void => {
    render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

    expect(screen.getByText('Bruschetta')).toBeInTheDocument()
    expect(screen.getByText('Grilled Salmon')).toBeInTheDocument()
    expect(screen.getByText('House Wine')).toBeInTheDocument()
  })

  it('renders item quantities', (): void => {
    render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

    const spans = screen.getAllByText(/^×\d+$/)
    expect(spans.length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('×1')).toBeInTheDocument()
  })

  it('renders per-item prices', (): void => {
    render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

    expect(screen.getByText('$8.50 each')).toBeInTheDocument()
    expect(screen.getByText('$18.50 each')).toBeInTheDocument()
    expect(screen.getByText('$9.50 each')).toBeInTheDocument()
  })

  it('renders line totals for each item', (): void => {
    render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

    // Bruschetta: 2 × $8.50 = $17.00
    expect(screen.getByText('$17.00')).toBeInTheDocument()
    // Grilled Salmon: 1 × $18.50 = $18.50
    expect(screen.getByText('$18.50')).toBeInTheDocument()
    // House Wine: 2 × $9.50 = $19.00
    expect(screen.getByText('$19.00')).toBeInTheDocument()
  })

  it('renders the running order total', (): void => {
    render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

    // 2×850 + 1×1850 + 2×950 = 5450 cents = $54.50
    expect(screen.getByText('$54.50')).toBeInTheDocument()
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

  it('navigates to /tables on successful close', async (): Promise<void> => {
    const { callCloseOrder } = await import('./closeOrderApi')
    vi.mocked(callCloseOrder).mockResolvedValue(undefined)

    render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

    fireEvent.click(screen.getByRole('button', { name: 'Close Order' }))

    await waitFor((): void => {
      expect(mockPush).toHaveBeenCalledWith('/tables')
    })
  })

  it('shows an error message when the API call fails', async (): Promise<void> => {
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
})
