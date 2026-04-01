import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import RegisterPage from './page'

vi.mock('@/app/admin/restaurants/new/ProvisionRestaurantForm', () => ({
  default: ({ variant }: { variant?: string }) => (
    <div data-testid="provision-form" data-variant={variant ?? 'admin'} />
  ),
}))

vi.mock('@/lib/user-context', () => ({
  useUser: () => ({ accessToken: 'test-token' }),
}))

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-key'
})

describe('RegisterPage', () => {
  it('renders without crashing and shows the heading', () => {
    render(<RegisterPage />)
    expect(screen.getByRole('heading', { name: /set up your restaurant/i })).toBeInTheDocument()
  })

  it('renders ProvisionRestaurantForm with variant="public"', () => {
    render(<RegisterPage />)
    const form = screen.getByTestId('provision-form')
    expect(form).toBeInTheDocument()
    expect(form).toHaveAttribute('data-variant', 'public')
  })

  it('shows the "Powered by iKitchen POS" tagline', () => {
    render(<RegisterPage />)
    expect(screen.getByText(/powered by ikitchen pos/i)).toBeInTheDocument()
  })
})
