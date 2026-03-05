import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { JSX, ReactNode } from 'react'
import MenuPageClient from './MenuPageClient'
import type { MenuItem, MenuCategory } from './menuData'
import { fetchMenuCategories } from './menuData'

vi.mock('./menuData', () => ({
  fetchMenuCategories: vi.fn(),
}))

vi.mock('./MenuItemCard', () => ({
  default: ({
    item,
    onItemAdded,
  }: {
    item: MenuItem
    orderId: string
    onItemAdded: (priceCents: number) => void
  }): JSX.Element => (
    <button
      type="button"
      data-testid={`add-${item.id}`}
      onClick={() => onItemAdded(item.price_cents)}
    >
      Add {item.name}
    </button>
  ),
}))

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }): JSX.Element => (
    <a href={href}>{children as ReactNode}</a>
  ),
}))

const TABLE_ID = '5'
const ORDER_ID = 'order-abc-123'

const MOCK_CATEGORIES: MenuCategory[] = [
  {
    name: 'Starters',
    items: [
      { id: '00000000-0000-0000-0000-000000000301', name: 'Bruschetta', price_cents: 850 },
      { id: '00000000-0000-0000-0000-000000000302', name: 'Caesar Salad', price_cents: 1050 },
    ],
  },
  {
    name: 'Mains',
    items: [
      { id: '00000000-0000-0000-0000-000000000305', name: 'Ribeye Steak', price_cents: 2650 },
    ],
  },
  {
    name: 'Drinks',
    items: [
      { id: '00000000-0000-0000-0000-000000000308', name: 'Craft Beer', price_cents: 750 },
    ],
  },
]

const originalEnv = process.env

beforeEach(() => {
  process.env = {
    ...originalEnv,
    NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-key',
  }
  vi.mocked(fetchMenuCategories).mockResolvedValue(MOCK_CATEGORIES)
})

afterEach(() => {
  process.env = originalEnv
  vi.clearAllMocks()
})

describe('MenuPageClient', () => {
  describe('initial render', () => {
    it('renders with an order total of $0.00', () => {
      render(<MenuPageClient tableId={TABLE_ID} orderId={ORDER_ID} />)
      expect(screen.getByText('$0.00')).toBeInTheDocument()
    })

    it('renders the Menu heading', () => {
      render(<MenuPageClient tableId={TABLE_ID} orderId={ORDER_ID} />)
      expect(screen.getByRole('heading', { name: 'Menu' })).toBeInTheDocument()
    })

    it('renders back and View Order links pointing to the order page', () => {
      render(<MenuPageClient tableId={TABLE_ID} orderId={ORDER_ID} />)
      const expectedHref = `/tables/${TABLE_ID}/order/${ORDER_ID}`
      const links = screen.getAllByRole('link')
      const hrefs = links.map((l) => l.getAttribute('href'))
      expect(hrefs.filter((h) => h === expectedHref)).toHaveLength(2)
    })

    it('"Added this session" label uses at least base (16px) font size', () => {
      render(<MenuPageClient tableId={TABLE_ID} orderId={ORDER_ID} />)
      expect(screen.getByText('Added this session').className).toContain('text-base')
    })

    it('renders category headings after data loads', async () => {
      render(<MenuPageClient tableId={TABLE_ID} orderId={ORDER_ID} />)
      expect(await screen.findByRole('heading', { name: 'Starters' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Mains' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Drinks' })).toBeInTheDocument()
    })
  })

  describe('loading state', () => {
    it('shows "Loading menu…" while fetching', () => {
      vi.mocked(fetchMenuCategories).mockImplementation(() => new Promise(() => {}))
      render(<MenuPageClient tableId={TABLE_ID} orderId={ORDER_ID} />)
      expect(screen.getByText('Loading menu…')).toBeInTheDocument()
    })
  })

  describe('error state', () => {
    it('shows a generic error message when fetching fails', async () => {
      vi.mocked(fetchMenuCategories).mockRejectedValue(new Error('Failed to load menu'))
      render(<MenuPageClient tableId={TABLE_ID} orderId={ORDER_ID} />)
      expect(await screen.findByText('Unable to load menu. Please try again.')).toBeInTheDocument()
    })

    it('shows a generic error message when env vars are missing', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = ''
      render(<MenuPageClient tableId={TABLE_ID} orderId={ORDER_ID} />)
      expect(await screen.findByText('Unable to load menu. Please try again.')).toBeInTheDocument()
    })
  })

  describe('empty state', () => {
    it('shows "No menu items available" when no categories are returned', async () => {
      vi.mocked(fetchMenuCategories).mockResolvedValue([])
      render(<MenuPageClient tableId={TABLE_ID} orderId={ORDER_ID} />)
      expect(await screen.findByText('No menu items available')).toBeInTheDocument()
    })
  })

  describe('handleItemAdded', () => {
    it('updates the order total when a single item is added', async () => {
      render(<MenuPageClient tableId={TABLE_ID} orderId={ORDER_ID} />)
      await screen.findByRole('heading', { name: 'Starters' })

      // Bruschetta: price_cents = 850 → $8.50
      await userEvent.click(
        screen.getByTestId('add-00000000-0000-0000-0000-000000000301'),
      )

      expect(screen.getByText('$8.50')).toBeInTheDocument()
    })

    it('accumulates total correctly when multiple items are added', async () => {
      render(<MenuPageClient tableId={TABLE_ID} orderId={ORDER_ID} />)
      await screen.findByRole('heading', { name: 'Starters' })

      // Bruschetta $8.50 + Craft Beer $7.50 = $16.00
      await userEvent.click(
        screen.getByTestId('add-00000000-0000-0000-0000-000000000301'),
      )
      await userEvent.click(
        screen.getByTestId('add-00000000-0000-0000-0000-000000000308'),
      )

      expect(screen.getByText('$16.00')).toBeInTheDocument()
    })

    it('handles adding the same item twice', async () => {
      render(<MenuPageClient tableId={TABLE_ID} orderId={ORDER_ID} />)
      await screen.findByRole('heading', { name: 'Mains' })

      // Ribeye Steak $26.50 × 2 = $53.00
      await userEvent.click(
        screen.getByTestId('add-00000000-0000-0000-0000-000000000305'),
      )
      await userEvent.click(
        screen.getByTestId('add-00000000-0000-0000-0000-000000000305'),
      )

      expect(screen.getByText('$53.00')).toBeInTheDocument()
    })
  })
})
