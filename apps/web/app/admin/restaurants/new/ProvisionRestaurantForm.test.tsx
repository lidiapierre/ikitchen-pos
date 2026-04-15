import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ProvisionRestaurantForm from './ProvisionRestaurantForm'
import { callProvisionRestaurant } from '../restaurantAdminApi'
import { fetchIsSuperAdmin } from '../restaurantAdminData'

vi.mock('../restaurantAdminData', () => ({
  fetchIsSuperAdmin: vi.fn(),
}))

vi.mock('../restaurantAdminApi', () => ({
  callProvisionRestaurant: vi.fn(),
}))

let mockAccessToken: string | null = 'test-token'

vi.mock('@/lib/user-context', () => ({
  useUser: () => ({ accessToken: mockAccessToken }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockAccessToken = 'test-token'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-key'
  vi.mocked(fetchIsSuperAdmin).mockResolvedValue(true)
})

describe('ProvisionRestaurantForm — permission guard', () => {
  it('shows loading while checking permissions', () => {
    vi.mocked(fetchIsSuperAdmin).mockReturnValue(new Promise(() => {}))
    render(<ProvisionRestaurantForm />)
    expect(screen.getByText('Checking permissions…')).toBeInTheDocument()
  })

  it('shows access denied when user is not a super-admin', async () => {
    vi.mocked(fetchIsSuperAdmin).mockResolvedValue(false)
    render(<ProvisionRestaurantForm />)
    await waitFor(() =>
      expect(screen.getByText('Access denied — super-admin only')).toBeInTheDocument(),
    )
  })

  it('renders the form for super-admins', async () => {
    render(<ProvisionRestaurantForm />)
    await waitFor(() =>
      expect(screen.getByLabelText(/restaurant name/i)).toBeInTheDocument(),
    )
    expect(screen.getByLabelText(/owner email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/owner password/i)).toBeInTheDocument()
  })
})

describe('ProvisionRestaurantForm — validation', () => {
  async function renderAndWaitForForm() {
    render(<ProvisionRestaurantForm />)
    await waitFor(() => expect(screen.getByLabelText(/restaurant name/i)).toBeInTheDocument())
  }

  it('shows error when restaurant name is empty', async () => {
    await renderAndWaitForForm()
    fireEvent.click(screen.getByRole('button', { name: /provision restaurant/i }))
    await waitFor(() =>
      expect(screen.getByText('Restaurant name is required')).toBeInTheDocument(),
    )
  })

  it('shows error when restaurant name is too short', async () => {
    await renderAndWaitForForm()
    fireEvent.change(screen.getByLabelText(/restaurant name/i), { target: { value: 'X' } })
    fireEvent.click(screen.getByRole('button', { name: /provision restaurant/i }))
    await waitFor(() =>
      expect(screen.getByText('Restaurant name must be at least 2 characters')).toBeInTheDocument(),
    )
  })

  it('shows error when owner email is empty', async () => {
    await renderAndWaitForForm()
    fireEvent.change(screen.getByLabelText(/restaurant name/i), { target: { value: 'Test Restaurant' } })
    fireEvent.click(screen.getByRole('button', { name: /provision restaurant/i }))
    await waitFor(() =>
      expect(screen.getByText('Owner email is required')).toBeInTheDocument(),
    )
  })

  it('shows error when owner email is invalid', async () => {
    await renderAndWaitForForm()
    fireEvent.change(screen.getByLabelText(/restaurant name/i), { target: { value: 'Test Restaurant' } })
    fireEvent.change(screen.getByLabelText(/owner email/i), { target: { value: 'not-an-email' } })
    fireEvent.click(screen.getByRole('button', { name: /provision restaurant/i }))
    await waitFor(() =>
      expect(screen.getByText('Please enter a valid email address')).toBeInTheDocument(),
    )
  })

  it('shows error when password is too short', async () => {
    await renderAndWaitForForm()
    fireEvent.change(screen.getByLabelText(/restaurant name/i), { target: { value: 'Test Restaurant' } })
    fireEvent.change(screen.getByLabelText(/owner email/i), { target: { value: 'owner@test.com' } })
    fireEvent.change(screen.getByLabelText(/owner password/i), { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: /provision restaurant/i }))
    await waitFor(() =>
      expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument(),
    )
  })
})

describe('ProvisionRestaurantForm — submission', () => {
  async function fillValidForm() {
    render(<ProvisionRestaurantForm />)
    await waitFor(() => expect(screen.getByLabelText(/restaurant name/i)).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText(/restaurant name/i), {
      target: { value: 'Test Restaurant' },
    })
    fireEvent.change(screen.getByLabelText(/owner email/i), {
      target: { value: 'owner@test.com' },
    })
    fireEvent.change(screen.getByLabelText(/owner password/i), {
      target: { value: 'password123' },
    })
  }

  it('calls callProvisionRestaurant with correct args on valid submit', async () => {
    vi.mocked(callProvisionRestaurant).mockResolvedValue({ restaurantId: 'rest-123' })
    await fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: /provision restaurant/i }))
    await waitFor(() =>
      expect(callProvisionRestaurant).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'test-token',
        expect.objectContaining({
          name: 'Test Restaurant',
          ownerEmail: 'owner@test.com',
          ownerPassword: 'password123',
        }),
      ),
    )
  })

  it('shows success state after successful submission', async () => {
    vi.mocked(callProvisionRestaurant).mockResolvedValue({ restaurantId: 'rest-123' })
    await fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: /provision restaurant/i }))
    await waitFor(() =>
      expect(
        screen.getByText(/Test Restaurant.*has been provisioned successfully/i),
      ).toBeInTheDocument(),
    )
    expect(screen.getByRole('link', { name: /view restaurants/i })).toBeInTheDocument()
  })

  it('shows error message when submission fails', async () => {
    vi.mocked(callProvisionRestaurant).mockRejectedValue(new Error('Slug already taken'))
    await fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: /provision restaurant/i }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Slug already taken'),
    )
  })
})

describe('ProvisionRestaurantForm — public variant', () => {
  it('shows the form directly without a super-admin loading state', () => {
    render(<ProvisionRestaurantForm variant="public" />)
    // Should never show "Checking permissions…"
    expect(screen.queryByText('Checking permissions…')).not.toBeInTheDocument()
    // Form should be visible immediately
    expect(screen.getByLabelText(/restaurant name/i)).toBeInTheDocument()
    // fetchIsSuperAdmin should never be called
    expect(fetchIsSuperAdmin).not.toHaveBeenCalled()
  })

  it('does not show the Super Admin — Provisioning badge', () => {
    render(<ProvisionRestaurantForm variant="public" />)
    expect(screen.queryByText(/super admin — provisioning/i)).not.toBeInTheDocument()
  })

  it('renders the form directly for unauthenticated visitors (no login prompt)', () => {
    mockAccessToken = null
    render(<ProvisionRestaurantForm variant="public" />)
    // No login prompt — form is shown directly for self-service
    expect(screen.queryByText(/please log in/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/restaurant name/i)).toBeInTheDocument()
  })
})

describe('callProvisionRestaurant — API function', () => {
  it('builds correct fetch payload', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { restaurant: { id: 'rest-abc' }, owner_email: 'owner@test.com' },
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', mockFetch)

    const { callProvisionRestaurant: realFn } = await vi.importActual<
      typeof import('../restaurantAdminApi')
    >('../restaurantAdminApi')

    const result = await realFn('https://test.supabase.co', 'my-token', {
      name: 'My Restaurant',
      ownerEmail: 'owner@test.com',
      ownerPassword: 'securepass',
      branchName: 'Gulshan',
      currencyCode: 'BDT',
      currencySymbol: '৳',
      vatPercentage: 5,
      serviceChargePercentage: 10,
    })

    expect(result).toEqual({ restaurantId: 'rest-abc' })

    expect(mockFetch).toHaveBeenCalledWith(
      'https://test.supabase.co/functions/v1/provision_restaurant',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer my-token' }),
      }),
    )

    const body = JSON.parse((mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string) as Record<string, unknown>
    expect(body['name']).toBe('My Restaurant')
    expect(body['owner_email']).toBe('owner@test.com')
    expect(body['owner_password']).toBe('securepass')
    expect(body['branch_name']).toBe('Gulshan')
    expect(body['currency_code']).toBe('BDT')
    expect(body['currency_symbol']).toBe('৳')
    expect(body['vat_percentage']).toBe(5)
    expect(body['service_charge_percentage']).toBe(10)
    // slug should be auto-generated from name
    expect(typeof body['slug']).toBe('string')
    expect(body['slug']).toBe('my-restaurant')
  })

  it('throws on non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ success: false, error: 'Slug already taken' }),
          { status: 400 },
        ),
      ),
    )

    const { callProvisionRestaurant: realFn } = await vi.importActual<
      typeof import('../restaurantAdminApi')
    >('../restaurantAdminApi')

    await expect(
      realFn('https://test.supabase.co', 'token', {
        name: 'Test',
        ownerEmail: 'x@x.com',
        ownerPassword: 'password123',
      }),
    ).rejects.toThrow('Slug already taken')
  })
})
