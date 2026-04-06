/**
 * Unit tests for membership badge / colour helper functions (issue #356).
 *
 * Helpers are imported from membershipHelpers.ts so the tests always verify
 * the production code — no risk of divergence from copy-pasted duplicates.
 *
 * Thresholds: regular (0–99 pts) → silver (≥100 pts) → gold (≥500 pts)
 */

import { describe, it, expect } from 'vitest'
import { membershipColor, membershipBadge, tierForPoints } from './membershipHelpers'

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('membershipColor', () => {
  it('returns gold colour for gold status', () => {
    expect(membershipColor('gold')).toBe('text-yellow-400')
  })

  it('returns silver colour for silver status', () => {
    expect(membershipColor('silver')).toBe('text-zinc-300')
  })

  it('returns muted colour for regular status', () => {
    expect(membershipColor('regular')).toBe('text-zinc-500')
  })
})

describe('membershipBadge', () => {
  it('returns gold badge classes for gold status', () => {
    expect(membershipBadge('gold')).toContain('yellow')
  })

  it('returns silver badge classes for silver status', () => {
    expect(membershipBadge('silver')).toContain('zinc-400/20')
  })

  it('returns regular badge classes for regular status', () => {
    expect(membershipBadge('regular')).toContain('zinc-700/60')
  })
})

describe('tierForPoints (mirrors award_loyalty_points RPC thresholds)', () => {
  it('returns regular for 0 points', () => {
    expect(tierForPoints(0)).toBe('regular')
  })

  it('returns regular for 99 points (boundary below silver)', () => {
    expect(tierForPoints(99)).toBe('regular')
  })

  it('returns silver for exactly 100 points (lower boundary)', () => {
    expect(tierForPoints(100)).toBe('silver')
  })

  it('returns silver for 101 points', () => {
    expect(tierForPoints(101)).toBe('silver')
  })

  it('returns silver for 499 points (boundary below gold)', () => {
    expect(tierForPoints(499)).toBe('silver')
  })

  it('returns gold for exactly 500 points (lower boundary)', () => {
    expect(tierForPoints(500)).toBe('gold')
  })

  it('returns gold for 501 points', () => {
    expect(tierForPoints(501)).toBe('gold')
  })

  it('returns gold for very high point balance', () => {
    expect(tierForPoints(99999)).toBe('gold')
  })
})
