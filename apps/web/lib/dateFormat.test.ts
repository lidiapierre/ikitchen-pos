import { describe, it, expect } from 'vitest'
import {
  formatDate,
  formatDateTime,
  formatTimeOnly,
  formatDateTimeShort,
  formatDateShort,
  isoDateToDDMMYYYY,
} from './dateFormat'

// Use a fixed UTC ISO string: 2026-04-06T14:30:00Z
// Local interpretation depends on environment TZ, so we test the regex-safe path
// separately from timezone-dependent paths.

describe('formatDate', () => {
  it('returns — for null', () => {
    expect(formatDate(null)).toBe('—')
  })
  it('returns — for undefined', () => {
    expect(formatDate(undefined)).toBe('—')
  })
  it('returns — for empty string', () => {
    expect(formatDate('')).toBe('—')
  })
  it('formats a full ISO datetime string to DD-MM-YYYY', () => {
    // Use UTC+0 aligned time so getDate() matches expected day regardless of local TZ
    const result = formatDate('2026-04-06T00:30:00+00:00')
    // Accept either 06-04-2026 (UTC or UTC+) or 05-04-2026 (UTC-)
    expect(result).toMatch(/^\d{2}-\d{2}-\d{4}$/)
  })
})

describe('formatDateTime', () => {
  it('returns — for null', () => {
    expect(formatDateTime(null)).toBe('—')
  })
  it('returns — for undefined', () => {
    expect(formatDateTime(undefined)).toBe('—')
  })
  it('returns — for empty string', () => {
    expect(formatDateTime('')).toBe('—')
  })
  it('formats a datetime string to DD-MM-YYYY HH:mm', () => {
    const result = formatDateTime('2026-04-06T14:30:00Z')
    expect(result).toMatch(/^\d{2}-\d{2}-\d{4} \d{2}:\d{2}$/)
  })
})

describe('formatTimeOnly', () => {
  it('returns — for null', () => {
    expect(formatTimeOnly(null)).toBe('—')
  })
  it('returns — for undefined', () => {
    expect(formatTimeOnly(undefined)).toBe('—')
  })
  it('returns — for empty string', () => {
    expect(formatTimeOnly('')).toBe('—')
  })
  it('formats a datetime to HH:mm', () => {
    const result = formatTimeOnly('2026-04-06T14:30:00Z')
    expect(result).toMatch(/^\d{2}:\d{2}$/)
  })
})

describe('formatDateTimeShort', () => {
  it('returns — for null', () => {
    expect(formatDateTimeShort(null)).toBe('—')
  })
  it('returns — for undefined', () => {
    expect(formatDateTimeShort(undefined)).toBe('—')
  })
  it('returns — for empty string', () => {
    expect(formatDateTimeShort('')).toBe('—')
  })
  it('formats a datetime to DD MMM HH:mm', () => {
    const result = formatDateTimeShort('2026-04-06T14:30:00Z')
    expect(result).toMatch(/^\d{2} [A-Z][a-z]{2} \d{2}:\d{2}$/)
  })
})

describe('formatDateShort', () => {
  it('returns — for null', () => {
    expect(formatDateShort(null)).toBe('—')
  })
  it('returns — for undefined', () => {
    expect(formatDateShort(undefined)).toBe('—')
  })
  it('returns — for empty string', () => {
    expect(formatDateShort('')).toBe('—')
  })
  it('formats a datetime to DD MMM', () => {
    const result = formatDateShort('2026-04-06T14:30:00Z')
    expect(result).toMatch(/^\d{2} [A-Z][a-z]{2}$/)
  })
})

describe('isoDateToDDMMYYYY', () => {
  it('returns — for null', () => {
    expect(isoDateToDDMMYYYY(null)).toBe('—')
  })
  it('returns — for undefined', () => {
    expect(isoDateToDDMMYYYY(undefined)).toBe('—')
  })
  it('returns — for empty string', () => {
    expect(isoDateToDDMMYYYY('')).toBe('—')
  })
  it('converts YYYY-MM-DD to DD-MM-YYYY without timezone shift', () => {
    expect(isoDateToDDMMYYYY('2026-04-06')).toBe('06-04-2026')
  })
  it('converts a different date correctly', () => {
    expect(isoDateToDDMMYYYY('2024-12-25')).toBe('25-12-2024')
  })
  it('converts YYYY-MM-DD prefix in a full ISO datetime string', () => {
    // Regex path matches YYYY-MM-DD prefix
    expect(isoDateToDDMMYYYY('2026-01-01T00:00:00Z')).toBe('01-01-2026')
  })
})
