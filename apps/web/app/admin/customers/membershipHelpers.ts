/**
 * Membership tier helper functions for the customer loyalty programme (issue #356).
 *
 * Extracted to a standalone module so they can be imported by both
 * CustomersDashboard.tsx and the unit test file without duplication.
 *
 * Tier thresholds mirror the award_loyalty_points() PL/pgSQL RPC:
 *   regular → silver (≥100 pts) → gold (≥500 pts)
 */

export type MembershipStatus = 'regular' | 'silver' | 'gold'

/** Returns the Tailwind text-colour class for the given membership tier. */
export function membershipColor(status: MembershipStatus): string {
  if (status === 'gold') return 'text-yellow-400'
  if (status === 'silver') return 'text-zinc-300'
  return 'text-zinc-500'
}

/** Returns the Tailwind badge classes for the given membership tier. */
export function membershipBadge(status: MembershipStatus): string {
  if (status === 'gold') return 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40'
  if (status === 'silver') return 'bg-zinc-400/20 text-zinc-300 border border-zinc-400/40'
  return 'bg-zinc-700/60 text-zinc-400 border border-zinc-600/40'
}

/**
 * Derives the correct membership status from a raw loyalty-points balance.
 * Mirrors the tier-upgrade logic in the award_loyalty_points() RPC.
 */
export function tierForPoints(points: number): MembershipStatus {
  if (points >= 500) return 'gold'
  if (points >= 100) return 'silver'
  return 'regular'
}
