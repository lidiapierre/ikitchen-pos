import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode, JSX } from 'react'
import OrderDetailClient from './OrderDetailClient'

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }): JSX.Element => (
    <a href={href}>{children as ReactNode}</a>
  ),
}))

vi.mock('next/navigation', () => ({
  useRouter: (): { push: () => void } => ({ push: vi.fn() }),
}))

vi.mock('./closeOrderApi', () => ({
  callCloseOrder: vi.fn(),
}))

vi.mock('./orderData', () => ({
  fetchOrderItems: vi.fn(),
  fetchOrderSummary: vi.fn().mockResolvedValue({ status: 'open', payment_method: null }),
}))

vi.mock('@/lib/fetchVatConfig', () => ({
  fetchOrderVatContext: vi.fn().mockResolvedValue({ restaurantId: 'rest-1', menuId: null }),
  fetchVatConfig: vi.fn().mockResolvedValue({ vatPercent: 15, taxInclusive: false }),
}))

describe('OrderDetailClient — empty state', () => {
  beforeEach(async (): Promise<void> => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'test-publishable-key')
    const { fetchOrderItems } = await import('./orderData')
    vi.mocked(fetchOrderItems).mockResolvedValue([])
  })

  afterEach((): void => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('shows the empty state message when there are no items', async (): Promise<void> => {
    render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

    expect(await screen.findByText('No items yet — tap Add Items to start')).toBeInTheDocument()
  })

  it('still renders the Add Items link in the empty state', async (): Promise<void> => {
    render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

    expect(await screen.findByRole('link', { name: 'Add Items' })).toBeInTheDocument()
  })
})
