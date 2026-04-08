import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import SplitBillPrintView from './SplitBillPrintView'
import type { OrderItem } from '@/app/tables/[id]/order/[order_id]/orderData'

const mockItems: OrderItem[] = [
  {
    id: '1',
    name: 'Chicken Karahi',
    quantity: 1,
    price_cents: 1500,
    modifier_ids: [],
    modifier_names: [],
    sent_to_kitchen: true,
    comp: false,
    comp_reason: null,
    seat: 1,
    course: 'main' as const,
    course_status: 'waiting' as const,
    menuId: null,
    printerType: 'kitchen' as const,
    item_discount_type: null,
    item_discount_value: null,
    notes: null,
  },
]

describe('SplitBillPrintView', () => {
  it('renders restaurant name', () => {
    render(
      <SplitBillPrintView
        tableLabel="Table 3"
        orderId="order-abc-12345678"
        items={mockItems}
        covers={2}
        vatPercent={15}
        timestamp="06/04/2026, 12:00:00"
        evenSplit
      />,
    )

    expect(screen.getAllByText(/Lahore by iKitchen/).length).toBeGreaterThan(0)
  })

  it('renders order number as #007 when orderNumber=7 is provided (issue #349)', () => {
    render(
      <SplitBillPrintView
        tableLabel="Table 3"
        orderId="order-abc-12345678"
        items={mockItems}
        covers={2}
        vatPercent={15}
        timestamp="06/04/2026, 12:00:00"
        evenSplit
        orderNumber={7}
      />,
    )

    // Each cover section shows the order number
    const badges = screen.getAllByText('#007')
    expect(badges.length).toBeGreaterThan(0)
  })

  it('formats small order numbers with leading zeros (e.g. #001)', () => {
    render(
      <SplitBillPrintView
        tableLabel="Table 3"
        orderId="order-abc-12345678"
        items={mockItems}
        covers={1}
        vatPercent={15}
        timestamp="06/04/2026, 12:00:00"
        evenSplit
        orderNumber={1}
      />,
    )

    expect(screen.getAllByText('#001').length).toBeGreaterThan(0)
  })

  it('does not render order number when orderNumber is null', () => {
    render(
      <SplitBillPrintView
        tableLabel="Table 3"
        orderId="order-abc-12345678"
        items={mockItems}
        covers={2}
        vatPercent={15}
        timestamp="06/04/2026, 12:00:00"
        evenSplit
        orderNumber={null}
      />,
    )

    expect(screen.queryByText(/^#\d+$/)).not.toBeInTheDocument()
  })

  it('does not render order number when orderNumber is not provided', () => {
    render(
      <SplitBillPrintView
        tableLabel="Table 3"
        orderId="order-abc-12345678"
        items={mockItems}
        covers={2}
        vatPercent={15}
        timestamp="06/04/2026, 12:00:00"
        evenSplit
      />,
    )

    expect(screen.queryByText(/^#\d+$/)).not.toBeInTheDocument()
  })

  // --- issue #354: standardized layout ---

  it('renders BILL RECEIPT subtitle (issue #354)', () => {
    render(
      <SplitBillPrintView
        tableLabel="Table 3"
        orderId="order-abc-12345678"
        items={mockItems}
        covers={2}
        vatPercent={15}
        timestamp="06/04/2026, 12:00:00"
        evenSplit
      />,
    )

    expect(screen.getAllByText('BILL RECEIPT').length).toBeGreaterThan(0)
  })

  it('renders modifier names below item in by-seat split (issue #354)', () => {
    const itemWithModifiers: OrderItem[] = [
      {
        id: '1',
        name: 'Chicken Tikka',
        quantity: 1,
        price_cents: 1200,
        modifier_ids: ['m1'],
        modifier_names: ['Extra Spicy'],
        sent_to_kitchen: true,
        comp: false,
        comp_reason: null,
        seat: 1,
        course: 'main' as const,
        course_status: 'waiting' as const,
        menuId: null,
        printerType: 'kitchen' as const,
        item_discount_type: null,
        item_discount_value: null,
        notes: null,
      },
    ]

    render(
      <SplitBillPrintView
        tableLabel="Table 3"
        orderId="order-abc-12345678"
        items={itemWithModifiers}
        covers={1}
        vatPercent={15}
        timestamp="06/04/2026, 12:00:00"
      />,
    )

    expect(screen.getByText('+ Extra Spicy')).toBeInTheDocument()
  })

  it('renders item notes below item in by-seat split (issue #354)', () => {
    const itemWithNotes: OrderItem[] = [
      {
        id: '1',
        name: 'Karahi',
        quantity: 1,
        price_cents: 1500,
        modifier_ids: [],
        modifier_names: [],
        sent_to_kitchen: true,
        comp: false,
        comp_reason: null,
        seat: 1,
        course: 'main' as const,
        course_status: 'waiting' as const,
        menuId: null,
        printerType: 'kitchen' as const,
        item_discount_type: null,
        item_discount_value: null,
        notes: 'Half portion',
      },
    ]

    render(
      <SplitBillPrintView
        tableLabel="Table 3"
        orderId="order-abc-12345678"
        items={itemWithNotes}
        covers={1}
        vatPercent={15}
        timestamp="06/04/2026, 12:00:00"
      />,
    )

    expect(screen.getByText('↳ Half portion')).toBeInTheDocument()
  })
})
