/**
 * Shared date formatting utilities for iKitchen POS.
 * All user-visible dates are formatted as DD-MM-YYYY throughout the app.
 */

/**
 * Format an ISO date/datetime string as DD-MM-YYYY.
 * Returns '—' for null/undefined/empty.
 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yyyy = d.getFullYear()
    return `${dd}-${mm}-${yyyy}`
  } catch {
    return iso
  }
}

/**
 * Format an ISO datetime string as DD-MM-YYYY HH:mm.
 */
export function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso)
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yyyy = d.getFullYear()
    const hh = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    return `${dd}-${mm}-${yyyy} ${hh}:${min}`
  } catch {
    return iso
  }
}

/**
 * Format an ISO datetime string as HH:mm (time only).
 */
export function formatTimeOnly(iso: string): string {
  try {
    const d = new Date(iso)
    const hh = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    return `${hh}:${min}`
  } catch {
    return iso
  }
}

/**
 * Format an ISO datetime string as "DD MMM HH:mm" (e.g. "06 Apr 14:30").
 * Used for compact datetime display (reservations list, etc.).
 */
export function formatDateTimeShort(iso: string): string {
  try {
    const d = new Date(iso)
    const dd = String(d.getDate()).padStart(2, '0')
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const mon = months[d.getMonth()]
    const hh = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    return `${dd} ${mon} ${hh}:${min}`
  } catch {
    return iso
  }
}

/**
 * Format an ISO datetime string as "DD MMM" (e.g. "06 Apr").
 * Used for day-only compact display without year.
 */
export function formatDateShort(iso: string): string {
  try {
    const d = new Date(iso)
    const dd = String(d.getDate()).padStart(2, '0')
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const mon = months[d.getMonth()]
    return `${dd} ${mon}`
  } catch {
    return iso
  }
}

/**
 * Convert an ISO date string (YYYY-MM-DD) to DD-MM-YYYY.
 * Safe for strings that are already in YYYY-MM-DD format (e.g. from DB date columns).
 */
export function isoDateToDDMMYYYY(isoDate: string): string {
  if (!isoDate) return '—'
  // Handle YYYY-MM-DD format directly (no timezone conversion)
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate)
  if (match) {
    return `${match[3]}-${match[2]}-${match[1]}`
  }
  return formatDate(isoDate)
}
