import { describe, it, expect, vi } from 'vitest'
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
  MOCK_ORDER_ITEMS: [],
}))

describe('OrderDetailClient — empty state', () => {
  it('shows the empty state message when there are no items', (): void => {
    render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

    expect(screen.getByText('No items yet — tap Add Items to start')).toBeInTheDocument()
  })

  it('still renders the Add Items link in the empty state', (): void => {
    render(<OrderDetailClient tableId="5" orderId="order-abc-123" />)

    expect(screen.getByRole('link', { name: 'Add Items' })).toBeInTheDocument()
  })
})
