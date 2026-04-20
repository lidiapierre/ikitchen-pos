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

  it('renders service charge line when serviceChargeCents > 0 even when serviceChargePercent is 0 (issue #432 — reprint scenario)', () => {
    // This was the reprint bug: serviceChargePercent was hardcoded to 0 in ReceiptsClient,
    // causing the condition `serviceChargePercent > 0 && serviceChargeCents > 0` to always fail.
    // Fix: only require serviceChargeCents > 0; show "Service Charge" without % when percent=0.
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
        serviceChargePercent={0}
        serviceChargeCents={380}
      />,
    )

    // Service charge line must appear even when serviceChargePercent=0
    expect(screen.getByText('Service Charge')).toBeInTheDocument()
    expect(screen.getByText('৳ 3.80')).toBeInTheDocument()
  })

  it('renders service charge line with percent label when serviceChargePercent > 0', () => {
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
        serviceChargeCents={380}
      />,
    )

    // Service charge shows with percent label
    expect(screen.getByText('Service Charge (10%)')).toBeInTheDocument()
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

  // --- issue #354: standardized KOT and bill layout ---

  it('renders BILL RECEIPT subtitle below restaurant name (issue #354)', () => {
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

    expect(screen.getByText('BILL RECEIPT')).toBeInTheDocument()
  })

  it('renders modifier names below item row (issue #354)', () => {
    const itemsWithModifiers: OrderItem[] = [
      {
        id: '1',
        name: 'Chicken Tikka',
        quantity: 1,
        price_cents: 1200,
        modifier_ids: ['m1'],
        modifier_names: ['Extra Spicy', 'No Onion'],
        sent_to_kitchen: true, comp: false, comp_reason: null, seat: null,
        course: 'main' as const, course_status: 'waiting' as const,
        menuId: null, printerType: 'kitchen' as const,
        item_discount_type: null, item_discount_value: null, notes: null,
      },
    ]

    render(
      <BillPrintView
        tableLabel="Table 3"
        orderId="order-abc-12345678"
        items={itemsWithModifiers}
        subtotalCents={1200}
        vatPercent={0}
        totalCents={1200}
        paymentMethod="card"
        timestamp="25/03/2026, 14:00:00"
      />,
    )

    expect(screen.getByText('+ Extra Spicy')).toBeInTheDocument()
    expect(screen.getByText('+ No Onion')).toBeInTheDocument()
  })

  it('renders item notes below item row (issue #354)', () => {
    const itemsWithNotes: OrderItem[] = [
      {
        id: '1',
        name: 'Karahi',
        quantity: 1,
        price_cents: 1500,
        modifier_ids: [],
        modifier_names: [],
        sent_to_kitchen: true, comp: false, comp_reason: null, seat: null,
        course: 'main' as const, course_status: 'waiting' as const,
        menuId: null, printerType: 'kitchen' as const,
        item_discount_type: null, item_discount_value: null,
        notes: 'Less oil please',
      },
    ]

    render(
      <BillPrintView
        tableLabel="Table 3"
        orderId="order-abc-12345678"
        items={itemsWithNotes}
        subtotalCents={1500}
        vatPercent={0}
        totalCents={1500}
        paymentMethod="card"
        timestamp="25/03/2026, 14:00:00"
      />,
    )

    expect(screen.getByText('↳ Less oil please')).toBeInTheDocument()
  })

  // Issue #370: pre-payment due bill
  describe('isDue prop', () => {
    it('shows "DUE BILL" header instead of "BILL RECEIPT" when isDue=true', () => {
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
          isDue
        />,
      )
      expect(screen.getByText('DUE BILL')).toBeInTheDocument()
      expect(screen.queryByText('BILL RECEIPT')).not.toBeInTheDocument()
    })

    it('shows AMOUNT DUE banner when isDue=true', () => {
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
          isDue
        />,
      )
      expect(screen.getByText(/AMOUNT DUE.*UNPAID/i)).toBeInTheDocument()
    })

    it('shows "Amount Due" instead of "Pay" when isDue=true', () => {
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
          isDue
        />,
      )
      expect(screen.getByText('Amount Due')).toBeInTheDocument()
      expect(screen.queryByText('Pay')).not.toBeInTheDocument()
    })

    it('hides "Tendered by" section when isDue=true', () => {
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
          isDue
        />,
      )
      expect(screen.queryByText('Tendered by')).not.toBeInTheDocument()
      expect(screen.queryByText('Cash Tendered')).not.toBeInTheDocument()
      expect(screen.queryByText('Change Due')).not.toBeInTheDocument()
    })

    it('shows "BILL RECEIPT" header when isDue=false (default)', () => {
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
      expect(screen.getByText('BILL RECEIPT')).toBeInTheDocument()
      expect(screen.queryByText('DUE BILL')).not.toBeInTheDocument()
    })
  })

  describe('payment breakdown (issue #391)', () => {
    it('shows method and amount for a single non-cash payment when splitPayments provided', () => {
      render(
        <BillPrintView
          tableLabel="Table 3"
          orderId="order-abc-12345678"
          items={mockItems}
          subtotalCents={SUBTOTAL}
          vatPercent={VAT_PERCENT}
          totalCents={TOTAL}
          paymentMethod="card"
          splitPayments={[{ method: 'card', amountCents: TOTAL }]}
          timestamp="25/03/2026, 14:00:00"
        />,
      )
      // Should show "Card / POS" label and the payment amount
      expect(screen.getByText('Card / POS')).toBeInTheDocument()
      // TOTAL = 4370 cents = ৳ 43.70 — appears in both "Pay" row and the breakdown row
      expect(screen.getAllByText('৳ 43.70').length).toBeGreaterThanOrEqual(2)
      // No "Tendered by" label — use the new per-method format
      expect(screen.queryByText('Tendered by')).not.toBeInTheDocument()
      // No "Total Paid" line for a single-method payment
      expect(screen.queryByText('Total Paid')).not.toBeInTheDocument()
    })

    it('shows method and amount for a single cash payment when splitPayments provided', () => {
      render(
        <BillPrintView
          tableLabel="Table 3"
          orderId="order-abc-12345678"
          items={mockItems}
          subtotalCents={SUBTOTAL}
          vatPercent={VAT_PERCENT}
          totalCents={TOTAL}
          paymentMethod="cash"
          splitPayments={[{ method: 'cash', amountCents: 5000 }]}
          amountTenderedCents={5000}
          changeDueCents={630}
          timestamp="25/03/2026, 14:00:00"
        />,
      )
      expect(screen.getByText('Cash')).toBeInTheDocument()
      // Change due shown when cash is in the mix
      expect(screen.getByText('Change Due')).toBeInTheDocument()
      expect(screen.getByText('৳ 6.30')).toBeInTheDocument()
    })

    it('shows per-method lines and Total Paid for split (multi-method) payments', () => {
      render(
        <BillPrintView
          tableLabel="Table 3"
          orderId="order-abc-12345678"
          items={mockItems}
          subtotalCents={SUBTOTAL}
          vatPercent={VAT_PERCENT}
          totalCents={TOTAL}
          paymentMethod="cash"
          splitPayments={[
            { method: 'cash', amountCents: 2000 },
            { method: 'card', amountCents: 2370 },
          ]}
          changeDueCents={0}
          timestamp="25/03/2026, 14:00:00"
        />,
      )
      // Both methods shown
      expect(screen.getByText('Cash')).toBeInTheDocument()
      expect(screen.getByText('Card / POS')).toBeInTheDocument()
      // Amounts: ৳ 20.00 and ৳ 23.70
      expect(screen.getByText('৳ 20.00')).toBeInTheDocument()
      expect(screen.getByText('৳ 23.70')).toBeInTheDocument()
      // Total Paid line: 2000 + 2370 = 4370 = ৳ 43.70
      expect(screen.getByText('Total Paid')).toBeInTheDocument()
    })

    it('shows Change Due for split payment when cash is in the mix and change > 0', () => {
      render(
        <BillPrintView
          tableLabel="Table 3"
          orderId="order-abc-12345678"
          items={mockItems}
          subtotalCents={SUBTOTAL}
          vatPercent={VAT_PERCENT}
          totalCents={TOTAL}
          paymentMethod="cash"
          splitPayments={[
            { method: 'cash', amountCents: 5000 },
            { method: 'card', amountCents: 2000 },
          ]}
          changeDueCents={2630}
          timestamp="25/03/2026, 14:00:00"
        />,
      )
      // Change Due shown
      expect(screen.getByText('Change Due')).toBeInTheDocument()
      expect(screen.getByText('৳ 26.30')).toBeInTheDocument()
    })

    it('does not show Change Due when changeDueCents is 0 for split payment with cash', () => {
      render(
        <BillPrintView
          tableLabel="Table 3"
          orderId="order-abc-12345678"
          items={mockItems}
          subtotalCents={SUBTOTAL}
          vatPercent={VAT_PERCENT}
          totalCents={TOTAL}
          paymentMethod="cash"
          splitPayments={[
            { method: 'cash', amountCents: 2185 },
            { method: 'card', amountCents: 2185 },
          ]}
          changeDueCents={0}
          timestamp="25/03/2026, 14:00:00"
        />,
      )
      expect(screen.queryByText('Change Due')).not.toBeInTheDocument()
    })

    it('shows mobile payment method with amount when splitPayments provided', () => {
      render(
        <BillPrintView
          tableLabel="Table 3"
          orderId="order-abc-12345678"
          items={mockItems}
          subtotalCents={SUBTOTAL}
          vatPercent={VAT_PERCENT}
          totalCents={TOTAL}
          paymentMethod="mobile"
          splitPayments={[{ method: 'mobile', amountCents: TOTAL }]}
          timestamp="25/03/2026, 14:00:00"
        />,
      )
      expect(screen.getByText('Mobile')).toBeInTheDocument()
      expect(screen.queryByText('Tendered by')).not.toBeInTheDocument()
    })
  })

  describe('fontSizePt prop', () => {
    function renderBill(fontSizePt?: number) {
      const { container } = render(
        <BillPrintView
          tableLabel="Table 1"
          orderId="order-font-test"
          items={mockItems}
          subtotalCents={SUBTOTAL}
          vatPercent={0}
          totalCents={SUBTOTAL}
          paymentMethod="cash"
          timestamp="20/04/2026, 12:00:00"
          restaurantName="Test Restaurant"
          fontSizePt={fontSizePt}
        />,
      )
      return container.querySelector('[style]') as HTMLElement
    }

    it('applies default 12pt CSS custom properties when fontSizePt is omitted', () => {
      const root = renderBill()
      const style = root.getAttribute('style') ?? ''
      expect(style).toContain('--bill-xs: 11pt')
      expect(style).toContain('--bill-sm: 12pt')
      expect(style).toContain('--bill-base: 14pt')
      expect(style).toContain('--bill-lg: 16pt')
    })

    it('applies explicit fontSizePt=14 correctly', () => {
      const root = renderBill(14)
      const style = root.getAttribute('style') ?? ''
      expect(style).toContain('--bill-xs: 13pt')
      expect(style).toContain('--bill-sm: 14pt')
      expect(style).toContain('--bill-base: 16pt')
      expect(style).toContain('--bill-lg: 18pt')
    })

    it('clamps --bill-xs to 6pt minimum when fontSizePt=8', () => {
      const root = renderBill(8)
      const style = root.getAttribute('style') ?? ''
      expect(style).toContain('--bill-xs: 7pt')
      expect(style).toContain('--bill-sm: 8pt')
    })

    it('does not apply inline style to child elements', () => {
      const root = renderBill(10)
      // Only the root div should have a style attribute
      const allStyled = root.querySelectorAll('[style]')
      expect(allStyled).toHaveLength(0)
    })
  })
})
