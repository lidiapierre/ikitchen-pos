import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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
  fetchOrderItems: vi.fn(),
}))

const mockItems = [
  { id: '1', name: 'Bruschetta', quantity: 2, price_cents: 850 },
  { id: '2', name: 'Grilled Salmon', quantity: 1, price_cents: 1850 },
  { id: '3', name: 'House Wine', quantity: 2, price_cents: 950 },
]

describe('OrderDetailClient', () => {
  beforeEach(async (): Promise<void> => {
    vi.clearAllMocks()
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'test-publishable-key')
    const { fetchOrderItems } = await import('./orderData')
    vi.mocked(fetchOrderItems).mockResolvedValue(mockItems)
  })

  afterEach((): void => {
    vi.unstubAllEnvs()
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

    expect(await screen.findByText('$8.50 each')).toBeInTheDocument()
    expect(screen.getByText('$18.50 each')).toBeInTheDocument()
    expect(screen.getByText('$9.50 each')).toBeInTheDocument()
  })

  it('renders line totals for each item', async (): Promise<void> => {
    render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

    await screen.findByText('Bruschetta')
    // Bruschetta: 2 × $8.50 = $17.00
    expect(screen.getByText('$17.00')).toBeInTheDocument()
    // Grilled Salmon: 1 × $18.50 = $18.50
    expect(screen.getByText('$18.50')).toBeInTheDocument()
    // House Wine: 2 × $9.50 = $19.00
    expect(screen.getByText('$19.00')).toBeInTheDocument()
  })

  it('renders the running order total', async (): Promise<void> => {
    render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

    // 2×850 + 1×1850 + 2×950 = 5450 cents = $54.50
    expect(await screen.findByText('$54.50')).toBeInTheDocument()
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

  it('navigates to /tables/${tableId} on successful close', async (): Promise<void> => {
    const { callCloseOrder } = await import('./closeOrderApi')
    vi.mocked(callCloseOrder).mockResolvedValue(undefined)

    render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

    fireEvent.click(screen.getByRole('button', { name: 'Close Order' }))

    await waitFor((): void => {
      expect(mockPush).toHaveBeenCalledWith('/tables/5')
    })
  })

  it('shows an error message when the close API call fails', async (): Promise<void> => {
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
})
