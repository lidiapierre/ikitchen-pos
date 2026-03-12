import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { callCreateTable, callUpdateTable, callDeleteTable } from './tableAdminApi'

const BASE_URL = 'https://test.supabase.co'
const API_KEY = 'test-api-key'

function makeFetchResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response
}

function makeErrorResponse(status: number, body: unknown): Response {
  return {
    ok: false,
    status,
    statusText: 'Error',
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('callCreateTable', () => {
  it('returns the table_id from the response data', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeFetchResponse({ success: true, data: { table_id: 'new-table-id' } }),
    )
    const id = await callCreateTable(BASE_URL, API_KEY, 'rest-1', 'Table 9', 4)
    expect(id).toBe('new-table-id')
  })

  it('sends a POST to /functions/v1/create_table with the correct body and headers', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeFetchResponse({ success: true, data: { table_id: 'tbl-1' } }),
    )
    await callCreateTable(BASE_URL, API_KEY, 'rest-1', 'Table 9', 4)
    expect(fetch).toHaveBeenCalledWith(
      `${BASE_URL}/functions/v1/create_table`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          apikey: API_KEY,
          Authorization: `Bearer ${API_KEY}`,
        }),
        body: JSON.stringify({ restaurant_id: 'rest-1', label: 'Table 9', seat_count: 4 }),
      }),
    )
  })

  it('throws with the server error message when status is not ok', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeErrorResponse(400, { success: false, error: 'label is required' }),
    )
    await expect(callCreateTable(BASE_URL, API_KEY, 'rest-1', 'Table 9', 4)).rejects.toThrow(
      'label is required',
    )
  })

  it('throws when success is false but status is ok', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeFetchResponse({ success: false, error: 'Table creation returned no data' }),
    )
    await expect(callCreateTable(BASE_URL, API_KEY, 'rest-1', 'Table 9', 4)).rejects.toThrow(
      'Table creation returned no data',
    )
  })
})

describe('callUpdateTable', () => {
  it('sends a POST to /functions/v1/update_table with the correct body', async () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchResponse({ success: true }))
    await callUpdateTable(BASE_URL, API_KEY, 'tbl-1', 'Table One', 6)
    expect(fetch).toHaveBeenCalledWith(
      `${BASE_URL}/functions/v1/update_table`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ apikey: API_KEY }),
        body: JSON.stringify({ table_id: 'tbl-1', label: 'Table One', seat_count: 6 }),
      }),
    )
  })

  it('resolves without error on success', async () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchResponse({ success: true }))
    await expect(
      callUpdateTable(BASE_URL, API_KEY, 'tbl-1', 'Table One', 6),
    ).resolves.toBeUndefined()
  })

  it('throws with the server error message when status is not ok', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeErrorResponse(404, { success: false, error: 'Table not found' }),
    )
    await expect(callUpdateTable(BASE_URL, API_KEY, 'tbl-1', 'Table One', 6)).rejects.toThrow(
      'Table not found',
    )
  })
})

describe('callDeleteTable', () => {
  it('sends a POST to /functions/v1/delete_table with the correct body', async () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchResponse({ success: true }))
    await callDeleteTable(BASE_URL, API_KEY, 'tbl-1')
    expect(fetch).toHaveBeenCalledWith(
      `${BASE_URL}/functions/v1/delete_table`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ apikey: API_KEY }),
        body: JSON.stringify({ table_id: 'tbl-1' }),
      }),
    )
  })

  it('resolves without error on success', async () => {
    vi.mocked(fetch).mockResolvedValue(makeFetchResponse({ success: true }))
    await expect(callDeleteTable(BASE_URL, API_KEY, 'tbl-1')).resolves.toBeUndefined()
  })

  it('throws with the server error message when status is not ok', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeErrorResponse(409, { success: false, error: 'Cannot delete a table with an open order' }),
    )
    await expect(callDeleteTable(BASE_URL, API_KEY, 'tbl-1')).rejects.toThrow(
      'Cannot delete a table with an open order',
    )
  })

  it('throws when success is false on server error', async () => {
    vi.mocked(fetch).mockResolvedValue(
      makeErrorResponse(500, { success: false, error: 'Internal server error' }),
    )
    await expect(callDeleteTable(BASE_URL, API_KEY, 'tbl-1')).rejects.toThrow(
      'Internal server error',
    )
  })
})
