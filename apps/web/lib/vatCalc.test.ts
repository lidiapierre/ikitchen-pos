import { describe, it, expect } from 'vitest'
import { calcVat, shouldApplyVat, DEFAULT_VAT_APPLY_CONFIG } from './vatCalc'
import type { VatApplyConfig } from './vatCalc'

describe('calcVat — exclusive mode (tax_inclusive = false)', () => {
  it('adds VAT on top of subtotal', () => {
    // ৳1,000 net + 15% = ৳150 VAT = ৳1,150 total
    const result = calcVat(100000, 15, false)
    expect(result.subtotalCents).toBe(100000)
    expect(result.vatCents).toBe(15000)
    expect(result.totalCents).toBe(115000)
    expect(result.vatPercent).toBe(15)
    expect(result.taxInclusive).toBe(false)
  })

  it('rounds VAT to nearest cent', () => {
    // ৳10.01 net + 15% = ৳1.5015 → rounds to ৳1.50 (150 cents)
    const result = calcVat(1001, 15, false)
    expect(result.vatCents).toBe(150)
    expect(result.totalCents).toBe(1151)
  })

  it('handles a typical restaurant order', () => {
    // 2 × ৳150 + 4 × ৳20 = ৳300 + ৳80 = ৳380 subtotal (3800 cents)
    // VAT 15% = 570 cents → total 4370 cents
    const result = calcVat(3800, 15, false)
    expect(result.subtotalCents).toBe(3800)
    expect(result.vatCents).toBe(570)
    expect(result.totalCents).toBe(4370)
  })
})

describe('calcVat — inclusive mode (tax_inclusive = true)', () => {
  it('extracts VAT from gross price', () => {
    // ৳1,150 gross includes 15% VAT
    // vat = 115000 × 15 / 115 = 15000 cents
    // net = 115000 − 15000 = 100000 cents
    const result = calcVat(115000, 15, true)
    expect(result.subtotalCents).toBe(100000)
    expect(result.vatCents).toBe(15000)
    expect(result.totalCents).toBe(115000)
    expect(result.taxInclusive).toBe(true)
  })

  it('total equals the raw input (price not changed)', () => {
    const gross = 46000
    const result = calcVat(gross, 10, true)
    expect(result.totalCents).toBe(gross)
  })

  it('extracted vat + net = gross', () => {
    const gross = 23800
    const result = calcVat(gross, 5, true)
    expect(result.subtotalCents + result.vatCents).toBe(gross)
  })
})

describe('shouldApplyVat (issue #382)', () => {
  const allTrue: VatApplyConfig = { applyDineIn: true, applyTakeaway: true, applyDelivery: true }
  const allFalse: VatApplyConfig = { applyDineIn: false, applyTakeaway: false, applyDelivery: false }

  describe('DEFAULT_VAT_APPLY_CONFIG', () => {
    it('applies VAT to dine-in by default', () => {
      expect(shouldApplyVat('dine_in', DEFAULT_VAT_APPLY_CONFIG)).toBe(true)
    })
    it('applies VAT to takeaway by default', () => {
      expect(shouldApplyVat('takeaway', DEFAULT_VAT_APPLY_CONFIG)).toBe(true)
    })
    it('does NOT apply VAT to delivery by default', () => {
      expect(shouldApplyVat('delivery', DEFAULT_VAT_APPLY_CONFIG)).toBe(false)
    })
  })

  describe('dine_in order type', () => {
    it('returns true when applyDineIn is true', () => {
      expect(shouldApplyVat('dine_in', { ...allFalse, applyDineIn: true })).toBe(true)
    })
    it('returns false when applyDineIn is false', () => {
      expect(shouldApplyVat('dine_in', { ...allTrue, applyDineIn: false })).toBe(false)
    })
  })

  describe('takeaway order type', () => {
    it('returns true when applyTakeaway is true', () => {
      expect(shouldApplyVat('takeaway', { ...allFalse, applyTakeaway: true })).toBe(true)
    })
    it('returns false when applyTakeaway is false', () => {
      expect(shouldApplyVat('takeaway', { ...allTrue, applyTakeaway: false })).toBe(false)
    })
  })

  describe('delivery order type', () => {
    it('returns true when applyDelivery is true', () => {
      expect(shouldApplyVat('delivery', { ...allFalse, applyDelivery: true })).toBe(true)
    })
    it('returns false when applyDelivery is false', () => {
      expect(shouldApplyVat('delivery', { ...allTrue, applyDelivery: false })).toBe(false)
    })
  })
})

describe('calcVat — zero VAT (0% rate)', () => {
  it('returns no VAT line and total equals subtotal (exclusive)', () => {
    const result = calcVat(50000, 0, false)
    expect(result.vatCents).toBe(0)
    expect(result.subtotalCents).toBe(50000)
    expect(result.totalCents).toBe(50000)
  })

  it('returns no VAT line and total equals gross (inclusive)', () => {
    const result = calcVat(50000, 0, true)
    expect(result.vatCents).toBe(0)
    expect(result.subtotalCents).toBe(50000)
    expect(result.totalCents).toBe(50000)
  })

  it('negative rate treated same as zero', () => {
    const result = calcVat(50000, -5, false)
    expect(result.vatCents).toBe(0)
    expect(result.totalCents).toBe(50000)
  })
})
