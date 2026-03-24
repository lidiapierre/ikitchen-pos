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
