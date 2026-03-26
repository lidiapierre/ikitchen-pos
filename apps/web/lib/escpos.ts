/**
 * ESC/POS utility for 80mm thermal printers.
 * Generates a Kitchen Order Ticket (KOT) as raw ESC/POS bytes.
 */

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

/**
 * Build ESC/POS bytes for a KOT.
 *
 * @param items   Array of { name, qty } objects representing order items.
 * @param header  Optional header fields (tableId, orderId, timestamp).
 * @returns       Uint8Array of raw ESC/POS bytes ready to send to the printer.
 */
export function buildKotEscPos(
  items: Array<{ name: string; qty: number }>,
  header?: { tableId?: string; orderId?: string; timestamp?: string },
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

  if (header?.tableId) {
    bytes.push(...line(`Table : ${header.tableId}`))
  }
  if (header?.orderId) {
    bytes.push(...line(`Order : ${header.orderId.slice(0, 8)}`))
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
