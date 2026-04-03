import { describe, it, expect } from 'vitest'
import { todayStartUtc } from './reservationsApi'

describe('todayStartUtc', () => {
  it('returns a valid ISO string ending in T00:00:00.000Z', () => {
    const result = todayStartUtc()
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/)
  })

  it('the date portion matches today in UTC', () => {
    const result = todayStartUtc()
    const now = new Date()
    const expectedDate = [
      now.getUTCFullYear(),
      String(now.getUTCMonth() + 1).padStart(2, '0'),
      String(now.getUTCDate()).padStart(2, '0'),
    ].join('-')
    expect(result.startsWith(expectedDate)).toBe(true)
  })

  it('time component is exactly midnight UTC', () => {
    const result = todayStartUtc()
    const parsed = new Date(result)
    expect(parsed.getUTCHours()).toBe(0)
    expect(parsed.getUTCMinutes()).toBe(0)
    expect(parsed.getUTCSeconds()).toBe(0)
    expect(parsed.getUTCMilliseconds()).toBe(0)
  })
})
