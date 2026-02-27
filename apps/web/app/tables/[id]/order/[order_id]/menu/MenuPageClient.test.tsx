import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { JSX, ReactNode } from 'react'
import MenuPageClient from './MenuPageClient'
import type { MenuItem } from './menuData'

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

    it('renders category headings', () => {
      render(<MenuPageClient tableId={TABLE_ID} orderId={ORDER_ID} />)
      expect(screen.getByRole('heading', { name: 'Starters' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Mains' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Drinks' })).toBeInTheDocument()
    })

    it('renders back and View Order links pointing to the order page', () => {
      render(<MenuPageClient tableId={TABLE_ID} orderId={ORDER_ID} />)
      const expectedHref = `/tables/${TABLE_ID}/order/${ORDER_ID}`
      const links = screen.getAllByRole('link')
      const hrefs = links.map((l) => l.getAttribute('href'))
      expect(hrefs.filter((h) => h === expectedHref)).toHaveLength(2)
    })
  })

  describe('handleItemAdded', () => {
    it('updates the order total when a single item is added', async () => {
      render(<MenuPageClient tableId={TABLE_ID} orderId={ORDER_ID} />)

      // Bruschetta: price_cents = 850 → $8.50
      await userEvent.click(
        screen.getByTestId('add-00000000-0000-0000-0000-000000000301'),
      )

      expect(screen.getByText('$8.50')).toBeInTheDocument()
    })

    it('accumulates total correctly when multiple items are added', async () => {
      render(<MenuPageClient tableId={TABLE_ID} orderId={ORDER_ID} />)

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
