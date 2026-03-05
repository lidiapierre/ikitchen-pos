import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchTables } from './tablesData'

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@supabase/supabase-js'

const BASE_URL = 'https://example.supabase.co'
const API_KEY = 'test-api-key'

function makeChain(result: { data: unknown; error: unknown }): ReturnType<typeof createClient> {
  const eq = vi.fn().mockResolvedValue(result)
  const select = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ select })
  return { from } as unknown as ReturnType<typeof createClient>
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('fetchTables', () => {
  it('returns tables with open_order_id when an open order exists', async (): Promise<void> => {
    vi.mocked(createClient).mockReturnValue(
      makeChain({
        data: [
          { id: 'table-uuid-1', label: 'Table 1', orders: [{ id: 'order-uuid-1' }] },
          { id: 'table-uuid-2', label: 'Table 2', orders: [] },
        ],
        error: null,
      }),
    )

    const result = await fetchTables(BASE_URL, API_KEY)

    expect(result).toEqual([
      { id: 'table-uuid-1', label: 'Table 1', open_order_id: 'order-uuid-1' },
      { id: 'table-uuid-2', label: 'Table 2', open_order_id: null },
    ])
  })

  it('creates the client with the provided URL and API key', async (): Promise<void> => {
    vi.mocked(createClient).mockReturnValue(makeChain({ data: [], error: null }))

    await fetchTables(BASE_URL, API_KEY)

    expect(createClient).toHaveBeenCalledWith(BASE_URL, API_KEY)
  })

  it('queries the tables table with a left-join on orders filtered to open status', async (): Promise<void> => {
    const eq = vi.fn().mockResolvedValue({ data: [], error: null })
    const select = vi.fn().mockReturnValue({ eq })
    const from = vi.fn().mockReturnValue({ select })
    vi.mocked(createClient).mockReturnValue({ from } as unknown as ReturnType<typeof createClient>)

    await fetchTables(BASE_URL, API_KEY)

    expect(from).toHaveBeenCalledWith('tables')
    expect(select).toHaveBeenCalledWith('id,label,orders!left(id)')
    expect(eq).toHaveBeenCalledWith('orders.status', 'open')
  })

  it('returns an empty array when there are no tables', async (): Promise<void> => {
    vi.mocked(createClient).mockReturnValue(makeChain({ data: [], error: null }))

    const result = await fetchTables(BASE_URL, API_KEY)
    expect(result).toEqual([])
  })

  it('throws when the Supabase client returns an error', async (): Promise<void> => {
    vi.mocked(createClient).mockReturnValue(
      makeChain({ data: null, error: { message: 'permission denied for table tables' } }),
    )

    await expect(fetchTables(BASE_URL, API_KEY)).rejects.toThrow(
      'Failed to fetch tables: permission denied for table tables',
    )
  })

  it('propagates errors thrown by the Supabase client', async (): Promise<void> => {
    const eq = vi.fn().mockRejectedValue(new Error('Network error'))
    const select = vi.fn().mockReturnValue({ eq })
    const from = vi.fn().mockReturnValue({ select })
    vi.mocked(createClient).mockReturnValue({ from } as unknown as ReturnType<typeof createClient>)

    await expect(fetchTables(BASE_URL, API_KEY)).rejects.toThrow('Network error')
  })
})
