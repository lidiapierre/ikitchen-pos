import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import LoginPage from './page'

// Mock next/navigation
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

// Mock supabase
const mockSignInWithPassword = vi.fn()
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
    },
  },
}))

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the login form with branding', () => {
    render(<LoginPage />)
    expect(screen.getByText('Lahore by iKitchen')).toBeDefined()
    expect(screen.getByLabelText('Email address')).toBeDefined()
    expect(screen.getByLabelText('Password')).toBeDefined()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeDefined()
  })

  it('does not show a sign-up link', () => {
    render(<LoginPage />)
    expect(screen.queryByText(/sign up/i)).toBeNull()
    expect(screen.queryByText(/register/i)).toBeNull()
    expect(screen.queryByText(/create account/i)).toBeNull()
  })

  it('shows error message on failed login', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: { message: 'Invalid credentials' } })
    render(<LoginPage />)

    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'bad@email.com' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'wrongpassword' },
    })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined()
      expect(screen.getByText(/invalid email or password/i)).toBeDefined()
    })
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('redirects to /tables on successful login', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: null })
    render(<LoginPage />)

    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'staff@example.com' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'correctpassword' },
    })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/tables')
    })
  })

  it('disables submit button while loading', async () => {
    let resolveSignIn!: (value: { error: null }) => void
    mockSignInWithPassword.mockReturnValue(
      new Promise<{ error: null }>((resolve) => { resolveSignIn = resolve })
    )

    render(<LoginPage />)

    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'staff@example.com' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password' },
    })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /signing in/i })
      expect((btn as HTMLButtonElement).disabled).toBe(true)
    })

    resolveSignIn({ error: null })
  })
})
