/**
 * ESC/POS utility for 80mm thermal printers.
 * Generates a Kitchen Order Ticket (KOT) as raw ESC/POS bytes.
 */
import { PAYMENT_METHOD_LABELS } from '@/lib/paymentMethods'
import type { PaymentMethod } from '@/lib/paymentMethods'

// ESC/POS command constants
const ESC = 0x1b
const GS = 0x1d

// ESC @ — initialize printer
const CMD_INIT = [ESC, 0x40]

// ESC ! — character mode: double-height + double-width + bold
const CMD_LARGE_BOLD = [ESC, 0x21, 0x38]

// ESC ! — normal mode
const CMD_NORMAL = [ESC, 0x21, 0x00]

// ESC E 1 — emphasis (bold) on
const CMD_BOLD_ON = [ESC, 0x45, 0x01]

// ESC E 0 — emphasis off
const CMD_BOLD_OFF = [ESC, 0x45, 0x00]

// ESC a 1 — center alignment
const CMD_ALIGN_CENTER = [ESC, 0x61, 0x01]

// ESC a 0 — left alignment
const CMD_ALIGN_LEFT = [ESC, 0x61, 0x00]

// GS V A 0 — full cut (with 1 partial line left)
const CMD_CUT = [GS, 0x56, 0x41, 0x00]

// Line feed
const LF = 0x0a

function encodeText(text: string): number[] {
  // Simple ASCII encoding; non-ASCII chars are replaced with '?'
  const bytes: number[] = []
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    bytes.push(code < 128 ? code : 0x3f) // '?'
  }
  return bytes
}

function line(text: string): number[] {
  return [...encodeText(text), LF]
}

function divider(char = '-', width = 42): number[] {
  return line(char.repeat(width))
}

export interface BillItem {
  name: string
  qty: number
  /** Line total in cents (qty × price) */
  lineCents: number
  comp?: boolean
}

export interface BillEscPosOptions {
  tableId?: string
  orderId?: string
  timestamp?: string
  subtotalCents: number
  discountCents?: number
  discountLabel?: string
  serviceChargeCents?: number
  serviceChargePercent?: number
  vatCents?: number
  vatPercent?: number
  taxInclusive?: boolean
  totalCents: number
  paymentMethod: PaymentMethod
  amountTenderedCents?: number
  changeDueCents?: number
  orderComp?: boolean
  /**
   * Base font size in pt (8–16). Maps to ESC/POS GS ! character-size magnification.
   *   ≤12pt → 0x00 (normal, 1× height × 1× width)
   *   >12pt  → 0x10 (double height, normal width)
   * Double-width is not used — it halves the 42-char line width and breaks
   * rightAlign() / divider() output on 80mm paper.
   * Defaults to 12 (normal / no magnification).
   */
  fontSizePt?: number
}

/**
 * Right-align a value string within a fixed column width.
 */
function rightAlign(label: string, value: string, width = 42): string {
  const available = Math.max(1, width - value.length)
  return label.slice(0, available).padEnd(available) + value
}

function centsToCurrency(cents: number): string {
  return (cents / 100).toFixed(2)
}

/**
 * Map a font size in pt to a GS ! (character size) byte.
 *   ≤12pt → 0x00 normal (1× height × 1× width)
 *   >12pt  → 0x10 double height (2× height × 1× width)
 *
 * Double-width (0x11) is intentionally avoided: it halves the usable line width
 * from 42 to 21 characters, which would wrap rightAlign() and divider() output
 * on 80mm paper. Double-height alone produces a visibly larger, clearly readable
 * receipt without breaking the column layout.
 */
function fontSizeToGsMag(pt: number): number {
  return pt <= 12 ? 0x00 : 0x10
}

/**
 * Build ESC/POS bytes for a bill/receipt.
 */
export function buildBillEscPos(
  items: BillItem[],
  opts: BillEscPosOptions,
): Uint8Array {
  const bytes: number[] = []
  const {
    tableId,
    orderId,
    timestamp,
    subtotalCents,
    discountCents = 0,
    discountLabel,
    serviceChargeCents = 0,
    serviceChargePercent = 0,
    vatCents = 0,
    vatPercent = 0,
    taxInclusive = false,
    totalCents,
    paymentMethod,
    amountTenderedCents,
    changeDueCents,
    orderComp = false,
    fontSizePt = 12,
  } = opts

  // Init
  bytes.push(...CMD_INIT)

  // Apply configured font size magnification (GS ! n).
  // fontSizePt > 12 produces visibly larger output on the thermal printer.
  // No-op when sizeByte === 0x00 (normal / default).
  const sizeByte = fontSizeToGsMag(fontSizePt)
  if (sizeByte !== 0x00) {
    bytes.push(GS, 0x21, sizeByte)
  }

  // Header
  bytes.push(...CMD_ALIGN_CENTER)
  bytes.push(...CMD_BOLD_ON)
  bytes.push(...line('iKitchen'))
  bytes.push(...CMD_BOLD_OFF)
  bytes.push(...line('RECEIPT'))
  bytes.push(...CMD_ALIGN_LEFT)

  if (timestamp) bytes.push(...line(timestamp))
  bytes.push(...divider())

  if (tableId) bytes.push(...line(`Table : ${tableId}`))
  if (orderId) bytes.push(...line(`Order : ${orderId.slice(0, 8)}`))

  bytes.push(...divider())

  if (orderComp) {
    bytes.push(...CMD_ALIGN_CENTER)
    bytes.push(...CMD_BOLD_ON)
    bytes.push(...line('*** COMPLIMENTARY ***'))
    bytes.push(...CMD_BOLD_OFF)
    bytes.push(...CMD_ALIGN_LEFT)
  }

  // Items
  for (const item of items) {
    const label = `${item.qty}x ${item.name}`
    if (item.comp || orderComp) {
      bytes.push(...line(`${label.slice(0, 36).padEnd(36)} COMP`))
    } else {
      bytes.push(...line(rightAlign(label, centsToCurrency(item.lineCents))))
    }
  }

  bytes.push(...divider())

  if (!orderComp) {
    // Subtotal
    bytes.push(...line(rightAlign('Subtotal', centsToCurrency(subtotalCents))))

    // Discount
    if (discountCents > 0) {
      const dlabel = discountLabel ? `Discount (${discountLabel})` : 'Discount'
      bytes.push(...line(rightAlign(dlabel, `-${centsToCurrency(discountCents)}`)))
    }

    // Service charge
    if (serviceChargePercent > 0 && serviceChargeCents > 0) {
      bytes.push(...line(rightAlign(`Service (${serviceChargePercent}%)`, centsToCurrency(serviceChargeCents))))
    }

    // VAT
    if (vatPercent > 0 && vatCents > 0) {
      const vatLabel = `VAT ${vatPercent}%${taxInclusive ? ' (incl.)' : ''}`
      bytes.push(...line(rightAlign(vatLabel, centsToCurrency(vatCents))))
    }

    bytes.push(...divider('='))
    bytes.push(...CMD_BOLD_ON)
    bytes.push(...line(rightAlign('TOTAL', centsToCurrency(totalCents))))
    bytes.push(...CMD_BOLD_OFF)

    bytes.push(...divider())

    // Payment
    bytes.push(...line(rightAlign('Payment', PAYMENT_METHOD_LABELS[paymentMethod] ?? paymentMethod.toUpperCase())))
    if (paymentMethod === 'cash' && amountTenderedCents !== undefined) {
      bytes.push(...line(rightAlign('Tendered', centsToCurrency(amountTenderedCents))))
    }
    if (paymentMethod === 'cash' && changeDueCents !== undefined) {
      bytes.push(...line(rightAlign('Change', centsToCurrency(changeDueCents))))
    }
  } else {
    bytes.push(...CMD_ALIGN_CENTER)
    bytes.push(...CMD_BOLD_ON)
    bytes.push(...line('TOTAL: COMPLIMENTARY'))
    bytes.push(...CMD_BOLD_OFF)
    bytes.push(...CMD_ALIGN_LEFT)
  }

  bytes.push(...divider())
  bytes.push(...CMD_ALIGN_CENTER)
  bytes.push(...line('Thank you for dining with us!'))

  // Feed & cut
  bytes.push(LF, LF, LF)
  bytes.push(...CMD_CUT)

  return new Uint8Array(bytes)
}

/**
 * Build ESC/POS bytes for a KOT.
 *
 * @param items   Array of { name, qty } objects representing order items.
 * @param header  Optional header fields (tableId, orderId, orderNumber, timestamp).
 * @returns       Uint8Array of raw ESC/POS bytes ready to send to the printer.
 */
export function buildKotEscPos(
  items: Array<{ name: string; qty: number }>,
  header?: { tableId?: string; orderId?: string; orderNumber?: number | null; timestamp?: string },
): Uint8Array {
  const bytes: number[] = []

  // Init
  bytes.push(...CMD_INIT)

  // Header
  bytes.push(...CMD_ALIGN_CENTER)
  bytes.push(...CMD_LARGE_BOLD)
  bytes.push(...line('iKitchen'))
  bytes.push(...CMD_NORMAL)
  bytes.push(...line('KITCHEN ORDER TICKET'))
  bytes.push(...CMD_ALIGN_LEFT)
  bytes.push(...divider())

  // Table number — most prominent (issue #396)
  if (header?.tableId) {
    bytes.push(...CMD_ALIGN_CENTER)
    bytes.push(...line('TABLE'))        // label in normal text, matching browser KOT
    bytes.push(...CMD_LARGE_BOLD)
    bytes.push(...line(header.tableId))
    bytes.push(...CMD_NORMAL)
    bytes.push(...CMD_ALIGN_LEFT)
  }
  // KOT / order number — secondary (issue #396)
  // Prefer sequential orderNumber (matches browser KOT); fall back to UUID prefix
  if (header?.orderNumber != null) {
    bytes.push(...CMD_ALIGN_CENTER)
    bytes.push(...line(`KOT #${String(header.orderNumber).padStart(3, '0')}`))
    bytes.push(...CMD_ALIGN_LEFT)
  } else if (header?.orderId) {
    bytes.push(...CMD_ALIGN_CENTER)
    bytes.push(...line(`KOT: ${header.orderId.slice(0, 8)}`))
    bytes.push(...CMD_ALIGN_LEFT)
  }
  if (header?.timestamp) {
    bytes.push(...line(`Time  : ${header.timestamp}`))
  }

  bytes.push(...divider())

  // Items
  for (const item of items) {
    bytes.push(...CMD_BOLD_ON)
    bytes.push(...CMD_LARGE_BOLD)
    // Format: "  3x Chicken Burger"
    const label = `  ${item.qty}x ${item.name}`
    bytes.push(...line(label))
    bytes.push(...CMD_NORMAL)
    bytes.push(...CMD_BOLD_OFF)
  }

  bytes.push(...divider())
  bytes.push(...CMD_ALIGN_CENTER)
  bytes.push(...line(`${items.length} item${items.length !== 1 ? 's' : ''} to prepare`))

  // Feed & cut
  bytes.push(LF, LF, LF)
  bytes.push(...CMD_CUT)

  return new Uint8Array(bytes)
}
