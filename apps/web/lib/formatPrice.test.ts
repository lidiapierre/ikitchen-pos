import { describe, it, expect } from 'vitest'
import { formatPrice } from './formatPrice'

describe('formatPrice', () => {
  it('formats cents with the given symbol', () => {
    expect(formatPrice(165000, '৳')).toBe('৳ 1,650.00')
  })

  it('formats a small price with two decimal places', () => {
    expect(formatPrice(850, '৳')).toBe('৳ 8.50')
  })

  it('formats zero as 0.00', () => {
    expect(formatPrice(0, '৳')).toBe('৳ 0.00')
  })

  it('adds comma separators for large values', () => {
    expect(formatPrice(1000000, '$')).toBe('$ 10,000.00')
  })

  it('works with any currency symbol', () => {
    expect(formatPrice(500, '€')).toBe('€ 5.00')
    expect(formatPrice(500, '£')).toBe('£ 5.00')
  })

  it('formats whole taka amounts correctly', () => {
    expect(formatPrice(100, '৳')).toBe('৳ 1.00')
    expect(formatPrice(10000, '৳')).toBe('৳ 100.00')
  })
})

describe('formatPrice — roundToWhole (issue #371)', () => {
  it('rounds down when fraction < 0.5 (8593.20 → 8593)', () => {
    expect(formatPrice(859320, '৳', true)).toBe('৳ 8,593')
  })

  it('rounds up when fraction ≥ 0.5 (8593.60 → 8594)', () => {
    expect(formatPrice(859360, '৳', true)).toBe('৳ 8,594')
  })

  it('rounds exactly 0.5 up (100.50 → 101)', () => {
    expect(formatPrice(10050, '৳', true)).toBe('৳ 101')
  })

  it('shows no decimal places when roundToWhole is true', () => {
    expect(formatPrice(100, '৳', true)).toBe('৳ 1')
    expect(formatPrice(10000, '৳', true)).toBe('৳ 100')
  })

  it('formats zero as 0 (no decimals)', () => {
    expect(formatPrice(0, '৳', true)).toBe('৳ 0')
  })

  it('still adds comma separators for large rounded values', () => {
    expect(formatPrice(1000000, '$', true)).toBe('$ 10,000')
  })

  it('does not affect regular 2-decimal output when roundToWhole is false (default)', () => {
    expect(formatPrice(859320, '৳', false)).toBe('৳ 8,593.20')
    expect(formatPrice(859360, '৳', false)).toBe('৳ 8,593.60')
  })
})
