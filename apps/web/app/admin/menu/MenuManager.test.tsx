import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MenuManager, { formatCurrency, generateId } from './MenuManager'
import { fetchMenuAdminData } from './menuAdminData'
import type { MenuAdminData } from './menuAdminData'
import {
  callCreateMenu,
  callUpdateMenu,
  callDeleteMenu,
  callCreateMenuItem,
  callUpdateMenuItem,
  callDeleteMenuItem,
} from './menuAdminApi'

vi.mock('./menuAdminData', () => ({
  fetchMenuAdminData: vi.fn(),
}))

vi.mock('./menuAdminApi', () => ({
  callCreateMenu: vi.fn(),
  callUpdateMenu: vi.fn(),
  callDeleteMenu: vi.fn(),
  callCreateMenuItem: vi.fn(),
  callUpdateMenuItem: vi.fn(),
  callDeleteMenuItem: vi.fn(),
}))

const MOCK_DATA: MenuAdminData = {
  restaurantId: 'rest-1',
  menus: [
    {
      id: 'menu-1',
      name: 'Starters',
      restaurant_id: 'rest-1',
      items: [
        { id: 'item-1', name: 'Soup of the Day', price_cents: 650, modifiers: [] },
        { id: 'item-2', name: 'Garlic Bread', price_cents: 400, modifiers: [] },
      ],
    },
    {
      id: 'menu-2',
      name: 'Mains',
      restaurant_id: 'rest-1',
      items: [
        {
          id: 'item-3',
          name: 'Grilled Chicken',
          price_cents: 1450,
          modifiers: [{ id: 'mod-1', name: 'Extra sauce', price_delta_cents: 50 }],
        },
        { id: 'item-4', name: 'Pasta Carbonara', price_cents: 1200, modifiers: [] },
      ],
    },
    {
      id: 'menu-3',
      name: 'Desserts',
      restaurant_id: 'rest-1',
      items: [
        { id: 'item-5', name: 'Chocolate Fondant', price_cents: 750, modifiers: [] },
      ],
    },
    {
      id: 'menu-4',
      name: 'Drinks',
      restaurant_id: 'rest-1',
      items: [
        {
          id: 'item-6',
          name: 'Espresso',
          price_cents: 250,
          modifiers: [{ id: 'mod-2', name: 'Double shot', price_delta_cents: 70 }],
        },
        { id: 'item-7', name: 'Orange Juice', price_cents: 350, modifiers: [] },
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
  vi.mocked(fetchMenuAdminData).mockResolvedValue(MOCK_DATA)
  vi.mocked(callCreateMenu).mockResolvedValue('new-menu-id')
  vi.mocked(callUpdateMenu).mockResolvedValue(undefined)
  vi.mocked(callDeleteMenu).mockResolvedValue(undefined)
  vi.mocked(callCreateMenuItem).mockResolvedValue('new-item-id')
  vi.mocked(callUpdateMenuItem).mockResolvedValue(undefined)
  vi.mocked(callDeleteMenuItem).mockResolvedValue(undefined)
})

afterEach(() => {
  process.env = originalEnv
  vi.clearAllMocks()
})

describe('formatCurrency', () => {
  it('formats 650 pence as £6.50', () => {
    expect(formatCurrency(650)).toBe('£6.50')
  })

  it('formats 1200 pence as £12.00', () => {
    expect(formatCurrency(1200)).toBe('£12.00')
  })
})

describe('generateId', () => {
  it('returns a non-empty string prefixed with "id-"', () => {
    const id = generateId()
    expect(typeof id).toBe('string')
    expect(id.startsWith('id-')).toBe(true)
    expect(id.length).toBeGreaterThan(4)
  })

  it('returns a unique value on each call', () => {
    const id1 = generateId()
    const id2 = generateId()
    expect(id1).not.toBe(id2)
  })
})

describe('MenuManager', () => {
  describe('loading state', () => {
    it('shows "Loading menu…" while fetching', () => {
      vi.mocked(fetchMenuAdminData).mockImplementation(() => new Promise(() => {}))
      render(<MenuManager />)
      expect(screen.getByText('Loading menu…')).toBeInTheDocument()
    })
  })

  describe('error state', () => {
    it('shows a generic error message when fetching fails', async () => {
      vi.mocked(fetchMenuAdminData).mockRejectedValue(new Error('Network error'))
      render(<MenuManager />)
      expect(await screen.findByText('Unable to load menu data. Please try again.')).toBeInTheDocument()
    })

})

  it('renders the Menu heading', () => {
    render(<MenuManager />)
    expect(screen.getByRole('heading', { name: 'Menu' })).toBeInTheDocument()
  })

  it('renders Add Item and Add Category buttons', () => {
    render(<MenuManager />)
    expect(screen.getByText('+ Add Item')).toBeInTheDocument()
    expect(screen.getByText('+ Add Category')).toBeInTheDocument()
  })

  it('shows initial menu categories after load', async () => {
    render(<MenuManager />)
    expect(await screen.findByRole('heading', { name: 'Starters' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Mains' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Desserts' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Drinks' })).toBeInTheDocument()
  })

  it('shows initial menu items after load', async () => {
    render(<MenuManager />)
    await screen.findByRole('heading', { name: 'Starters' })
    expect(screen.getByText('Soup of the Day')).toBeInTheDocument()
    expect(screen.getByText('Grilled Chicken')).toBeInTheDocument()
  })

  it('formats item prices as currency', async () => {
    render(<MenuManager />)
    await screen.findByRole('heading', { name: 'Starters' })
    expect(screen.getByText('£6.50')).toBeInTheDocument()
    expect(screen.getByText('£14.50')).toBeInTheDocument()
  })

  it('shows Add Item form when Add Item button is clicked', async () => {
    render(<MenuManager />)
    await screen.findByRole('heading', { name: 'Starters' })
    fireEvent.click(screen.getByText('+ Add Item'))
    expect(screen.getByRole('heading', { name: 'New Item' })).toBeInTheDocument()
    expect(screen.getByLabelText(/^Name/)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Price/)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Category/)).toBeInTheDocument()
  })

  it('shows Modifiers section in item form', async () => {
    render(<MenuManager />)
    await screen.findByRole('heading', { name: 'Starters' })
    fireEvent.click(screen.getByText('+ Add Item'))
    expect(screen.getByRole('heading', { name: /Modifiers/ })).toBeInTheDocument()
    expect(screen.getByLabelText('Modifier name')).toBeInTheDocument()
    expect(screen.getByLabelText('Add-on price (£)')).toBeInTheDocument()
    expect(screen.getByText('+ Add')).toBeInTheDocument()
  })

  it('hides Add Item form when Cancel is clicked', async () => {
    render(<MenuManager />)
    await screen.findByRole('heading', { name: 'Starters' })
    fireEvent.click(screen.getByText('+ Add Item'))
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByRole('heading', { name: 'New Item' })).not.toBeInTheDocument()
  })

  it('shows Add Category form when Add Category button is clicked', async () => {
    render(<MenuManager />)
    await screen.findByRole('heading', { name: 'Starters' })
    fireEvent.click(screen.getByText('+ Add Category'))
    expect(screen.getByRole('heading', { name: 'New Category' })).toBeInTheDocument()
    expect(screen.getByLabelText(/Category Name/)).toBeInTheDocument()
  })

  it('validates required name field on Add Item submit', async () => {
    render(<MenuManager />)
    await screen.findByRole('heading', { name: 'Starters' })
    fireEvent.click(screen.getByText('+ Add Item'))
    fireEvent.click(screen.getByText('Add Item'))
    expect(screen.getByText('Name is required')).toBeInTheDocument()
  })

  it('validates required price field on Add Item submit', async () => {
    render(<MenuManager />)
    await screen.findByRole('heading', { name: 'Starters' })
    fireEvent.click(screen.getByText('+ Add Item'))
    fireEvent.click(screen.getByText('Add Item'))
    expect(screen.getByText('Price is required')).toBeInTheDocument()
  })

  it('validates required category field on Add Item submit', async () => {
    render(<MenuManager />)
    await screen.findByRole('heading', { name: 'Starters' })
    fireEvent.click(screen.getByText('+ Add Item'))
    fireEvent.click(screen.getByText('Add Item'))
    expect(screen.getByText('Category is required')).toBeInTheDocument()
  })

  it('validates required category name on Add Category submit', async () => {
    render(<MenuManager />)
    await screen.findByRole('heading', { name: 'Starters' })
    fireEvent.click(screen.getByText('+ Add Category'))
    fireEvent.click(screen.getByText('Save Category'))
    expect(screen.getByText('Category name is required')).toBeInTheDocument()
  })

  it('adds a new item and shows success feedback', async () => {
    render(<MenuManager />)
    await screen.findByRole('heading', { name: 'Starters' })
    fireEvent.click(screen.getByText('+ Add Item'))
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Caesar Salad' } })
    fireEvent.change(screen.getByLabelText(/^Price/), { target: { value: '8.50' } })
    fireEvent.change(screen.getByLabelText(/^Category/), { target: { value: 'menu-1' } })
    await userEvent.click(screen.getByText('Add Item'))
    expect(await screen.findByText('Caesar Salad')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('"Caesar Salad" added successfully.')
  })

  it('adds a new category and shows success feedback', async () => {
    render(<MenuManager />)
    await screen.findByRole('heading', { name: 'Starters' })
    fireEvent.click(screen.getByText('+ Add Category'))
    fireEvent.change(screen.getByLabelText(/Category Name/), { target: { value: 'Specials' } })
    await userEvent.click(screen.getByText('Save Category'))
    expect(await screen.findByRole('heading', { name: 'Specials' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Category "Specials" added.')
  })

  it('opens edit form pre-filled when Edit button is clicked on an item', async () => {
    render(<MenuManager />)
    await screen.findByRole('heading', { name: 'Starters' })
    fireEvent.click(screen.getByRole('button', { name: 'Edit Soup of the Day' }))
    expect(screen.getByRole('heading', { name: 'Edit Item' })).toBeInTheDocument()
    const nameInput = screen.getByLabelText(/^Name/) as HTMLInputElement
    expect(nameInput.value).toBe('Soup of the Day')
  })

  it('saves edited item and shows success feedback', async () => {
    render(<MenuManager />)
    await screen.findByRole('heading', { name: 'Starters' })
    fireEvent.click(screen.getByRole('button', { name: 'Edit Soup of the Day' }))
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Updated Soup' } })
    await userEvent.click(screen.getByText('Save Changes'))
    expect(await screen.findByText('Updated Soup')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('"Updated Soup" updated successfully.')
  })

  it('edit form loads existing modifiers for an item', async () => {
    render(<MenuManager />)
    await screen.findByRole('heading', { name: 'Mains' })
    fireEvent.click(screen.getByRole('button', { name: 'Edit Grilled Chicken' }))
    expect(screen.getByText('Extra sauce')).toBeInTheDocument()
  })

  it('shows delete confirmation when Delete button is clicked on an item', async () => {
    render(<MenuManager />)
    await screen.findByRole('heading', { name: 'Starters' })
    fireEvent.click(screen.getByRole('button', { name: 'Delete Soup of the Day' }))
    expect(screen.getByText('Delete?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm delete Soup of the Day' })).toBeInTheDocument()
  })

  it('cancels item delete when No is clicked', async () => {
    render(<MenuManager />)
    await screen.findByRole('heading', { name: 'Starters' })
    fireEvent.click(screen.getByRole('button', { name: 'Delete Soup of the Day' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel delete' }))
    expect(screen.queryByText('Delete?')).not.toBeInTheDocument()
  })

  it('deletes item and shows success feedback when Yes is clicked', async () => {
    render(<MenuManager />)
    await screen.findByRole('heading', { name: 'Starters' })
    expect(screen.getByText('Soup of the Day')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete Soup of the Day' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm delete Soup of the Day' }))
    expect(await screen.findByRole('status')).toHaveTextContent('"Soup of the Day" deleted.')
    expect(screen.queryByText('Soup of the Day')).not.toBeInTheDocument()
  })

  it('validates modifier name before adding', async () => {
    render(<MenuManager />)
    await screen.findByRole('heading', { name: 'Starters' })
    fireEvent.click(screen.getByText('+ Add Item'))
    fireEvent.click(screen.getByText('+ Add'))
    expect(screen.getByText('Modifier name is required')).toBeInTheDocument()
  })

  it('adds a modifier to the item form', async () => {
    render(<MenuManager />)
    await screen.findByRole('heading', { name: 'Starters' })
    fireEvent.click(screen.getByText('+ Add Item'))
    fireEvent.change(screen.getByLabelText('Modifier name'), { target: { value: 'Extra cheese' } })
    fireEvent.change(screen.getByLabelText('Add-on price (£)'), { target: { value: '1.00' } })
    fireEvent.click(screen.getByText('+ Add'))
    expect(screen.getByText('Extra cheese')).toBeInTheDocument()
    expect(screen.getByText('+£1.00')).toBeInTheDocument()
  })

  it('shows Free label for a zero-price modifier', async () => {
    render(<MenuManager />)
    await screen.findByRole('heading', { name: 'Starters' })
    fireEvent.click(screen.getByText('+ Add Item'))
    fireEvent.change(screen.getByLabelText('Modifier name'), { target: { value: 'No onion' } })
    fireEvent.click(screen.getByText('+ Add'))
    expect(screen.getByText('Free')).toBeInTheDocument()
  })

  it('removes a modifier from the item form', async () => {
    render(<MenuManager />)
    await screen.findByRole('heading', { name: 'Starters' })
    fireEvent.click(screen.getByText('+ Add Item'))
    fireEvent.change(screen.getByLabelText('Modifier name'), { target: { value: 'Extra cheese' } })
    fireEvent.click(screen.getByText('+ Add'))
    fireEvent.click(screen.getByRole('button', { name: 'Remove modifier Extra cheese' }))
    expect(screen.queryByText('Extra cheese')).not.toBeInTheDocument()
  })

  it('saves modifiers when adding a new item', async () => {
    render(<MenuManager />)
    await screen.findByRole('heading', { name: 'Starters' })
    fireEvent.click(screen.getByText('+ Add Item'))
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Test Dish' } })
    fireEvent.change(screen.getByLabelText(/^Price/), { target: { value: '10.00' } })
    fireEvent.change(screen.getByLabelText(/^Category/), { target: { value: 'menu-1' } })
    fireEvent.change(screen.getByLabelText('Modifier name'), { target: { value: 'Spicy' } })
    fireEvent.click(screen.getByText('+ Add'))
    await userEvent.click(screen.getByText('Add Item'))
    // Open edit form for newly added item (uses returned id 'new-item-id')
    expect(await screen.findByText('Test Dish')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Test Dish' }))
    expect(screen.getByText('Spicy')).toBeInTheDocument()
  })

  it('shows category Edit and Delete buttons', async () => {
    render(<MenuManager />)
    await screen.findByRole('heading', { name: 'Starters' })
    expect(screen.getByRole('button', { name: 'Edit category Starters' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete category Starters' })).toBeInTheDocument()
  })

  it('shows inline edit input when category Edit is clicked', async () => {
    render(<MenuManager />)
    await screen.findByRole('heading', { name: 'Starters' })
    fireEvent.click(screen.getByRole('button', { name: 'Edit category Starters' }))
    const input = screen.getByRole('textbox', { name: 'Edit category name' }) as HTMLInputElement
    expect(input.value).toBe('Starters')
  })

  it('renames a category and shows success feedback', async () => {
    render(<MenuManager />)
    await screen.findByRole('heading', { name: 'Starters' })
    fireEvent.click(screen.getByRole('button', { name: 'Edit category Starters' }))
    const input = screen.getByRole('textbox', { name: 'Edit category name' })
    fireEvent.change(input, { target: { value: 'Appetisers' } })
    await userEvent.click(screen.getByText('Save'))
    expect(await screen.findByRole('heading', { name: 'Appetisers' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Category renamed to "Appetisers".')
  })

  it('validates empty name on category rename', async () => {
    render(<MenuManager />)
    await screen.findByRole('heading', { name: 'Starters' })
    fireEvent.click(screen.getByRole('button', { name: 'Edit category Starters' }))
    const input = screen.getByRole('textbox', { name: 'Edit category name' })
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.click(screen.getByText('Save'))
    expect(screen.getByText('Category name is required')).toBeInTheDocument()
  })

  it('cancels category rename', async () => {
    render(<MenuManager />)
    await screen.findByRole('heading', { name: 'Starters' })
    fireEvent.click(screen.getByRole('button', { name: 'Edit category Starters' }))
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.getByRole('heading', { name: 'Starters' })).toBeInTheDocument()
  })

  it('shows category delete confirmation when Delete category button is clicked', async () => {
    render(<MenuManager />)
    await screen.findByRole('heading', { name: 'Desserts' })
    fireEvent.click(screen.getByRole('button', { name: 'Delete category Desserts' }))
    expect(screen.getByText('Delete category?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm delete category Desserts' })).toBeInTheDocument()
  })

  it('cancels category delete', async () => {
    render(<MenuManager />)
    await screen.findByRole('heading', { name: 'Desserts' })
    fireEvent.click(screen.getByRole('button', { name: 'Delete category Desserts' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel delete category' }))
    expect(screen.queryByText('Delete category?')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Desserts' })).toBeInTheDocument()
  })

  it('deletes an empty category and shows success feedback', async () => {
    // Remove all items from Desserts first in mock data
    vi.mocked(fetchMenuAdminData).mockResolvedValue({
      ...MOCK_DATA,
      menus: MOCK_DATA.menus.map((m) =>
        m.id === 'menu-3' ? { ...m, items: [] } : m,
      ),
    })
    render(<MenuManager />)
    await screen.findByRole('heading', { name: 'Desserts' })
    fireEvent.click(screen.getByRole('button', { name: 'Delete category Desserts' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm delete category Desserts' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Category "Desserts" deleted.')
    expect(screen.queryByRole('heading', { name: 'Desserts' })).not.toBeInTheDocument()
  })

  it('blocks deleting a category that has items and shows error', async () => {
    render(<MenuManager />)
    await screen.findByRole('heading', { name: 'Starters' })
    fireEvent.click(screen.getByRole('button', { name: 'Delete category Starters' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm delete category Starters' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Remove all items in this category before deleting it.',
    )
    expect(screen.getByRole('heading', { name: 'Starters' })).toBeInTheDocument()
  })

  it('Add Item button touch targets meet 48px minimum', () => {
    render(<MenuManager />)
    const addItemBtn = screen.getByText('+ Add Item')
    expect(addItemBtn.className).toContain('min-h-[48px]')
  })

  it('item Edit buttons meet 48px touch target minimum', async () => {
    render(<MenuManager />)
    await screen.findByRole('heading', { name: 'Starters' })
    const editBtn = screen.getByRole('button', { name: 'Edit Soup of the Day' })
    expect(editBtn.className).toContain('min-h-[48px]')
  })

  it('item Delete buttons meet 48px touch target minimum', async () => {
    render(<MenuManager />)
    await screen.findByRole('heading', { name: 'Starters' })
    const deleteBtn = screen.getByRole('button', { name: 'Delete Soup of the Day' })
    expect(deleteBtn.className).toContain('min-h-[48px]')
  })
})
