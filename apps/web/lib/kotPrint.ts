/**
 * KOT print orchestration.
 *
 * Supports two modes:
 *   - 'browser' (default): opens the browser print dialog (window.print)
 *   - 'network': sends ESC/POS bytes to the local print bridge at localhost:9191
 */

import { buildKotEscPos } from './escpos'

export const PRINT_BRIDGE_URL = 'http://localhost:9191/print'

export interface PrinterConfig {
  mode: 'browser' | 'network'
  ip?: string | null
  port?: number | null
}

export interface KotItem {
  name: string
  qty: number
}

export interface KotPrintOptions {
  items: KotItem[]
  tableId?: string
  orderId?: string
  timestamp?: string
  /** Printer config loaded from DB. Falls back to browser mode if undefined. */
  printerConfig?: PrinterConfig | null
  /** Called before window.print() to ensure the print view is rendered. */
  onBeforeBrowserPrint?: () => void | Promise<void>
  /** Called after the browser print dialog closes. */
  onAfterBrowserPrint?: () => void | Promise<void>
}

export interface KotPrintResult {
  method: 'browser' | 'network'
  success: boolean
  /** Present on network mode failure — show this to the user. */
  errorMessage?: string
}

/**
 * Print a KOT using the configured printer mode.
 *
 * On network mode failure, returns an error result with a user-facing message
 * so the caller can display instructions; it does NOT throw.
 */
export async function printKot(options: KotPrintOptions): Promise<KotPrintResult> {
  const {
    items,
    tableId,
    orderId,
    timestamp,
    printerConfig,
    onBeforeBrowserPrint,
    onAfterBrowserPrint,
  } = options

  const mode = printerConfig?.mode ?? 'browser'
  const ip = printerConfig?.ip
  const port = printerConfig?.port ?? 9100

  if (mode === 'network' && ip) {
    try {
      const escposBytes = buildKotEscPos(items, { tableId, orderId, timestamp })
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
        return {
          method: 'network',
          success: false,
          errorMessage: buildBridgeErrorMessage(errorDetail),
        }
      }

      return { method: 'network', success: true }
    } catch (err) {
      const detail = err instanceof TypeError && err.message.includes('fetch')
        ? 'Bridge not running'
        : (err instanceof Error ? err.message : String(err))
      return {
        method: 'network',
        success: false,
        errorMessage: buildBridgeErrorMessage(detail),
      }
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

function buildBridgeErrorMessage(detail: string): string {
  return (
    `Network printer not reachable (${detail}). ` +
    'Make sure the print bridge is running:\n\n' +
    '  node scripts/print-bridge.js\n\n' +
    'The bridge must be running on the same computer as the browser.'
  )
}
