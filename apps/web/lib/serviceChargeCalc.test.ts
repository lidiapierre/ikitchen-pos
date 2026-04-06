import { describe, it, expect } from 'vitest'
import {
  shouldApplyServiceCharge,
  DEFAULT_SERVICE_CHARGE_APPLY_CONFIG,
  calcServiceCharge,
} from './serviceChargeCalc'
import type { ServiceChargeApplyConfig } from './serviceChargeCalc'

describe('shouldApplyServiceCharge', () => {
  const allTrue: ServiceChargeApplyConfig = {
    applyDineIn: true,
    applyTakeaway: true,
    applyDelivery: true,
  }
  const allFalse: ServiceChargeApplyConfig = {
    applyDineIn: false,
    applyTakeaway: false,
    applyDelivery: false,
  }

  describe('dine_in order type', () => {
    it('returns true when applyDineIn is true', () => {
      expect(shouldApplyServiceCharge('dine_in', { ...allFalse, applyDineIn: true })).toBe(true)
    })
    it('returns false when applyDineIn is false', () => {
      expect(shouldApplyServiceCharge('dine_in', { ...allTrue, applyDineIn: false })).toBe(false)
    })
  })

  describe('takeaway order type', () => {
    it('returns true when applyTakeaway is true', () => {
      expect(shouldApplyServiceCharge('takeaway', { ...allFalse, applyTakeaway: true })).toBe(true)
    })
    it('returns false when applyTakeaway is false', () => {
      expect(shouldApplyServiceCharge('takeaway', { ...allTrue, applyTakeaway: false })).toBe(false)
    })
  })

  describe('delivery order type', () => {
    it('returns true when applyDelivery is true', () => {
      expect(shouldApplyServiceCharge('delivery', { ...allFalse, applyDelivery: true })).toBe(true)
    })
    it('returns false when applyDelivery is false', () => {
      expect(shouldApplyServiceCharge('delivery', { ...allTrue, applyDelivery: false })).toBe(false)
    })
  })

  describe('DEFAULT_SERVICE_CHARGE_APPLY_CONFIG (issue #357)', () => {
    it('applies to dine-in by default', () => {
      expect(shouldApplyServiceCharge('dine_in', DEFAULT_SERVICE_CHARGE_APPLY_CONFIG)).toBe(true)
    })
    it('does not apply to takeaway by default', () => {
      expect(shouldApplyServiceCharge('takeaway', DEFAULT_SERVICE_CHARGE_APPLY_CONFIG)).toBe(false)
    })
    it('does not apply to delivery by default', () => {
      expect(shouldApplyServiceCharge('delivery', DEFAULT_SERVICE_CHARGE_APPLY_CONFIG)).toBe(false)
    })
  })

  describe('all-false config', () => {
    it('returns false for dine_in when all flags off', () => {
      expect(shouldApplyServiceCharge('dine_in', allFalse)).toBe(false)
    })
    it('returns false for takeaway when all flags off', () => {
      expect(shouldApplyServiceCharge('takeaway', allFalse)).toBe(false)
    })
    it('returns false for delivery when all flags off', () => {
      expect(shouldApplyServiceCharge('delivery', allFalse)).toBe(false)
    })
  })

  describe('all-true config', () => {
    it('returns true for dine_in when all flags on', () => {
      expect(shouldApplyServiceCharge('dine_in', allTrue)).toBe(true)
    })
    it('returns true for takeaway when all flags on', () => {
      expect(shouldApplyServiceCharge('takeaway', allTrue)).toBe(true)
    })
    it('returns true for delivery when all flags on', () => {
      expect(shouldApplyServiceCharge('delivery', allTrue)).toBe(true)
    })
  })
})

describe('calcServiceCharge', () => {
  it('returns 0 service charge when percent is 0', () => {
    const result = calcServiceCharge(10000, 0)
    expect(result.serviceChargeCents).toBe(0)
    expect(result.baseAmountCents).toBe(10000)
  })

  it('returns 0 service charge when base is 0', () => {
    const result = calcServiceCharge(0, 10)
    expect(result.serviceChargeCents).toBe(0)
  })

  it('calculates 10% service charge correctly', () => {
    const result = calcServiceCharge(10000, 10)
    expect(result.serviceChargeCents).toBe(1000)
  })

  it('rounds fractional cents correctly', () => {
    // 10001 * 10% = 1000.1 → rounds to 1000
    const result = calcServiceCharge(10001, 10)
    expect(result.serviceChargeCents).toBe(1000)
  })
})
