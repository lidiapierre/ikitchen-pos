/**
 * Minimal structured logger for server-side Next.js code.
 * Outputs JSON lines so log aggregators (Vercel, Datadog, etc.) can parse
 * them without additional configuration.
 *
 * Usage:
 *   import { logger } from '@/lib/logger'
 *   logger.error('feedback', 'Slack webhook failed', { status: 400 })
 */

type LogLevel = 'info' | 'warn' | 'error'

function log(level: LogLevel, ns: string, msg: string, meta?: Record<string, unknown>): void {
  const entry = JSON.stringify({
    level,
    ns,
    msg,
    ts: new Date().toISOString(),
    ...(meta ?? {}),
  })

  if (level === 'error') {
    process.stderr.write(entry + '\n')
  } else {
    process.stdout.write(entry + '\n')
  }
}

export const logger = {
  info: (ns: string, msg: string, meta?: Record<string, unknown>): void =>
    log('info', ns, msg, meta),
  warn: (ns: string, msg: string, meta?: Record<string, unknown>): void =>
    log('warn', ns, msg, meta),
  error: (ns: string, msg: string, meta?: Record<string, unknown>): void =>
    log('error', ns, msg, meta),
}
