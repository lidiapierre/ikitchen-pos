#!/usr/bin/env node
/**
 * iKitchen Print Bridge
 *
 * A lightweight local HTTP server that forwards ESC/POS payloads to a
 * network (WiFi/TCP) thermal printer.
 *
 * Usage:
 *   node scripts/print-bridge.js [--port 9191]
 *
 * API:
 *   POST /print
 *   Body (JSON): { ip: string, port: number, data: string (base64) }
 *   Response:    { success: true } | { success: false, error: string }
 *
 * Architecture note:
 *   Browser and Supabase Edge Functions cannot open raw TCP sockets.
 *   This script runs locally alongside the browser and acts as the bridge.
 */

const http = require('http')
const net = require('net')

const BRIDGE_PORT = parseInt(process.argv.find((a) => a.startsWith('--port='))?.split('=')[1] ?? '9191', 10)
const ALLOWED_ORIGINS = ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000']

function setCorsHeaders(res, origin) {
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Vary', 'Origin')
}

function sendJson(res, statusCode, body) {
  const json = JSON.stringify(body)
  res.writeHead(statusCode, { 'Content-Type': 'application/json' })
  res.end(json)
}

/**
 * Connect to printer via TCP and write bytes.
 * @param {string} ip
 * @param {number} port
 * @param {Buffer} data
 * @returns {Promise<void>}
 */
function printViaTcp(ip, port, data) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(port, ip, () => {
      console.log(`[print-bridge] Connected to printer at ${ip}:${port} — sending ${data.length} bytes`)
      socket.write(data, (err) => {
        if (err) {
          socket.destroy()
          return reject(err)
        }
        // Give the printer a moment to accept the data before closing
        setTimeout(() => {
          socket.end()
          resolve()
        }, 300)
      })
    })

    socket.setTimeout(5000)
    socket.on('timeout', () => {
      socket.destroy()
      reject(new Error(`Connection to ${ip}:${port} timed out`))
    })
    socket.on('error', (err) => {
      reject(err)
    })
  })
}

const server = http.createServer((req, res) => {
  const origin = req.headers['origin'] ?? ''
  setCorsHeaders(res, origin)

  // Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method === 'POST' && req.url === '/print') {
    let body = ''
    req.on('data', (chunk) => { body += chunk.toString() })
    req.on('end', async () => {
      let parsed
      try {
        parsed = JSON.parse(body)
      } catch {
        console.error('[print-bridge] Invalid JSON body')
        return sendJson(res, 400, { success: false, error: 'Invalid JSON body' })
      }

      const { ip, port, data } = parsed

      if (!ip || typeof ip !== 'string') {
        return sendJson(res, 400, { success: false, error: 'Missing or invalid "ip"' })
      }
      if (!port || typeof port !== 'number') {
        return sendJson(res, 400, { success: false, error: 'Missing or invalid "port"' })
      }
      if (!data || typeof data !== 'string') {
        return sendJson(res, 400, { success: false, error: 'Missing or invalid "data" (expected base64 string)' })
      }

      let bytes
      try {
        bytes = Buffer.from(data, 'base64')
      } catch {
        return sendJson(res, 400, { success: false, error: 'Failed to decode base64 data' })
      }

      try {
        await printViaTcp(ip, port, bytes)
        console.log(`[print-bridge] ✅ Print job delivered to ${ip}:${port}`)
        return sendJson(res, 200, { success: true })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`[print-bridge] ❌ Print failed: ${message}`)
        return sendJson(res, 502, { success: false, error: message })
      }
    })
    return
  }

  if (req.method === 'GET' && req.url === '/health') {
    return sendJson(res, 200, { status: 'ok', version: '1.0.0' })
  }

  res.writeHead(404)
  res.end('Not found')
})

server.listen(BRIDGE_PORT, '127.0.0.1', () => {
  console.log(`[print-bridge] 🖨  iKitchen Print Bridge listening on http://127.0.0.1:${BRIDGE_PORT}`)
  console.log(`[print-bridge]    POST /print  — { ip, port, data: base64 }`)
  console.log(`[print-bridge]    GET  /health — status check`)
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[print-bridge] ❌ Port ${BRIDGE_PORT} is already in use. Is the bridge already running?`)
  } else {
    console.error('[print-bridge] Server error:', err)
  }
  process.exit(1)
})
