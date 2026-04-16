import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import type { JSX } from 'react'

// ─── Mock Next.js Link ────────────────────────────────────────────────────────
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }): JSX.Element => (
    <a href={href}>{children}</a>
  ),
}))

// ─── Mock supabase (not used in the paths under test) ────────────────────────
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } },
}))

// ─── Mock shiftRevenueApi ─────────────────────────────────────────────────────
vi.mock('./shiftRevenueApi', () => ({
  fetchShiftRevenue: vi.fn().mockResolvedValue({
    orderCount: 0, totalCents: 0, cashCents: 0, cardCents: 0,
    cashTenderedCents: 0, changeDueCents: 0,
  }),
}))

// ─── Mock formatPrice / dateFormat ───────────────────────────────────────────
vi.mock('@/lib/formatPrice', () => ({
  formatPrice: vi.fn().mockReturnValue('৳0'),
  DEFAULT_CURRENCY_SYMBOL: '৳',
}))
vi.mock('@/lib/dateFormat', () => ({
  formatDateTime: vi.fn().mockReturnValue('2026-01-01 08:00'),
}))

// ─── Mock useUser — overridden per-test ──────────────────────────────────────
const mockUseUser = vi.fn()
vi.mock('@/lib/user-context', () => ({
  useUser: (): ReturnType<typeof mockUseUser> => mockUseUser(),
}))

const SUPABASE_URL = 'https://example.supabase.co'
const PUBLISHABLE_KEY = 'test-anon-key'

describe('ShiftsClient — fetchActiveShiftOnMount', () => {
  // Minimal localStorage mock — jsdom provides the real thing in most cases,
  // but stubbing avoids any environment quirks
  const localStorageMock = ((): Storage => {
    let store: Record<string, string> = {}
    return {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = value },
      removeItem: (key: string) => { delete store[key] },
      clear: () => { store = {} },
      get length() { return Object.keys(store).length },
      key: (index: number) => Object.keys(store)[index] ?? null,
    } as Storage
  })()

  beforeEach((): void => {
    vi.stubGlobal('fetch', vi.fn())
    vi.stubGlobal('localStorage', localStorageMock)
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL)
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', PUBLISHABLE_KEY)
    localStorageMock.clear()
  })

  afterEach((): void => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('uses JWT token and user_id filter when accessToken and userId are set', async (): Promise<void> => {
    const TOKEN = 'my-jwt-token'
    const USER_ID = 'user-abc-123'

    mockUseUser.mockReturnValue({
      accessToken: TOKEN, userId: USER_ID,
      role: 'owner', isAdmin: true, loading: false,
    })

    // Server returns no open shift (empty array)
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: (): Promise<never[]> => Promise.resolve([]),
    } as Response)

    const { default: ShiftsClient } = await import('./ShiftsClient')
    render(<ShiftsClient />)

    await waitFor(() => expect(fetch).toHaveBeenCalled())

    const [calledUrl, calledInit] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]

    // URL must include user_id filter and closed_at=is.null
    expect(calledUrl).toContain(`user_id=eq.${USER_ID}`)
    expect(calledUrl).toContain('closed_at=is.null')

    // Authorization must use the user's JWT, NOT the anon key
    const headers = calledInit?.headers as Record<string, string>
    expect(headers['Authorization']).toBe(`Bearer ${TOKEN}`)
    expect(headers['Authorization']).not.toBe(`Bearer ${PUBLISHABLE_KEY}`)
  })

  it('falls back to localStorage when accessToken is null', async (): Promise<void> => {
    mockUseUser.mockReturnValue({
      accessToken: null, userId: null,
      role: null, isAdmin: false, loading: false,
    })

    // Pre-populate localStorage with a stored shift
    const storedShift = { shift_id: 'local-shift-1', started_at: '2026-01-01T08:00:00.000Z' }
    localStorage.setItem('ikitchen_active_shift', JSON.stringify(storedShift))

    const { default: ShiftsClient } = await import('./ShiftsClient')
    const { getByTestId } = render(<ShiftsClient />)

    // Should NOT call fetch (no token available)
    expect(fetch).not.toHaveBeenCalled()

    // Should show the shift loaded from localStorage
    await waitFor(() => expect(getByTestId('shift-open')).toBeInTheDocument())
  })

  it('falls back to localStorage when accessToken is set but userId is empty', async (): Promise<void> => {
    mockUseUser.mockReturnValue({
      accessToken: 'some-token', userId: null,
      role: 'owner', isAdmin: true, loading: false,
    })

    const { default: ShiftsClient } = await import('./ShiftsClient')
    render(<ShiftsClient />)

    // No userId → should not attempt remote fetch
    expect(fetch).not.toHaveBeenCalled()
  })
})
