import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import BillPrintView from './BillPrintView'
import type { OrderItem } from '@/app/tables/[id]/order/[order_id]/orderData'

const mockItems: OrderItem[] = [
  {
    id: '1',
    name: 'Chicken Karahi',
    quantity: 2,
    price_cents: 1500,
    modifier_ids: [],
    modifier_names: [],
    sent_to_kitchen: true, comp: false, comp_reason: null, seat: null, course: 'main' as const, course_status: 'waiting' as const, menuId: null, printerType: 'kitchen' as const,
  },
  {
    id: '2',
    name: 'Naan',
    quantity: 4,
    price_cents: 200,
    modifier_ids: [],
    modifier_names: [],
    sent_to_kitchen: true, comp: false, comp_reason: null, seat: null, course: 'main' as const, course_status: 'waiting' as const, menuId: null, printerType: 'kitchen' as const,
  },
]

// subtotal = 2×1500 + 4×200 = 3000 + 800 = 3800 cents
// vat 15%  = 570 cents
// total    = 4370 cents
const SUBTOTAL = 3800
const VAT_PERCENT = 15
const TOTAL = SUBTOTAL + Math.round(SUBTOTAL * VAT_PERCENT / 100) // 4370

describe('BillPrintView', () => {
  it('renders the restaurant name', () => {
    render(
      <BillPrintView
        tableLabel="Table 3"
        orderId="order-abc-12345678"
        items={mockItems}
        subtotalCents={SUBTOTAL}
        vatPercent={VAT_PERCENT}
        totalCents={TOTAL}
        paymentMethod="card"
        timestamp="25/03/2026, 14:00:00"
      />,
    )

    expect(screen.getByText('Lahore by iKitchen')).toBeInTheDocument()
  })

  it('renders the table and short order ID', () => {
    render(
      <BillPrintView
        tableLabel="Table 3"
        orderId="order-abc-12345678"
        items={mockItems}
        subtotalCents={SUBTOTAL}
        vatPercent={VAT_PERCENT}
        totalCents={TOTAL}
        paymentMethod="card"
        timestamp="25/03/2026, 14:00:00"
      />,
    )

    expect(screen.getByText('Table: Table 3')).toBeInTheDocument()
    expect(screen.getByText('Order: order-ab')).toBeInTheDocument()
  })

  it('renders the timestamp', () => {
    render(
      <BillPrintView
        tableLabel="Table 3"
        orderId="order-abc-12345678"
        items={mockItems}
        subtotalCents={SUBTOTAL}
        vatPercent={VAT_PERCENT}
        totalCents={TOTAL}
        paymentMethod="card"
        timestamp="25/03/2026, 14:00:00"
      />,
    )

    expect(screen.getByText('25/03/2026, 14:00:00')).toBeInTheDocument()
  })

  it('renders item names with quantity and line total', () => {
    render(
      <BillPrintView
        tableLabel="Table 3"
        orderId="order-abc-12345678"
        items={mockItems}
        subtotalCents={SUBTOTAL}
        vatPercent={VAT_PERCENT}
        totalCents={TOTAL}
        paymentMethod="card"
        timestamp="25/03/2026, 14:00:00"
      />,
    )

    // Chicken Karahi: 2 × ৳15.00 = ৳30.00
    expect(screen.getByText(/2× Chicken Karahi/)).toBeInTheDocument()
    expect(screen.getByText('৳ 30.00')).toBeInTheDocument()

    // Naan: 4 × ৳2.00 = ৳8.00
    expect(screen.getByText(/4× Naan/)).toBeInTheDocument()
    expect(screen.getByText('৳ 8.00')).toBeInTheDocument()
  })

  it('renders the subtotal', () => {
    render(
      <BillPrintView
        tableLabel="Table 3"
        orderId="order-abc-12345678"
        items={mockItems}
        subtotalCents={SUBTOTAL}
        vatPercent={VAT_PERCENT}
        totalCents={TOTAL}
        paymentMethod="card"
        timestamp="25/03/2026, 14:00:00"
      />,
    )

    // ৳ 38.00
    expect(screen.getByText('Subtotal')).toBeInTheDocument()
    expect(screen.getByText('৳ 38.00')).toBeInTheDocument()
  })

  it('renders the VAT line with percent label and amount', () => {
    render(
      <BillPrintView
        tableLabel="Table 3"
        orderId="order-abc-12345678"
        items={mockItems}
        subtotalCents={SUBTOTAL}
        vatPercent={VAT_PERCENT}
        totalCents={TOTAL}
        paymentMethod="card"
        timestamp="25/03/2026, 14:00:00"
      />,
    )

    // VAT 15%: 570 cents = ৳ 5.70
    expect(screen.getByText('VAT 15%')).toBeInTheDocument()
    expect(screen.getByText('৳ 5.70')).toBeInTheDocument()
  })

  it('renders the total', () => {
    render(
      <BillPrintView
        tableLabel="Table 3"
        orderId="order-abc-12345678"
        items={mockItems}
        subtotalCents={SUBTOTAL}
        vatPercent={VAT_PERCENT}
        totalCents={TOTAL}
        paymentMethod="card"
        timestamp="25/03/2026, 14:00:00"
      />,
    )

    // Total = 4370 cents = ৳ 43.70
    expect(screen.getByText('Total')).toBeInTheDocument()
    expect(screen.getByText('৳ 43.70')).toBeInTheDocument()
  })

  it('renders the payment method for card', () => {
    render(
      <BillPrintView
        tableLabel="Table 3"
        orderId="order-abc-12345678"
        items={mockItems}
        subtotalCents={SUBTOTAL}
        vatPercent={VAT_PERCENT}
        totalCents={TOTAL}
        paymentMethod="card"
        timestamp="25/03/2026, 14:00:00"
      />,
    )

    expect(screen.getByText('Payment')).toBeInTheDocument()
    expect(screen.getByText('card')).toBeInTheDocument()
  })

  it('renders payment method for cash', () => {
    render(
      <BillPrintView
        tableLabel="Table 3"
        orderId="order-abc-12345678"
        items={mockItems}
        subtotalCents={SUBTOTAL}
        vatPercent={VAT_PERCENT}
        totalCents={TOTAL}
        paymentMethod="cash"
        amountTenderedCents={5000}
        changeDueCents={630}
        timestamp="25/03/2026, 14:00:00"
      />,
    )

    expect(screen.getByText('cash')).toBeInTheDocument()
  })

  it('renders tendered amount and change due for cash payment', () => {
    render(
      <BillPrintView
        tableLabel="Table 3"
        orderId="order-abc-12345678"
        items={mockItems}
        subtotalCents={SUBTOTAL}
        vatPercent={VAT_PERCENT}
        totalCents={TOTAL}
        paymentMethod="cash"
        amountTenderedCents={5000}
        changeDueCents={630}
        timestamp="25/03/2026, 14:00:00"
      />,
    )

    // 5000 cents = ৳ 50.00
    expect(screen.getByText('Tendered')).toBeInTheDocument()
    expect(screen.getByText('৳ 50.00')).toBeInTheDocument()

    // 630 cents = ৳ 6.30
    expect(screen.getByText('Change due')).toBeInTheDocument()
    expect(screen.getByText('৳ 6.30')).toBeInTheDocument()
  })

  it('does not render tendered/change rows for card payment', () => {
    render(
      <BillPrintView
        tableLabel="Table 3"
        orderId="order-abc-12345678"
        items={mockItems}
        subtotalCents={SUBTOTAL}
        vatPercent={VAT_PERCENT}
        totalCents={TOTAL}
        paymentMethod="card"
        timestamp="25/03/2026, 14:00:00"
      />,
    )

    expect(screen.queryByText('Tendered')).not.toBeInTheDocument()
    expect(screen.queryByText('Change due')).not.toBeInTheDocument()
  })

  it('does not render tendered/change rows when not provided for cash payment', () => {
    render(
      <BillPrintView
        tableLabel="Table 3"
        orderId="order-abc-12345678"
        items={mockItems}
        subtotalCents={SUBTOTAL}
        vatPercent={VAT_PERCENT}
        totalCents={TOTAL}
        paymentMethod="cash"
        timestamp="25/03/2026, 14:00:00"
      />,
    )

    expect(screen.queryByText('Tendered')).not.toBeInTheDocument()
    expect(screen.queryByText('Change due')).not.toBeInTheDocument()
  })

  it('renders the thank-you footer', () => {
    render(
      <BillPrintView
        tableLabel="Table 3"
        orderId="order-abc-12345678"
        items={mockItems}
        subtotalCents={SUBTOTAL}
        vatPercent={VAT_PERCENT}
        totalCents={TOTAL}
        paymentMethod="card"
        timestamp="25/03/2026, 14:00:00"
      />,
    )

    expect(screen.getByText('Thank you for dining with us!')).toBeInTheDocument()
  })

  it('is hidden on screen via aria-hidden', () => {
    const { container } = render(
      <BillPrintView
        tableLabel="Table 3"
        orderId="order-abc-12345678"
        items={mockItems}
        subtotalCents={SUBTOTAL}
        vatPercent={VAT_PERCENT}
        totalCents={TOTAL}
        paymentMethod="card"
        timestamp="25/03/2026, 14:00:00"
      />,
    )

    const root = container.firstChild as HTMLElement
    expect(root.getAttribute('aria-hidden')).toBe('true')
    expect(root.className).toContain('hidden')
    expect(root.className).toContain('print:block')
  })

  it('renders an empty items list gracefully', () => {
    render(
      <BillPrintView
        tableLabel="Table 3"
        orderId="order-abc-12345678"
        items={[]}
        subtotalCents={0}
        vatPercent={VAT_PERCENT}
        totalCents={0}
        paymentMethod="card"
        timestamp="25/03/2026, 14:00:00"
      />,
    )

    expect(screen.getByText('Lahore by iKitchen')).toBeInTheDocument()
    // Subtotal and total should be ৳ 0.00
    expect(screen.getAllByText('৳ 0.00').length).toBeGreaterThanOrEqual(2)
  })
})
