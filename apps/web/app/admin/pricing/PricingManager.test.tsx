import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import PricingManager, { formatCurrency, computePreviewCents } from './PricingManager'
import { fetchPricingAdminData } from './pricingAdminData'
import type { PricingAdminData } from './pricingAdminData'
import {
  callCreateVatRate,
  callUpdateVatRate,
  callDeleteVatRate,
  callUpdateItemPrice,
  callUpsertConfig,
} from './pricingAdminApi'

vi.mock('./pricingAdminData', () => ({
  fetchPricingAdminData: vi.fn(),
}))

vi.mock('./pricingAdminApi', () => ({
  callCreateVatRate: vi.fn(),
  callUpdateVatRate: vi.fn(),
  callDeleteVatRate: vi.fn(),
  callUpdateItemPrice: vi.fn(),
  callUpsertConfig: vi.fn(),
}))

const MOCK_DATA: PricingAdminData = {
  restaurantId: 'rest-1',
  taxInclusive: false,
  vatRates: [
    { id: 'vat-1', restaurant_id: 'rest-1', label: 'Standard 20%', percentage: 20, menu_id: 'menu-1' },
    { id: 'vat-2', restaurant_id: 'rest-1', label: 'Reduced 5%', percentage: 5, menu_id: null },
  ],
  categories: [
    {
      id: 'menu-1',
      name: 'Starters',
      items: [
        { id: 'item-1', name: 'Soup of the Day', price_cents: 650 },
        { id: 'item-2', name: 'Garlic Bread', price_cents: 400 },
      ],
    },
    {
      id: 'menu-2',
      name: 'Drinks',
      items: [
        { id: 'item-3', name: 'Orange Juice', price_cents: 300 },
      ],
    },
  ],
}

const originalEnv = process.env

beforeEach(() => {
  process.env = {
    ...originalEnv,
    NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-key',
  }
  vi.mocked(fetchPricingAdminData).mockResolvedValue(MOCK_DATA)
  vi.mocked(callCreateVatRate).mockResolvedValue('vat-new')
  vi.mocked(callUpdateVatRate).mockResolvedValue(undefined)
  vi.mocked(callDeleteVatRate).mockResolvedValue(undefined)
  vi.mocked(callUpdateItemPrice).mockResolvedValue(undefined)
  vi.mocked(callUpsertConfig).mockResolvedValue(undefined)
})

afterEach(() => {
  process.env = originalEnv
  vi.clearAllMocks()
})

describe('formatCurrency', () => {
  it('formats pence to GBP currency string', () => {
    expect(formatCurrency(650)).toBe('£6.50')
    expect(formatCurrency(0)).toBe('£0.00')
    expect(formatCurrency(1000)).toBe('£10.00')
  })
})

describe('computePreviewCents', () => {
  it('returns base price when tax-inclusive', () => {
    expect(computePreviewCents(1000, 20, true)).toBe(1000)
  })

  it('adds VAT on top when tax-exclusive', () => {
    expect(computePreviewCents(1000, 20, false)).toBe(1200)
  })

  it('rounds correctly for fractional cents', () => {
    expect(computePreviewCents(100, 20, false)).toBe(120)
    expect(computePreviewCents(333, 10, false)).toBe(366)
  })
})

describe('PricingManager', () => {
  it('shows loading state initially', () => {
    vi.mocked(fetchPricingAdminData).mockReturnValue(new Promise(() => {}))
    render(<PricingManager />)
    expect(screen.getByText(/Loading pricing data/i)).toBeInTheDocument()
  })

  it('shows error state when fetch fails', async () => {
    vi.mocked(fetchPricingAdminData).mockRejectedValue(new Error('Network error'))
    render(<PricingManager />)
    await waitFor(() => {
      expect(screen.getByText(/Unable to load pricing data/i)).toBeInTheDocument()
    })
  })

  it('renders VAT rates and items after load', async () => {
    render(<PricingManager />)
    await waitFor(() => {
      expect(screen.getByText('Standard 20%')).toBeInTheDocument()
      expect(screen.getByText('Reduced 5%')).toBeInTheDocument()
      expect(screen.getByText('Soup of the Day')).toBeInTheDocument()
      expect(screen.getByText('Garlic Bread')).toBeInTheDocument()
      expect(screen.getByText('Orange Juice')).toBeInTheDocument()
    })
  })

  it('shows tax-exclusive price preview for items', async () => {
    render(<PricingManager />)
    await waitFor(() => {
      // Soup: £6.50 base, 20% VAT → £7.80 final
      expect(screen.getByText('£7.80')).toBeInTheDocument()
    })
  })

  it('toggles tax mode and updates config', async () => {
    render(<PricingManager />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Tax-exclusive/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Tax-exclusive/i }))

    await waitFor(() => {
      expect(callUpsertConfig).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'test-key',
        'rest-1',
        'tax_inclusive',
        'true',
      )
    })
  })

  it('opens add VAT rate form when button clicked', async () => {
    render(<PricingManager />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /\+ Add VAT Rate/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /\+ Add VAT Rate/i }))

    expect(screen.getByRole('heading', { name: /New VAT Rate/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/Label/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Percentage/i)).toBeInTheDocument()
  })

  it('validates add VAT rate form — requires label and percentage', async () => {
    render(<PricingManager />)
    await waitFor(() => {
      fireEvent.click(screen.getByRole('button', { name: /\+ Add VAT Rate/i }))
    })

    fireEvent.click(screen.getByRole('button', { name: /Save VAT Rate/i }))

    expect(screen.getByText(/Label is required/i)).toBeInTheDocument()
    expect(screen.getByText(/Percentage is required/i)).toBeInTheDocument()
    expect(callCreateVatRate).not.toHaveBeenCalled()
  })

  it('creates a VAT rate and closes the form', async () => {
    render(<PricingManager />)
    await waitFor(() => {
      fireEvent.click(screen.getByRole('button', { name: /\+ Add VAT Rate/i }))
    })

    fireEvent.change(screen.getByLabelText(/^Label/i), { target: { value: 'Zero Rate 0%' } })
    fireEvent.change(screen.getByLabelText(/Percentage/i), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: /Save VAT Rate/i }))

    await waitFor(() => {
      expect(callCreateVatRate).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'test-key',
        'rest-1',
        'Zero Rate 0%',
        0,
        null,
      )
    })

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /New VAT Rate/i })).not.toBeInTheDocument()
    })
  })

  it('opens edit VAT rate form pre-filled', async () => {
    render(<PricingManager />)
    await waitFor(() => {
      expect(screen.getByText('Standard 20%')).toBeInTheDocument()
    })

    const editButtons = screen.getAllByRole('button', { name: /Edit VAT rate/i })
    fireEvent.click(editButtons[0])

    const labelInput = screen.getByDisplayValue('Standard 20%')
    expect(labelInput).toBeInTheDocument()
    expect(screen.getByDisplayValue('20')).toBeInTheDocument()
  })

  it('disables delete button for VAT rate assigned to category with items', async () => {
    render(<PricingManager />)
    await waitFor(() => {
      expect(screen.getByText('Standard 20%')).toBeInTheDocument()
    })

    // vat-1 is assigned to menu-1 (Starters) which has items → delete disabled
    const deleteButtons = screen.getAllByRole('button', { name: /Delete VAT rate/i })
    expect(deleteButtons[0]).toBeDisabled()
  })

  it('enables delete button for unassigned VAT rate', async () => {
    render(<PricingManager />)
    await waitFor(() => {
      expect(screen.getByText('Reduced 5%')).toBeInTheDocument()
    })

    // vat-2 is unassigned → delete enabled
    const deleteButtons = screen.getAllByRole('button', { name: /Delete VAT rate/i })
    expect(deleteButtons[1]).not.toBeDisabled()
  })

  it('shows confirm prompt and deletes a VAT rate', async () => {
    render(<PricingManager />)
    await waitFor(() => {
      expect(screen.getByText('Reduced 5%')).toBeInTheDocument()
    })

    const deleteButtons = screen.getAllByRole('button', { name: /Delete VAT rate/i })
    fireEvent.click(deleteButtons[1])

    expect(screen.getByText(/Delete\?/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Confirm delete VAT rate Reduced 5%/i }))

    await waitFor(() => {
      expect(callDeleteVatRate).toHaveBeenCalledWith('https://test.supabase.co', 'test-key', 'vat-2')
    })
  })

  it('opens item edit form pre-filled with price and VAT rate', async () => {
    render(<PricingManager />)
    await waitFor(() => {
      expect(screen.getByText('Soup of the Day')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Edit pricing for Soup of the Day/i }))

    expect(screen.getByDisplayValue('6.50')).toBeInTheDocument()
  })

  it('validates item edit form — requires valid price', async () => {
    render(<PricingManager />)
    await waitFor(() => {
      fireEvent.click(screen.getByRole('button', { name: /Edit pricing for Soup of the Day/i }))
    })

    const priceInput = screen.getByDisplayValue('6.50')
    fireEvent.change(priceInput, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }))

    expect(screen.getByText(/Enter a valid price/i)).toBeInTheDocument()
    expect(callUpdateItemPrice).not.toHaveBeenCalled()
  })

  it('saves item price edit', async () => {
    render(<PricingManager />)
    await waitFor(() => {
      fireEvent.click(screen.getByRole('button', { name: /Edit pricing for Soup of the Day/i }))
    })

    const priceInput = screen.getByDisplayValue('6.50')
    fireEvent.change(priceInput, { target: { value: '7.00' } })
    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }))

    await waitFor(() => {
      expect(callUpdateItemPrice).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'test-key',
        'item-1',
        700,
      )
    })
  })

  it('cancels item edit and closes form', async () => {
    render(<PricingManager />)
    await waitFor(() => {
      fireEvent.click(screen.getByRole('button', { name: /Edit pricing for Soup of the Day/i }))
    })

    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }))

    expect(screen.queryByDisplayValue('6.50')).not.toBeInTheDocument()
  })
})
