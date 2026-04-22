import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FeedbackWidget from './FeedbackWidget'

// ── Mock @/lib/user-context ────────────────────────────────────────────────────
const mockUseUser = vi.fn()
vi.mock('@/lib/user-context', () => ({
  useUser: (): ReturnType<typeof mockUseUser> => mockUseUser(),
}))

// ── Mock @/lib/supabase ────────────────────────────────────────────────────────
vi.mock('@/lib/supabase', () => ({
  supabase: {
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://supabase.co/storage/shot.png' } }),
      }),
    },
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: {
            user: { email: 'tester@example.com', user_metadata: { full_name: 'Tester' } },
          },
        },
      }),
    },
  },
}))

// ── Mock global fetch ─────────────────────────────────────────────────────────
const mockFetch = vi.fn()

beforeEach(() => {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true }),
  })
  vi.stubGlobal('fetch', mockFetch)
})

describe('FeedbackWidget', () => {
  it('renders nothing while loading', () => {
    mockUseUser.mockReturnValue({ role: null, loading: true, userId: null, accessToken: null })
    const { container } = render(<FeedbackWidget />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when user is not authenticated', () => {
    mockUseUser.mockReturnValue({ role: null, loading: false, userId: null, accessToken: null })
    const { container } = render(<FeedbackWidget />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the floating Feedback button when user is authenticated', () => {
    mockUseUser.mockReturnValue({ role: 'server', loading: false, userId: 'u1', accessToken: 'tok' })
    render(<FeedbackWidget />)
    expect(screen.getByRole('button', { name: /open feedback form/i })).toBeInTheDocument()
  })

  it('opens the modal when the Feedback button is clicked', async () => {
    mockUseUser.mockReturnValue({ role: 'server', loading: false, userId: 'u1', accessToken: 'tok' })
    render(<FeedbackWidget />)

    await userEvent.click(screen.getByRole('button', { name: /open feedback form/i }))
    expect(screen.getByRole('heading', { name: /send feedback/i })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/describe the bug/i)).toBeInTheDocument()
  })

  it('closes the modal when Cancel is clicked', async () => {
    mockUseUser.mockReturnValue({ role: 'server', loading: false, userId: 'u1', accessToken: 'tok' })
    render(<FeedbackWidget />)

    await userEvent.click(screen.getByRole('button', { name: /open feedback form/i }))
    expect(screen.getByRole('heading', { name: /send feedback/i })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.queryByRole('heading', { name: /send feedback/i })).not.toBeInTheDocument()
  })

  it('disables Submit when description is empty', async () => {
    mockUseUser.mockReturnValue({ role: 'server', loading: false, userId: 'u1', accessToken: 'tok' })
    render(<FeedbackWidget />)

    await userEvent.click(screen.getByRole('button', { name: /open feedback form/i }))
    expect(screen.getByRole('button', { name: /send feedback/i })).toBeDisabled()
  })

  it('enables Submit and calls /api/feedback when form is filled', async () => {
    mockUseUser.mockReturnValue({ role: 'server', loading: false, userId: 'u1', accessToken: 'tok' })
    render(<FeedbackWidget />)

    await userEvent.click(screen.getByRole('button', { name: /open feedback form/i }))
    await userEvent.type(screen.getByPlaceholderText(/describe the bug/i), 'Checkout is broken')

    const submitBtn = screen.getByRole('button', { name: /send feedback/i })
    expect(submitBtn).not.toBeDisabled()

    await userEvent.click(submitBtn)

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/feedback')
    expect(opts.method).toBe('POST')

    const body = JSON.parse(opts.body as string) as { description: string }
    expect(body.description).toBe('Checkout is broken')
  })

  it('shows success state after successful submission', async () => {
    mockUseUser.mockReturnValue({ role: 'server', loading: false, userId: 'u1', accessToken: 'tok' })
    render(<FeedbackWidget />)

    await userEvent.click(screen.getByRole('button', { name: /open feedback form/i }))
    await userEvent.type(screen.getByPlaceholderText(/describe the bug/i), 'Something broke')
    await userEvent.click(screen.getByRole('button', { name: /send feedback/i }))

    expect(await screen.findByText(/feedback sent/i)).toBeInTheDocument()
  })

  it('shows an error message when the API call fails', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Unauthorized' }),
    })

    mockUseUser.mockReturnValue({ role: 'server', loading: false, userId: 'u1', accessToken: 'tok' })
    render(<FeedbackWidget />)

    await userEvent.click(screen.getByRole('button', { name: /open feedback form/i }))
    await userEvent.type(screen.getByPlaceholderText(/describe the bug/i), 'Bug report')
    await userEvent.click(screen.getByRole('button', { name: /send feedback/i }))

    expect(await screen.findByText(/unauthorized/i)).toBeInTheDocument()
  })
})
