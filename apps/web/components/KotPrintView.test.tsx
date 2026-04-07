import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import KotPrintView, { formatKotTime } from './KotPrintView'
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

  // Scheduled time display (issue #352)
  it('shows PICKUP AT line for takeaway orders with scheduledTime', () => {
    render(
      <KotPrintView
        tableLabel="Takeaway"
        orderId="order-abc-12345678"
        items={mockItems}
        timestamp="06/04/2026, 12:00:00"
        orderType="takeaway"
        scheduledTime="2026-04-06T17:30:00.000Z"
      />,
    )

    expect(screen.getByText(/PICKUP AT/i)).toBeInTheDocument()
  })

  it('shows DELIVER BY line for delivery orders with scheduledTime', () => {
    render(
      <KotPrintView
        tableLabel="Delivery"
        orderId="order-abc-12345678"
        items={mockItems}
        timestamp="06/04/2026, 12:00:00"
        orderType="delivery"
        customerName="Ahmed Khan"
        scheduledTime="2026-04-06T17:30:00.000Z"
      />,
    )

    expect(screen.getByText(/DELIVER BY/i)).toBeInTheDocument()
  })

  // Customer mobile on KOT for delivery orders (issue #358)
  it('shows customer mobile number on KOT for delivery orders', () => {
    render(
      <KotPrintView
        tableLabel="Delivery"
        orderId="order-abc-12345678"
        items={mockItems}
        timestamp="06/04/2026, 12:00:00"
        orderType="delivery"
        customerName="Ahmed Khan"
        customerMobile="+880 1711 123456"
        deliveryNote="Road 12, House 5"
        scheduledTime="2026-04-06T17:30:00.000Z"
      />,
    )

    expect(screen.getByText('+880 1711 123456')).toBeInTheDocument()
  })

  it('does not show customer mobile on KOT when not provided', () => {
    render(
      <KotPrintView
        tableLabel="Delivery"
        orderId="order-abc-12345678"
        items={mockItems}
        timestamp="06/04/2026, 12:00:00"
        orderType="delivery"
        customerName="Ahmed Khan"
        scheduledTime="2026-04-06T17:30:00.000Z"
      />,
    )

    expect(screen.queryByText(/\+880/)).not.toBeInTheDocument()
  })

  it('does not show PICKUP AT or DELIVER BY when scheduledTime is null', () => {
    render(
      <KotPrintView
        tableLabel="Takeaway"
        orderId="order-abc-12345678"
        items={mockItems}
        timestamp="06/04/2026, 12:00:00"
        orderType="takeaway"
        scheduledTime={null}
      />,
    )

    expect(screen.queryByText(/PICKUP AT/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/DELIVER BY/i)).not.toBeInTheDocument()
  })
})

describe('formatKotTime', () => {
  it('formats a valid ISO string as "DD Mon HH:mm"', () => {
    // Use a fixed UTC timestamp: 2026-04-06T11:30:00Z
    // Result depends on local timezone, so just check the shape
    const result = formatKotTime('2026-04-06T11:30:00.000Z')
    expect(result).toMatch(/^\d{2} [A-Z][a-z]{2} \d{2}:\d{2}$/)
  })

  it('returns the original string when the input is not a valid date', () => {
    expect(formatKotTime('not-a-date')).toBe('not-a-date')
  })

  it('returns empty string for null', () => {
    expect(formatKotTime(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(formatKotTime(undefined)).toBe('')
  })

  it('returns empty string for empty string', () => {
    expect(formatKotTime('')).toBe('')
  })
})

describe('KotPrintView — new addition label (issue #374)', () => {
  it('does not show the NEW ADDITION banner by default', () => {
    render(
      <KotPrintView
        tableLabel="T-1"
        orderId="order-abc-12345678"
        items={mockItems}
        timestamp="07/04/2026, 12:00:00"
      />,
    )
    expect(screen.queryByText(/NEW ADDITION/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Running Table/i)).not.toBeInTheDocument()
  })

  it('shows the NEW ADDITION banner when isNewAddition=true', () => {
    render(
      <KotPrintView
        tableLabel="T-1"
        orderId="order-abc-12345678"
        items={mockItems}
        timestamp="07/04/2026, 12:00:00"
        isNewAddition={true}
      />,
    )
    expect(screen.getByText(/NEW ADDITION/i)).toBeInTheDocument()
    expect(screen.getByText(/Running Table/i)).toBeInTheDocument()
  })
})

describe('KotPrintView — grouped by course (issue #373)', () => {
  const mixedItems: Parameters<typeof KotPrintView>[0]['items'] = [
    {
      id: '1', name: 'Biryani', quantity: 1, price_cents: 1200, modifier_ids: [], modifier_names: [],
      sent_to_kitchen: false, comp: false, comp_reason: null, seat: null, course: 'main', course_status: 'waiting',
      menuId: null, printerType: 'kitchen', item_discount_type: null, item_discount_value: null, notes: null,
    },
    {
      id: '2', name: 'Mango Lassi', quantity: 2, price_cents: 400, modifier_ids: [], modifier_names: [],
      sent_to_kitchen: false, comp: false, comp_reason: null, seat: null, course: 'drinks', course_status: 'waiting',
      menuId: null, printerType: 'bar', item_discount_type: null, item_discount_value: null, notes: null,
    },
    {
      id: '3', name: 'Samosa', quantity: 3, price_cents: 200, modifier_ids: [], modifier_names: [],
      sent_to_kitchen: false, comp: false, comp_reason: null, seat: null, course: 'starter', course_status: 'waiting',
      menuId: null, printerType: 'kitchen', item_discount_type: null, item_discount_value: null, notes: null,
    },
  ]

  it('shows course section headers when items span multiple courses', () => {
    render(
      <KotPrintView
        tableLabel="T-3"
        orderId="order-abc-12345678"
        items={mixedItems}
        timestamp="07/04/2026, 12:00:00"
      />,
    )
    expect(screen.getByText(/── DRINKS ──/i)).toBeInTheDocument()
    expect(screen.getByText(/── STARTER ──/i)).toBeInTheDocument()
    expect(screen.getByText(/── MAIN ──/i)).toBeInTheDocument()
    // Items present
    expect(screen.getByText(/Mango Lassi/)).toBeInTheDocument()
    expect(screen.getByText(/Samosa/)).toBeInTheDocument()
    expect(screen.getByText(/Biryani/)).toBeInTheDocument()
  })

  it('does not show course headers when all items are the same course', () => {
    const singleCourseItems = mixedItems.filter((i) => i.course === 'main')
    render(
      <KotPrintView
        tableLabel="T-3"
        orderId="order-abc-12345678"
        items={singleCourseItems}
        timestamp="07/04/2026, 12:00:00"
      />,
    )
    expect(screen.queryByText(/── MAIN ──/i)).not.toBeInTheDocument()
    expect(screen.getByText(/Biryani/)).toBeInTheDocument()
  })

  it('groups drinks first, then starter, then main', () => {
    const { container } = render(
      <KotPrintView
        tableLabel="T-3"
        orderId="order-abc-12345678"
        items={mixedItems}
        timestamp="07/04/2026, 12:00:00"
      />,
    )
    const text = container.textContent ?? ''
    const drinksPos = text.indexOf('DRINKS')
    const starterPos = text.indexOf('STARTER')
    const mainPos = text.indexOf('MAIN')
    expect(drinksPos).toBeGreaterThan(-1)
    expect(starterPos).toBeGreaterThan(drinksPos)
    expect(mainPos).toBeGreaterThan(starterPos)
  })
})
