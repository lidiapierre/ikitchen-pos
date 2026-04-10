/**
 * Print orchestration for KOTs and bills.
 *
 * Supports two modes:
 *   - 'browser' (default): opens the browser print dialog (window.print)
 *   - 'network': sends ESC/POS bytes to the local print bridge at localhost:9191
 *
 * Multi-printer routing (issue #187):
 *   Use `PrinterProfile` for named printer profiles (kitchen / cashier / bar).
 *   Pass the matching profile to printKot/printBill; the function will route
 *   to the correct IP/port and fall back to browser print on failure.
 */

import { buildKotEscPos, buildBillEscPos } from './escpos'
import type { BillItem, BillEscPosOptions } from './escpos'

export const PRINT_BRIDGE_URL = 'http://localhost:9191/print'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Legacy single-printer config (kept for backward compatibility). */
export interface PrinterConfig {
  mode: 'browser' | 'network'
  ip?: string | null
  port?: number | null
}

/** A named printer profile from the `printers` table. */
export interface PrinterProfile {
  id: string
  name: string
  ip_address: string
  port: number
  type: 'kitchen' | 'cashier' | 'bar'
  enabled: boolean
}

export interface KotItem {
  name: string
  qty: number
}

export interface KotPrintOptions {
  items: KotItem[]
  tableId?: string
  orderId?: string
  /** Sequential human-readable order number — forwarded to ESC/POS as e.g. "KOT #007" (issue #396). */
  orderNumber?: number | null
  timestamp?: string
  /**
   * Multi-printer: a specific printer profile to use (from the `printers` table).
   * Takes precedence over `printerConfig`.
   */
  printerProfile?: PrinterProfile | null
  /** Legacy single-printer config. Used when `printerProfile` is not provided. */
  printerConfig?: PrinterConfig | null
  /** Called before window.print() to ensure the print view is rendered. */
  onBeforeBrowserPrint?: () => void | Promise<void>
  /** Called after the browser print dialog closes. */
  onAfterBrowserPrint?: () => void | Promise<void>
}

export interface BillPrintOptions {
  items: BillItem[]
  tableId?: string
  orderId?: string
  timestamp?: string
  billOpts: Omit<BillEscPosOptions, 'tableId' | 'orderId' | 'timestamp'>
  /**
   * Multi-printer: cashier printer profile (from the `printers` table).
   */
  printerProfile?: PrinterProfile | null
  /** Legacy single-printer config. Used when `printerProfile` is not provided. */
  printerConfig?: PrinterConfig | null
  /** Called before window.print() to ensure the bill view is rendered. */
  onBeforeBrowserPrint?: () => void | Promise<void>
  /** Called after the browser print dialog closes. */
  onAfterBrowserPrint?: () => void | Promise<void>
}

export interface PrintResult {
  method: 'browser' | 'network'
  success: boolean
  /** Present on network mode failure — show this to the user. */
  errorMessage?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Send raw ESC/POS bytes to the local print bridge.
 */
async function sendToBridge(ip: string, port: number, escposBytes: Uint8Array): Promise<void> {
  const base64 = btoa(String.fromCharCode(...escposBytes))

  const response = await fetch(PRINT_BRIDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ip, port, data: base64 }),
  })

  if (!response.ok) {
    let errorDetail = `HTTP ${response.status}`
    try {
      const body = await response.json() as { error?: string }
      if (body?.error) errorDetail = body.error
    } catch {
      // ignore parse error
    }
    throw new Error(errorDetail)
  }
}

function buildBridgeErrorMessage(detail: string): string {
  return (
    `Network printer not reachable (${detail}). ` +
    'Make sure the print bridge is running:\n\n' +
    '  node scripts/print-bridge.js\n\n' +
    'The bridge must be running on the same computer as the browser.'
  )
}

/** Resolve the IP/port to use from either a profile or legacy config. */
function resolveNetworkTarget(
  printerProfile?: PrinterProfile | null,
  printerConfig?: PrinterConfig | null,
): { ip: string; port: number } | null {
  if (printerProfile?.enabled && printerProfile.ip_address) {
    return { ip: printerProfile.ip_address, port: printerProfile.port ?? 9100 }
  }
  if (printerConfig?.mode === 'network' && printerConfig.ip) {
    return { ip: printerConfig.ip, port: printerConfig.port ?? 9100 }
  }
  return null
}

// ---------------------------------------------------------------------------
// KOT printing
// ---------------------------------------------------------------------------

/**
 * Print a KOT using the configured printer mode.
 *
 * On network mode failure, falls back to browser print and returns a result
 * with `method: 'browser'`. Network errors are reported via `errorMessage`
 * so the caller can show a toast/dialog without crashing.
 */
export async function printKot(options: KotPrintOptions): Promise<PrintResult> {
  const {
    items,
    tableId,
    orderId,
    orderNumber,
    timestamp,
    printerProfile,
    printerConfig,
    onBeforeBrowserPrint,
    onAfterBrowserPrint,
  } = options

  const networkTarget = resolveNetworkTarget(printerProfile, printerConfig)

  if (networkTarget) {
    try {
      const escposBytes = buildKotEscPos(items, { tableId, orderId, orderNumber, timestamp })
      await sendToBridge(networkTarget.ip, networkTarget.port, escposBytes)
      return { method: 'network', success: true }
    } catch (err) {
      const detail = err instanceof TypeError && err.message.includes('fetch')
        ? 'Bridge not running'
        : (err instanceof Error ? err.message : String(err))

      // Fall through to browser print
      const errorMessage = buildBridgeErrorMessage(detail)
      await onBeforeBrowserPrint?.()
      await new Promise<void>((resolve) => {
        window.addEventListener('afterprint', () => resolve(), { once: true })
        window.print()
      })
      await onAfterBrowserPrint?.()
      return { method: 'browser', success: true, errorMessage }
    }
  }

  // Browser print fallback
  await onBeforeBrowserPrint?.()
  await new Promise<void>((resolve) => {
    window.addEventListener('afterprint', () => resolve(), { once: true })
    window.print()
  })
  await onAfterBrowserPrint?.()

  return { method: 'browser', success: true }
}

// ---------------------------------------------------------------------------
// Bill printing
// ---------------------------------------------------------------------------

/**
 * Print a bill/receipt via network printer or browser fallback.
 *
 * When a cashier printer profile is provided and reachable, sends ESC/POS
 * bytes directly to the printer. Falls back to `window.print()` on failure.
 */
export async function printBill(options: BillPrintOptions): Promise<PrintResult> {
  const {
    items,
    tableId,
    orderId,
    timestamp,
    billOpts,
    printerProfile,
    printerConfig,
    onBeforeBrowserPrint,
    onAfterBrowserPrint,
  } = options

  const networkTarget = resolveNetworkTarget(printerProfile, printerConfig)

  if (networkTarget) {
    try {
      const escposBytes = buildBillEscPos(items, {
        ...billOpts,
        tableId,
        orderId,
        timestamp,
      })
      await sendToBridge(networkTarget.ip, networkTarget.port, escposBytes)
      return { method: 'network', success: true }
    } catch (err) {
      const detail = err instanceof TypeError && err.message.includes('fetch')
        ? 'Bridge not running'
        : (err instanceof Error ? err.message : String(err))

      // Fall through to browser print
      const errorMessage = buildBridgeErrorMessage(detail)
      await onBeforeBrowserPrint?.()
      await new Promise<void>((resolve) => {
        window.addEventListener('afterprint', () => resolve(), { once: true })
        window.print()
      })
      await onAfterBrowserPrint?.()
      return { method: 'browser', success: true, errorMessage }
    }
  }

  // Browser print fallback
  await onBeforeBrowserPrint?.()
  await new Promise<void>((resolve) => {
    window.addEventListener('afterprint', () => resolve(), { once: true })
    window.print()
  })
  await onAfterBrowserPrint?.()

  return { method: 'browser', success: true }
}

// ---------------------------------------------------------------------------
// Utility: find best printer by type
// ---------------------------------------------------------------------------

/**
 * Given a list of printer profiles, return the first enabled one matching
 * the requested type. Returns null if none found.
 */
export function findPrinter(
  printers: PrinterProfile[],
  type: 'kitchen' | 'cashier' | 'bar',
): PrinterProfile | null {
  return printers.find((p) => p.enabled && p.type === type) ?? null
}
