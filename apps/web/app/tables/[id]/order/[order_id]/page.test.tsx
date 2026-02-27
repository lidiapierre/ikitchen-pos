import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode, JSX } from 'react'
import OrderDetailPage from './page'

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }): JSX.Element => (
    <a href={href}>{children as ReactNode}</a>
  ),
}))

describe('OrderDetailPage', () => {
  it('renders the table id and order id supplied via params', async (): Promise<void> => {
    const params = Promise.resolve({ id: '5', order_id: 'order-abc-123' })
    render(await OrderDetailPage({ params }))

    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('order-abc-123')).toBeInTheDocument()
  })

  it('renders a back link to the tables page', async (): Promise<void> => {
    const params = Promise.resolve({ id: '1', order_id: 'order-xyz-456' })
    render(await OrderDetailPage({ params }))

    const link = screen.getByRole('link', { name: /back to tables/i })
    expect(link).toHaveAttribute('href', '/tables')
  })

  it('back link has minimum 48px touch target', async (): Promise<void> => {
    const params = Promise.resolve({ id: '1', order_id: 'any-order' })
    render(await OrderDetailPage({ params }))

    const link = screen.getByRole('link', { name: /back to tables/i })
    expect(link.className).toContain('min-h-[48px]')
  })

  it('renders the Order heading', async (): Promise<void> => {
    const params = Promise.resolve({ id: '2', order_id: 'order-def-789' })
    render(await OrderDetailPage({ params }))

    expect(screen.getByRole('heading', { name: 'Order' })).toBeInTheDocument()
  })

  it('renders the Items section placeholder', async (): Promise<void> => {
    const params = Promise.resolve({ id: '3', order_id: 'order-ghi-012' })
    render(await OrderDetailPage({ params }))

    expect(screen.getByRole('heading', { name: 'Items' })).toBeInTheDocument()
  })
})
