import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { callCreateTable, callUpdateTable, callDeleteTable } from './tableAdminApi'

const BASE_URL = 'https://test.supabase.co'
const API_KEY = 'test-api-key'

function makeFetchResponse(body: unknown, ok = true, status = 200): Response {
  const text = body !== undefined ? JSON.stringify(body) : ''
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Bad Request',
    text: vi.fn().mockResolvedValue(text),
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response
}

function makeErrorResponse(status: number, body: string): Response {
  return {
    ok: false,
    status,
    statusText: 'Error',
    text: vi.fn().mockResolvedValue(body),
  } as unknown as Response
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('callCreateTable', () => {
  it('returns the id of the created table', async () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchResponse([{ id: 'new-table-id' }]))
    const id = await callCreateTable(BASE_URL, API_KEY, 'rest-1', 'Table 9', 4)
    expect(id).toBe('new-table-id')
  })

  it('sends a POST to /rest/v1/tables with the correct body and Prefer header', async () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchResponse([{ id: 'tbl-1' }]))
    await callCreateTable(BASE_URL, API_KEY, 'rest-1', 'Table 9', 4)
    expect(fetch).toHaveBeenCalledWith(
      `${BASE_URL}/rest/v1/tables`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Prefer: 'return=representation',
          apikey: API_KEY,
        }),
        body: JSON.stringify({ restaurant_id: 'rest-1', label: 'Table 9', seat_count: 4 }),
      }),
    )
  })

  it('throws when the server returns an error status', async () => {
    vi.mocked(fetch).mockResolvedValue(makeErrorResponse(400, 'duplicate key'))
    await expect(callCreateTable(BASE_URL, API_KEY, 'rest-1', 'Table 9', 4)).rejects.toThrow(
      /failed: 400/,
    )
  })

  it('throws when the server returns an empty array', async () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchResponse([]))
    await expect(callCreateTable(BASE_URL, API_KEY, 'rest-1', 'Table 9', 4)).rejects.toThrow(
      'Table creation returned no data',
    )
  })
})

describe('callUpdateTable', () => {
  it('sends a PATCH to the correct URL with the updated fields', async () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchResponse(''))
    await callUpdateTable(BASE_URL, API_KEY, 'tbl-1', 'Table One', 6)
    expect(fetch).toHaveBeenCalledWith(
      `${BASE_URL}/rest/v1/tables?id=eq.tbl-1`,
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({ apikey: API_KEY }),
        body: JSON.stringify({ label: 'Table One', seat_count: 6 }),
      }),
    )
  })

  it('resolves without error on success', async () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchResponse(''))
    await expect(callUpdateTable(BASE_URL, API_KEY, 'tbl-1', 'Table One', 6)).resolves.toBeUndefined()
  })

  it('throws when the server returns an error status', async () => {
    vi.mocked(fetch).mockResolvedValue(makeErrorResponse(404, 'not found'))
    await expect(callUpdateTable(BASE_URL, API_KEY, 'tbl-1', 'Table One', 6)).rejects.toThrow(
      /failed: 404/,
    )
  })
})

describe('callDeleteTable', () => {
  it('sends a DELETE to the correct URL', async () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchResponse(''))
    await callDeleteTable(BASE_URL, API_KEY, 'tbl-1')
    expect(fetch).toHaveBeenCalledWith(
      `${BASE_URL}/rest/v1/tables?id=eq.tbl-1`,
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({ apikey: API_KEY }),
      }),
    )
  })

  it('resolves without error on success', async () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchResponse(''))
    await expect(callDeleteTable(BASE_URL, API_KEY, 'tbl-1')).resolves.toBeUndefined()
  })

  it('throws when the server returns an error status', async () => {
    vi.mocked(fetch).mockResolvedValue(makeErrorResponse(500, 'server error'))
    await expect(callDeleteTable(BASE_URL, API_KEY, 'tbl-1')).rejects.toThrow(/failed: 500/)
  })
})
