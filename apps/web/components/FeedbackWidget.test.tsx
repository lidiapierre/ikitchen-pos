import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FeedbackWidget from './FeedbackWidget'

// ── Mock @/lib/user-context ────────────────────────────────────────────────────
const mockUseUser = vi.fn()
vi.mock('@/lib/user-context', () => ({
  useUser: (): ReturnType<typeof mockUseUser> => mockUseUser(),
}))

// ── Mock @/lib/supabase (storage upload only — identity NOT fetched client-side) ─
vi.mock('@/lib/supabase', () => ({
  supabase: {
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl: vi.fn().mockReturnValue({
          data: { publicUrl: 'https://dmaogdwtgohrhbytxjqu.supabase.co/storage/shot.png' },
        }),
      }),
    },
    auth: {
      // getSession is no longer called in FeedbackWidget; kept here in case
      // other paths need it, but it should not be invoked during these tests.
      getSession: vi.fn().mockRejectedValue(new Error('getSession should not be called')),
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
  mockUseUser.mockReturnValue({ role: 'server', loading: false, userId: 'u1', accessToken: 'tok' })
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
    render(<FeedbackWidget />)
    expect(screen.getByRole('button', { name: /open feedback form/i })).toBeInTheDocument()
  })

  it('opens the modal when the Feedback button is clicked', async () => {
    render(<FeedbackWidget />)

    await userEvent.click(screen.getByRole('button', { name: /open feedback form/i }))
    expect(screen.getByRole('heading', { name: /send feedback/i })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/describe the bug/i)).toBeInTheDocument()
  })

  it('closes the modal when Cancel is clicked', async () => {
    render(<FeedbackWidget />)

    await userEvent.click(screen.getByRole('button', { name: /open feedback form/i }))
    expect(screen.getByRole('heading', { name: /send feedback/i })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.queryByRole('heading', { name: /send feedback/i })).not.toBeInTheDocument()
  })

  it('closes the modal when backdrop is clicked', async () => {
    render(<FeedbackWidget />)

    await userEvent.click(screen.getByRole('button', { name: /open feedback form/i }))
    expect(screen.getByRole('heading', { name: /send feedback/i })).toBeInTheDocument()

    // The backdrop is the fixed overlay div — click it directly
    const backdrop = screen.getByRole('heading', { name: /send feedback/i }).closest('.fixed')!
    fireEvent.click(backdrop)
    expect(screen.queryByRole('heading', { name: /send feedback/i })).not.toBeInTheDocument()
  })

  it('disables Submit when description is empty', async () => {
    render(<FeedbackWidget />)

    await userEvent.click(screen.getByRole('button', { name: /open feedback form/i }))
    expect(screen.getByRole('button', { name: /send feedback/i })).toBeDisabled()
  })

  it('enables Submit and calls /api/feedback when form is filled', async () => {
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

    const body = JSON.parse(opts.body as string) as { description: string; userEmail?: string; userName?: string }
    expect(body.description).toBe('Checkout is broken')
    // Identity must NOT be sent from the client
    expect(body.userEmail).toBeUndefined()
    expect(body.userName).toBeUndefined()
  })

  it('shows success state after successful submission', async () => {
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

    render(<FeedbackWidget />)

    await userEvent.click(screen.getByRole('button', { name: /open feedback form/i }))
    await userEvent.type(screen.getByPlaceholderText(/describe the bug/i), 'Bug report')
    await userEvent.click(screen.getByRole('button', { name: /send feedback/i }))

    expect(await screen.findByText(/unauthorized/i)).toBeInTheDocument()
  })

  it('shows file error when too many files are selected', async () => {
    render(<FeedbackWidget />)
    await userEvent.click(screen.getByRole('button', { name: /open feedback form/i }))

    const input = document.querySelector('input[type="file"]') as HTMLInputElement

    // Simulate selecting 6 files (over the MAX_FILES=5 limit)
    const files = Array.from({ length: 6 }, (_, i) =>
      new File(['data'], `shot${i}.png`, { type: 'image/png' })
    )
    fireEvent.change(input, { target: { files } })

    expect(await screen.findByText(/maximum 5 files/i)).toBeInTheDocument()
  })

  it('shows file error when a file exceeds the size limit', async () => {
    render(<FeedbackWidget />)
    await userEvent.click(screen.getByRole('button', { name: /open feedback form/i }))

    const input = document.querySelector('input[type="file"]') as HTMLInputElement

    // Simulate a 6 MB file (over MAX_FILE_SIZE_BYTES = 5 MB)
    const bigContent = new Uint8Array(6 * 1024 * 1024)
    const bigFile = new File([bigContent], 'huge.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [bigFile] } })

    expect(await screen.findByText(/each file must be under 5 mb/i)).toBeInTheDocument()
  })
})
