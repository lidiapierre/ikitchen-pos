import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import KotPrintView from './KotPrintView'
import type { OrderItem } from '@/app/tables/[id]/order/[order_id]/orderData'

const mockItems: OrderItem[] = [
  {
    id: '1',
    name: 'Chicken Karahi',
    quantity: 2,
    price_cents: 1500,
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
    notes: null,
  },
]

describe('KotPrintView', () => {
  it('renders item names', () => {
    render(
      <KotPrintView
        tableLabel="Table 4"
        orderId="order-abc-12345678"
        items={mockItems}
        timestamp="06/04/2026, 12:00:00"
      />,
    )

    expect(screen.getByText(/Chicken Karahi/i)).toBeInTheDocument()
  })

  it('renders table label', () => {
    render(
      <KotPrintView
        tableLabel="T-5"
        orderId="order-abc-12345678"
        items={mockItems}
        timestamp="06/04/2026, 12:00:00"
      />,
    )

    expect(screen.getByText('Table: T-5')).toBeInTheDocument()
  })

  it('renders order number badge when orderNumber is provided (issue #349)', () => {
    render(
      <KotPrintView
        tableLabel="Table 4"
        orderId="order-abc-12345678"
        items={mockItems}
        timestamp="06/04/2026, 12:00:00"
        orderNumber={7}
      />,
    )

    // Zero-padded 3-digit badge
    expect(screen.getByText('#007')).toBeInTheDocument()
  })

  it('does not render order number badge when orderNumber is null', () => {
    render(
      <KotPrintView
        tableLabel="Table 4"
        orderId="order-abc-12345678"
        items={mockItems}
        timestamp="06/04/2026, 12:00:00"
        orderNumber={null}
      />,
    )

    expect(screen.queryByText(/^#\d+$/)).not.toBeInTheDocument()
  })

  it('does not render order number badge when orderNumber is not provided', () => {
    render(
      <KotPrintView
        tableLabel="Table 4"
        orderId="order-abc-12345678"
        items={mockItems}
        timestamp="06/04/2026, 12:00:00"
      />,
    )

    expect(screen.queryByText(/^#\d+$/)).not.toBeInTheDocument()
  })

  it('formats order number with leading zeros (e.g. #001 for 1)', () => {
    render(
      <KotPrintView
        tableLabel="Table 4"
        orderId="order-abc-12345678"
        items={mockItems}
        timestamp="06/04/2026, 12:00:00"
        orderNumber={1}
      />,
    )

    expect(screen.getByText('#001')).toBeInTheDocument()
  })

  it('formats large order numbers without truncation (e.g. #123)', () => {
    render(
      <KotPrintView
        tableLabel="Table 4"
        orderId="order-abc-12345678"
        items={mockItems}
        timestamp="06/04/2026, 12:00:00"
        orderNumber={123}
      />,
    )

    expect(screen.getByText('#123')).toBeInTheDocument()
  })
})
