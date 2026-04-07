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
    sent_to_kitchen: true, comp: false, comp_reason: null, seat: null, course: 'main' as const, course_status: 'waiting' as const, menuId: null, printerType: 'kitchen' as const, item_discount_type: null, item_discount_value: null,
      notes: null,
  },
  {
    id: '2',
    name: 'Naan',
    quantity: 4,
    price_cents: 200,
    modifier_ids: [],
    modifier_names: [],
    sent_to_kitchen: true, comp: false, comp_reason: null, seat: null, course: 'main' as const, course_status: 'waiting' as const, menuId: null, printerType: 'kitchen' as const, item_discount_type: null, item_discount_value: null,
      notes: null,
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

  it('renders the table label and order number when provided', () => {
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
        orderNumber={7}
      />,
    )

    expect(screen.getByText('Table 3')).toBeInTheDocument()
    // Order number displayed as zero-padded 3-digit badge (issue #349)
    expect(screen.getByText('#007')).toBeInTheDocument()
    // UUID should NOT appear on printed bill (staff should not see internal IDs)
    expect(screen.queryByText('order-ab')).not.toBeInTheDocument()
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

    // New layout: item name, qty and amount are in separate spans
    expect(screen.getByText('Chicken Karahi')).toBeInTheDocument()
    // quantity column: "2"
    expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1)
    // Chicken Karahi: 2 × ৳15.00 = ৳30.00
    expect(screen.getByText('৳ 30.00')).toBeInTheDocument()

    expect(screen.getByText('Naan')).toBeInTheDocument()
    // Naan: 4 × ৳2.00 = ৳8.00
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
    expect(screen.getByText('Sub Total')).toBeInTheDocument()
    expect(screen.getByText('৳ 38.00')).toBeInTheDocument()
  })

  it('renders exactly one subtotal line — no duplicate subtotal entries (issue #369)', () => {
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
        serviceChargePercent={10}
        serviceChargeCents={Math.round(SUBTOTAL * 0.1)}
      />,
    )

    // Must appear exactly once — regression guard for issue #369
    const subtotalNodes = screen.getAllByText('Sub Total')
    expect(subtotalNodes).toHaveLength(1)
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

    // VAT 15%: shown as "VAT 15%"
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

    // New label is "Pay" for the total line
    expect(screen.getByText('Pay')).toBeInTheDocument()
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

    // "Tendered by" with the formatted label from PAYMENT_METHOD_LABELS
    expect(screen.getByText('Tendered by')).toBeInTheDocument()
    expect(screen.getByText('Card / POS')).toBeInTheDocument()
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

    expect(screen.getByText('Cash')).toBeInTheDocument()
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
    expect(screen.getByText('Cash Tendered')).toBeInTheDocument()
    expect(screen.getByText('৳ 50.00')).toBeInTheDocument()

    // 630 cents = ৳ 6.30
    expect(screen.getByText('Change Due')).toBeInTheDocument()
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

    expect(screen.queryByText('Cash Tendered')).not.toBeInTheDocument()
    expect(screen.queryByText('Change Due')).not.toBeInTheDocument()
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

    expect(screen.queryByText('Cash Tendered')).not.toBeInTheDocument()
    expect(screen.queryByText('Change Due')).not.toBeInTheDocument()
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

    expect(screen.getByText('Thank You!!!')).toBeInTheDocument()
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
    // Sub Total and Pay should be ৳ 0.00
    expect(screen.getAllByText('৳ 0.00').length).toBeGreaterThanOrEqual(2)
  })

  it('renders BIN number when provided', () => {
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
        binNumber="003206332-0101 -Musak6.3"
      />,
    )

    expect(screen.getByText(/003206332-0101/)).toBeInTheDocument()
  })

  it('renders bill number when provided', () => {
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
        billNumber="RN0001234"
      />,
    )

    expect(screen.getByText('RN0001234')).toBeInTheDocument()
  })

  it('renders register name when provided', () => {
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
        registerName="Cashier 1"
      />,
    )

    expect(screen.getByText('Cashier 1')).toBeInTheDocument()
  })
})
