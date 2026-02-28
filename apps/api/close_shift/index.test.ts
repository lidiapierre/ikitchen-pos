import { describe, it, expect } from 'vitest'
import { handler, corsHeaders } from './index'

describe('close_shift handler', () => {
  describe('OPTIONS preflight', () => {
    it('returns 200 with CORS headers', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/close_shift', {
        method: 'OPTIONS',
      })
      const res = await handler(req)
      expect(res.status).toBe(200)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(corsHeaders['Access-Control-Allow-Origin'])
      expect(res.headers.get('Access-Control-Allow-Methods')).toBe(corsHeaders['Access-Control-Allow-Methods'])
    })
  })

  describe('POST — happy path', () => {
    it('returns 200 with shift_id and empty summary', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/close_shift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shift_id: 'shift-uuid-001', closing_float: 120 }),
      })
      const res = await handler(req)
      expect(res.status).toBe(200)
      const json = await res.json() as { success: boolean; data: { shift_id: string; summary: Record<string, unknown> } }
      expect(json.success).toBe(true)
      expect(json.data.shift_id).toBe('shift-uuid-001')
      expect(json.data.summary).toEqual({})
    })

    it('echoes back the provided shift_id', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/close_shift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shift_id: 'shift-uuid-999', closing_float: 80 }),
      })
      const res = await handler(req)
      expect(res.status).toBe(200)
      const json = await res.json() as { success: boolean; data: { shift_id: string; summary: Record<string, unknown> } }
      expect(json.data.shift_id).toBe('shift-uuid-999')
    })

    it('includes CORS headers in success response', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/close_shift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shift_id: 'shift-uuid-001', closing_float: 120 }),
      })
      const res = await handler(req)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    })
  })

  describe('POST — invalid body', () => {
    it('returns 400 when body is malformed JSON', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/close_shift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-valid-json',
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('Invalid request body')
    })

    it('returns 400 when body is null', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/close_shift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'null',
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('Invalid request body')
    })
  })

  describe('POST — missing required fields', () => {
    it('returns 400 when shift_id is absent', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/close_shift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ closing_float: 120 }),
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('shift_id is required')
    })

    it('returns 400 when shift_id is an empty string', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/close_shift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shift_id: '', closing_float: 120 }),
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('shift_id is required')
    })

    it('returns 400 when closing_float is absent', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/close_shift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shift_id: 'shift-uuid-001' }),
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('closing_float is required')
    })

    it('returns 400 when closing_float is a string instead of a number', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/close_shift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shift_id: 'shift-uuid-001', closing_float: '120' }),
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('closing_float is required')
    })

    it('returns 400 when closing_float is null', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/close_shift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shift_id: 'shift-uuid-001', closing_float: null }),
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
      expect(json.error).toBe('closing_float is required')
    })

    it('returns CORS headers on error responses', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/close_shift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ closing_float: 120 }),
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*')
    })
  })

  describe('POST — permission denied', () => {
    // TODO: permission enforcement not yet implemented in handler stub
    it.todo('returns 403 when Authorization header is absent')
    it.todo('returns 403 when caller does not have sufficient role')
  })

  describe('POST — invalid state transition', () => {
    // TODO: state transition enforcement not yet implemented in handler stub
    it.todo('returns 422 when shift is not open')
  })

  describe('POST — audit logging', () => {
    // TODO: audit logging not yet implemented in handler stub
    // Required by architecture §12: close_shift is a destructive action
    it.todo('inserts an audit_log row on successful close_shift')
    it.todo('returns 500 and does not return success if audit_log insert fails')
  })

  describe('non-POST/non-OPTIONS methods', () => {
    it('returns 400 for a GET request (no body to parse)', async (): Promise<void> => {
      const req = new Request('http://localhost/functions/v1/close_shift', {
        method: 'GET',
      })
      const res = await handler(req)
      expect(res.status).toBe(400)
      const json = await res.json() as { success: boolean; error: string }
      expect(json.success).toBe(false)
    })
  })
})
