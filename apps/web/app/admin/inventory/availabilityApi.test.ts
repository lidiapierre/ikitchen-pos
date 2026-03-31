import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchMenuAvailability } from './availabilityApi'

const SUPABASE_URL = 'https://test.supabase.co'
const API_KEY = 'test-api-key'
const RESTAURANT_ID = 'rest-001'

const mockMenuRows = [
  {
    id: 'menu-001',
    name: 'Mains',
    menu_items: [
      { id: 'item-001', name: 'Butter Chicken', available: true },
      { id: 'item-002', name: 'Lamb Rogan Josh', available: false },
    ],
  },
  {
    id: 'menu-002',
    name: 'Starters',
    menu_items: [
      { id: 'item-003', name: 'Samosa', available: true },
    ],
  },
]

afterEach(() => {
  vi.restoreAllMocks()
})

describe('fetchMenuAvailability', () => {
  it('fetches menus scoped to the given restaurantId', async (): Promise<void> => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockMenuRows), { status: 200 }),
    ))

    await fetchMenuAvailability(SUPABASE_URL, API_KEY, RESTAURANT_ID)

    const fetchMock = vi.mocked(fetch)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`restaurant_id=eq.${RESTAURANT_ID}`),
      expect.any(Object),
    )
  })

  it('returns categories with items sorted by name', async (): Promise<void> => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockMenuRows), { status: 200 }),
    ))

    const result = await fetchMenuAvailability(SUPABASE_URL, API_KEY, RESTAURANT_ID)

    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('Mains')
    // Items should be sorted alphabetically
    expect(result[0].items[0].name).toBe('Butter Chicken')
    expect(result[0].items[1].name).toBe('Lamb Rogan Josh')
  })

  it('maps available field correctly', async (): Promise<void> => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockMenuRows), { status: 200 }),
    ))

    const result = await fetchMenuAvailability(SUPABASE_URL, API_KEY, RESTAURANT_ID)

    const mains = result.find((c) => c.id === 'menu-001')!
    const butterChicken = mains.items.find((i) => i.id === 'item-001')!
    const lambRoganJosh = mains.items.find((i) => i.id === 'item-002')!

    expect(butterChicken.available).toBe(true)
    expect(lambRoganJosh.available).toBe(false)
  })

  it('handles categories with no items gracefully', async (): Promise<void> => {
    const emptyRows = [{ id: 'menu-empty', name: 'Empty Category', menu_items: null }]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(emptyRows), { status: 200 }),
    ))

    const result = await fetchMenuAvailability(SUPABASE_URL, API_KEY, RESTAURANT_ID)

    expect(result[0].items).toEqual([])
  })

  it('throws when the API returns a non-ok response', async (): Promise<void> => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('Unauthorized', { status: 401 }),
    ))

    await expect(
      fetchMenuAvailability(SUPABASE_URL, API_KEY, RESTAURANT_ID),
    ).rejects.toThrow('Failed to fetch availability: 401')
  })

  it('sends apikey and Authorization headers', async (): Promise<void> => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    ))

    await fetchMenuAvailability(SUPABASE_URL, API_KEY, RESTAURANT_ID)

    const fetchMock = vi.mocked(fetch)
    const callArgs = fetchMock.mock.calls[0]
    const headers = callArgs[1]?.headers as Record<string, string>
    expect(headers['apikey']).toBe(API_KEY)
    expect(headers['Authorization']).toBe(`Bearer ${API_KEY}`)
  })
})
