import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import MenuItemFormPage from './MenuItemFormPage'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

// Mock data fetching
vi.mock('./menuAdminData', () => ({
  fetchMenuAdminData: vi.fn().mockResolvedValue({
    restaurantId: 'rest-1',
    menus: [
      { id: 'menu-1', name: 'Starters', restaurant_id: 'rest-1', items: [] },
      { id: 'menu-2', name: 'Mains', restaurant_id: 'rest-1', items: [] },
    ],
  }),
}))

// Mock API calls
vi.mock('./menuAdminApi', () => ({
  callCreateMenuItem: vi.fn().mockResolvedValue('new-item-id'),
  callUpdateMenuItem: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./extractMenuItemApi', () => ({
  callExtractMenuItem: vi.fn().mockResolvedValue({
    name: 'Extracted Name',
    description: 'Extracted description',
    price: 9.99,
    category: 'Starters',
  }),
  uploadMenuFile: vi.fn().mockResolvedValue('https://example.com/uploaded.jpg'),
  fileToBase64: vi.fn().mockResolvedValue('base64data'),
}))

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-key'
})

describe('MenuItemFormPage – new mode', () => {
  it('renders the new item form after loading', async () => {
    render(<MenuItemFormPage mode="new" />)
    expect(screen.getByText('Loading…')).toBeDefined()

    await waitFor(() => {
      expect(screen.getByText('New Item')).toBeDefined()
    })

    expect(screen.getByLabelText(/Name/)).toBeDefined()
    expect(screen.getByLabelText(/Description/)).toBeDefined()
    expect(screen.getByLabelText(/Price/)).toBeDefined()
    expect(screen.getByLabelText(/Category/)).toBeDefined()
  })

  it('renders upload zone', async () => {
    render(<MenuItemFormPage mode="new" />)
    await waitFor(() => screen.getByText('New Item'))
    expect(screen.getByText(/Upload Image or PDF/)).toBeDefined()
    expect(screen.getByText('Drag and drop or click to upload')).toBeDefined()
  })

  it('shows validation errors when saving with empty form', async () => {
    render(<MenuItemFormPage mode="new" />)
    await waitFor(() => screen.getByText('New Item'))

    fireEvent.click(screen.getByText('Save Item'))

    await waitFor(() => {
      expect(screen.getByText('Name is required')).toBeDefined()
      expect(screen.getByText('Price is required')).toBeDefined()
      expect(screen.getByText('Category is required')).toBeDefined()
    })
  })

  it('populates category options from menus', async () => {
    render(<MenuItemFormPage mode="new" />)
    await waitFor(() => screen.getByText('New Item'))

    const select = screen.getByLabelText(/Category/) as HTMLSelectElement
    const options = Array.from(select.options).map((o) => o.text)
    expect(options).toContain('Starters')
    expect(options).toContain('Mains')
  })
})

describe('MenuItemFormPage – modifier management', () => {
  it('adds a modifier to the form', async () => {
    render(<MenuItemFormPage mode="new" />)
    await waitFor(() => screen.getByText('New Item'))

    fireEvent.change(screen.getByLabelText('Modifier name'), { target: { value: 'Extra sauce' } })
    fireEvent.change(screen.getByLabelText('Add-on (£)'), { target: { value: '1.50' } })
    fireEvent.click(screen.getByText('+ Add'))

    expect(screen.getByText('Extra sauce')).toBeDefined()
    expect(screen.getByText('+£1.50')).toBeDefined()
  })

  it('shows Free label for zero-price modifier', async () => {
    render(<MenuItemFormPage mode="new" />)
    await waitFor(() => screen.getByText('New Item'))

    fireEvent.change(screen.getByLabelText('Modifier name'), { target: { value: 'No onion' } })
    fireEvent.click(screen.getByText('+ Add'))

    expect(screen.getByText('Free')).toBeDefined()
  })

  it('shows validation error when adding modifier without a name', async () => {
    render(<MenuItemFormPage mode="new" />)
    await waitFor(() => screen.getByText('New Item'))

    fireEvent.click(screen.getByText('+ Add'))

    expect(screen.getByText('Modifier name is required')).toBeDefined()
  })

  it('removes a modifier from the form', async () => {
    render(<MenuItemFormPage mode="new" />)
    await waitFor(() => screen.getByText('New Item'))

    fireEvent.change(screen.getByLabelText('Modifier name'), { target: { value: 'Extra cheese' } })
    fireEvent.click(screen.getByText('+ Add'))
    expect(screen.getByText('Extra cheese')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Remove modifier Extra cheese' }))
    expect(screen.queryByText('Extra cheese')).toBeNull()
  })
})

describe('MenuItemFormPage – edit mode', () => {
  beforeEach(() => {
    // Mock fetch for item data
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            id: 'item-1',
            name: 'Existing Item',
            description: 'Existing description',
            price_cents: 1250,
            image_url: 'https://example.com/img.jpg',
            menu_id: 'menu-1',
            modifiers: [{ id: 'mod-1', name: 'Extra cheese', price_delta_cents: 100 }],
          },
        ]),
    })
  })

  it('pre-fills form with existing item data', async () => {
    render(<MenuItemFormPage mode="edit" itemId="item-1" />)
    await waitFor(() => screen.getByText('Edit Item'))

    await waitFor(() => {
      const nameInput = screen.getByLabelText(/Name/) as HTMLInputElement
      expect(nameInput.value).toBe('Existing Item')
    })

    const priceInput = screen.getByLabelText(/Price/) as HTMLInputElement
    expect(priceInput.value).toBe('12.50')
  })
})
