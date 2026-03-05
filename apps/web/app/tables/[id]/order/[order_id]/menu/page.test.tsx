import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode, JSX } from 'react'
import MenuPage from './page'
import type { MenuCategory } from './menuData'
import { fetchMenuCategories } from './menuData'

vi.mock('./menuData', () => ({
  fetchMenuCategories: vi.fn(),
}))

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }): JSX.Element => (
    <a href={href}>{children as ReactNode}</a>
  ),
}))

vi.mock('next/navigation', () => ({
  useRouter: (): { push: () => void } => ({ push: vi.fn() }),
}))

const MOCK_CATEGORIES: MenuCategory[] = [
  {
    name: 'Starters',
    items: [
      { id: '00000000-0000-0000-0000-000000000301', name: 'Bruschetta', price_cents: 850 },
      { id: '00000000-0000-0000-0000-000000000302', name: 'Caesar Salad', price_cents: 1050 },
      { id: '00000000-0000-0000-0000-000000000303', name: 'Soup of the Day', price_cents: 750 },
    ],
  },
  {
    name: 'Mains',
    items: [
      { id: '00000000-0000-0000-0000-000000000304', name: 'Grilled Salmon', price_cents: 1850 },
      { id: '00000000-0000-0000-0000-000000000305', name: 'Ribeye Steak', price_cents: 2650 },
      { id: '00000000-0000-0000-0000-000000000306', name: 'Mushroom Risotto', price_cents: 1450 },
    ],
  },
  {
    name: 'Drinks',
    items: [
      { id: '00000000-0000-0000-0000-000000000307', name: 'House Wine', price_cents: 950 },
      { id: '00000000-0000-0000-0000-000000000308', name: 'Craft Beer', price_cents: 750 },
      { id: '00000000-0000-0000-0000-000000000309', name: 'Fresh Lemonade', price_cents: 450 },
    ],
  },
]

beforeEach(() => {
  vi.mocked(fetchMenuCategories).mockResolvedValue(MOCK_CATEGORIES)
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-anon-key'
})

describe('MenuPage', () => {
  it('renders the Menu heading', async (): Promise<void> => {
    const params = Promise.resolve({ id: '5', order_id: 'order-abc-123' })
    render(await MenuPage({ params }))

    expect(screen.getByRole('heading', { name: 'Menu' })).toBeInTheDocument()
  })

  it('renders a back link to the order page', async (): Promise<void> => {
    const params = Promise.resolve({ id: '5', order_id: 'order-abc-123' })
    render(await MenuPage({ params }))

    const link = screen.getByRole('link', { name: /back to order/i })
    expect(link).toHaveAttribute('href', '/tables/5/order/order-abc-123')
  })

  it('back link has minimum 48px touch target', async (): Promise<void> => {
    const params = Promise.resolve({ id: '1', order_id: 'order-xyz' })
    render(await MenuPage({ params }))

    const link = screen.getByRole('link', { name: /back to order/i })
    expect(link.className).toContain('min-h-[48px]')
  })

  it('renders the Starters category heading', async (): Promise<void> => {
    const params = Promise.resolve({ id: '1', order_id: 'order-xyz' })
    render(await MenuPage({ params }))

    expect(screen.getByRole('heading', { name: 'Starters' })).toBeInTheDocument()
  })

  it('renders the Mains category heading', async (): Promise<void> => {
    const params = Promise.resolve({ id: '1', order_id: 'order-xyz' })
    render(await MenuPage({ params }))

    expect(screen.getByRole('heading', { name: 'Mains' })).toBeInTheDocument()
  })

  it('renders the Drinks category heading', async (): Promise<void> => {
    const params = Promise.resolve({ id: '1', order_id: 'order-xyz' })
    render(await MenuPage({ params }))

    expect(screen.getByRole('heading', { name: 'Drinks' })).toBeInTheDocument()
  })

  it('renders all 9 menu item names', async (): Promise<void> => {
    const params = Promise.resolve({ id: '1', order_id: 'order-xyz' })
    render(await MenuPage({ params }))

    expect(screen.getByText('Bruschetta')).toBeInTheDocument()
    expect(screen.getByText('Caesar Salad')).toBeInTheDocument()
    expect(screen.getByText('Soup of the Day')).toBeInTheDocument()
    expect(screen.getByText('Grilled Salmon')).toBeInTheDocument()
    expect(screen.getByText('Ribeye Steak')).toBeInTheDocument()
    expect(screen.getByText('Mushroom Risotto')).toBeInTheDocument()
    expect(screen.getByText('House Wine')).toBeInTheDocument()
    expect(screen.getByText('Craft Beer')).toBeInTheDocument()
    expect(screen.getByText('Fresh Lemonade')).toBeInTheDocument()
  })

  it('renders a View Order link to the order page', async (): Promise<void> => {
    const params = Promise.resolve({ id: '3', order_id: 'order-def-456' })
    render(await MenuPage({ params }))

    const link = screen.getByRole('link', { name: 'View Order' })
    expect(link).toHaveAttribute('href', '/tables/3/order/order-def-456')
  })

  it('View Order link has minimum 48px touch target', async (): Promise<void> => {
    const params = Promise.resolve({ id: '1', order_id: 'order-xyz' })
    render(await MenuPage({ params }))

    const link = screen.getByRole('link', { name: 'View Order' })
    expect(link.className).toContain('min-h-[48px]')
  })

  it('renders the initial order total as $0.00', async (): Promise<void> => {
    const params = Promise.resolve({ id: '1', order_id: 'order-xyz' })
    render(await MenuPage({ params }))

    expect(screen.getByText('$0.00')).toBeInTheDocument()
  })

  it('passes server-fetched categories so menu renders without loading state', async (): Promise<void> => {
    const params = Promise.resolve({ id: '1', order_id: 'order-xyz' })
    render(await MenuPage({ params }))

    expect(screen.queryByText('Loading menu…')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Starters' })).toBeInTheDocument()
  })

  it('falls back gracefully when server fetch fails', async (): Promise<void> => {
    vi.mocked(fetchMenuCategories).mockRejectedValue(new Error('network error'))
    const params = Promise.resolve({ id: '1', order_id: 'order-xyz' })
    render(await MenuPage({ params }))

    // Server fetch failed so initialCategories is null; client retries and shows loading
    expect(screen.getByText('Loading menu…')).toBeInTheDocument()
  })
})
