import { describe, it, expect } from 'vitest'
import { buildKotEscPos } from './escpos'

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
    expect(text).toContain('T5')
    expect(text).toContain('abc12345')
    expect(text).toContain('2026-01-01 12:00')
  })

  it('handles empty items array without throwing', () => {
    expect(() => buildKotEscPos([])).not.toThrow()
  })

  it('returns a Uint8Array', () => {
    const result = buildKotEscPos(sampleItems)
    expect(result).toBeInstanceOf(Uint8Array)
  })
})
