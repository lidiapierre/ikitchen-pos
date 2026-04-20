import { describe, it, expect } from 'vitest'
import { buildKotEscPos, buildBillEscPos } from './escpos'
import type { BillItem } from './escpos'

describe('buildKotEscPos', () => {
  const sampleItems = [
    { name: 'Chicken Burger', qty: 2 },
    { name: 'Fries', qty: 1 },
  ]

  it('starts with ESC @ (init bytes 0x1B, 0x40)', () => {
    const result = buildKotEscPos(sampleItems)
    expect(result[0]).toBe(0x1b)
    expect(result[1]).toBe(0x40)
  })

  it('contains the item names as ASCII text', () => {
    const result = buildKotEscPos(sampleItems)
    const text = new TextDecoder('latin1').decode(result)
    expect(text).toContain('Chicken Burger')
    expect(text).toContain('Fries')
  })

  it('contains quantity values', () => {
    const result = buildKotEscPos(sampleItems)
    const text = new TextDecoder('latin1').decode(result)
    expect(text).toContain('2x')
    expect(text).toContain('1x')
  })

  it('ends with GS V cut command (0x1D, 0x56, 0x41, 0x00)', () => {
    const result = buildKotEscPos(sampleItems)
    const len = result.length
    // The cut command is the last 4 bytes
    expect(result[len - 4]).toBe(0x1d)
    expect(result[len - 3]).toBe(0x56)
    expect(result[len - 2]).toBe(0x41)
    expect(result[len - 1]).toBe(0x00)
  })

  it('includes header fields when provided', () => {
    const result = buildKotEscPos(sampleItems, {
      tableId: 'T5',
      orderId: 'abc12345-xxxx',
      timestamp: '2026-01-01 12:00',
    })
    const text = new TextDecoder('latin1').decode(result)
    // TABLE label present (issue #396)
    expect(text).toContain('TABLE')
    expect(text).toContain('T5')
    expect(text).toContain('abc12345')
    expect(text).toContain('2026-01-01 12:00')
  })

  it('shows sequential KOT number when orderNumber is provided, suppressing UUID fallback (issue #396)', () => {
    // Pass both orderNumber and orderId to confirm orderNumber takes precedence
    const result = buildKotEscPos(sampleItems, {
      tableId: 'T5',
      orderNumber: 7,
      orderId: 'abc12345-xxxx',
    })
    const text = new TextDecoder('latin1').decode(result)
    expect(text).toContain('KOT #007')
    // UUID prefix should not appear when orderNumber is available
    expect(text).not.toContain('KOT:')
  })

  it('falls back to orderId prefix when orderNumber is not provided', () => {
    const result = buildKotEscPos(sampleItems, {
      tableId: 'T5',
      orderId: 'abc12345-xxxx',
    })
    const text = new TextDecoder('latin1').decode(result)
    expect(text).toContain('KOT: abc12345')
  })

  it('handles empty items array without throwing', () => {
    expect(() => buildKotEscPos([])).not.toThrow()
  })

  it('returns a Uint8Array', () => {
    const result = buildKotEscPos(sampleItems)
    expect(result).toBeInstanceOf(Uint8Array)
  })
})

describe('buildBillEscPos', () => {
  const sampleItems: BillItem[] = [
    { name: 'Chicken Burger', qty: 2, lineCents: 1600 },
    { name: 'Fries', qty: 1, lineCents: 400, comp: false },
  ]
  const baseOpts = {
    subtotalCents: 2000,
    totalCents: 2100,
    vatCents: 100,
    vatPercent: 5,
    paymentMethod: 'cash' as const,
  }

  it('starts with ESC @ (init bytes 0x1B, 0x40)', () => {
    const result = buildBillEscPos(sampleItems, baseOpts)
    expect(result[0]).toBe(0x1b)
    expect(result[1]).toBe(0x40)
  })

  it('contains item names and totals in output', () => {
    const result = buildBillEscPos(sampleItems, baseOpts)
    const text = new TextDecoder('latin1').decode(result)
    expect(text).toContain('Chicken Burger')
    expect(text).toContain('Fries')
    expect(text).toContain('TOTAL')
  })

  it('ends with GS V cut command', () => {
    const result = buildBillEscPos(sampleItems, baseOpts)
    const len = result.length
    expect(result[len - 4]).toBe(0x1d)
    expect(result[len - 3]).toBe(0x56)
    expect(result[len - 2]).toBe(0x41)
    expect(result[len - 1]).toBe(0x00)
  })

  it('does NOT emit GS ! when fontSizePt <= 12 (normal size)', () => {
    // No GS ! (0x1D, 0x21) should appear after init for default/small font
    const result = buildBillEscPos(sampleItems, { ...baseOpts, fontSizePt: 12 })
    // Check bytes 2..end for GS ! 0x00 sequence — should be absent
    let found = false
    for (let i = 2; i < result.length - 2; i++) {
      if (result[i] === 0x1d && result[i + 1] === 0x21) { found = true; break }
    }
    expect(found).toBe(false)
  })

  it('emits GS ! 0x10 (double height) when fontSizePt is 13', () => {
    const result = buildBillEscPos(sampleItems, { ...baseOpts, fontSizePt: 13 })
    // GS ! must appear after CMD_INIT (bytes 0,1) with value 0x10
    expect(result[2]).toBe(0x1d)
    expect(result[3]).toBe(0x21)
    expect(result[4]).toBe(0x10)
  })

  it('emits GS ! 0x10 (double height) when fontSizePt is 14', () => {
    const result = buildBillEscPos(sampleItems, { ...baseOpts, fontSizePt: 14 })
    expect(result[2]).toBe(0x1d)
    expect(result[3]).toBe(0x21)
    expect(result[4]).toBe(0x10)
  })

  it('emits GS ! 0x11 (double size) when fontSizePt is 15', () => {
    const result = buildBillEscPos(sampleItems, { ...baseOpts, fontSizePt: 15 })
    expect(result[2]).toBe(0x1d)
    expect(result[3]).toBe(0x21)
    expect(result[4]).toBe(0x11)
  })

  it('emits GS ! 0x11 (double size) when fontSizePt is 16', () => {
    const result = buildBillEscPos(sampleItems, { ...baseOpts, fontSizePt: 16 })
    expect(result[2]).toBe(0x1d)
    expect(result[3]).toBe(0x21)
    expect(result[4]).toBe(0x11)
  })

  it('defaults to normal size (no GS !) when fontSizePt is omitted', () => {
    const result = buildBillEscPos(sampleItems, baseOpts)
    // No GS ! byte pair should appear immediately after init when fontSizePt defaults to 12
    let found = false
    for (let i = 2; i < result.length - 2; i++) {
      if (result[i] === 0x1d && result[i + 1] === 0x21) { found = true; break }
    }
    expect(found).toBe(false)
  })
})
