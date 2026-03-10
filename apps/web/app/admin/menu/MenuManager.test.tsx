import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MenuManager, { formatCurrency } from './MenuManager'

describe('formatCurrency', () => {
  it('formats 6.5 as £6.50', () => {
    expect(formatCurrency(6.5)).toBe('£6.50')
  })

  it('formats 12 as £12.00', () => {
    expect(formatCurrency(12)).toBe('£12.00')
  })
})

describe('MenuManager', () => {
  it('renders the Menu heading', () => {
    render(<MenuManager />)
    expect(screen.getByRole('heading', { name: 'Menu' })).toBeInTheDocument()
  })

  it('renders Add Item and Add Category buttons', () => {
    render(<MenuManager />)
    expect(screen.getByText('+ Add Item')).toBeInTheDocument()
    expect(screen.getByText('+ Add Category')).toBeInTheDocument()
  })

  it('shows initial menu categories', () => {
    render(<MenuManager />)
    expect(screen.getByRole('heading', { name: 'Starters' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Mains' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Desserts' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Drinks' })).toBeInTheDocument()
  })

  it('shows initial menu items', () => {
    render(<MenuManager />)
    expect(screen.getByText('Soup of the Day')).toBeInTheDocument()
    expect(screen.getByText('Grilled Chicken')).toBeInTheDocument()
  })

  it('formats item prices as currency', () => {
    render(<MenuManager />)
    expect(screen.getByText('£6.50')).toBeInTheDocument()
    expect(screen.getByText('£14.50')).toBeInTheDocument()
  })

  it('shows Add Item form when Add Item button is clicked', () => {
    render(<MenuManager />)
    fireEvent.click(screen.getByText('+ Add Item'))
    expect(screen.getByRole('heading', { name: 'New Item' })).toBeInTheDocument()
    expect(screen.getByLabelText(/^Name/)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Price/)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Category/)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Description/)).toBeInTheDocument()
  })

  it('shows Modifiers section in item form', () => {
    render(<MenuManager />)
    fireEvent.click(screen.getByText('+ Add Item'))
    expect(screen.getByRole('heading', { name: /Modifiers/ })).toBeInTheDocument()
    expect(screen.getByLabelText('Modifier name')).toBeInTheDocument()
    expect(screen.getByLabelText('Add-on price (£)')).toBeInTheDocument()
    expect(screen.getByText('+ Add')).toBeInTheDocument()
  })

  it('hides Add Item form when Cancel is clicked', () => {
    render(<MenuManager />)
    fireEvent.click(screen.getByText('+ Add Item'))
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByRole('heading', { name: 'New Item' })).not.toBeInTheDocument()
  })

  it('shows Add Category form when Add Category button is clicked', () => {
    render(<MenuManager />)
    fireEvent.click(screen.getByText('+ Add Category'))
    expect(screen.getByRole('heading', { name: 'New Category' })).toBeInTheDocument()
    expect(screen.getByLabelText(/Category Name/)).toBeInTheDocument()
  })

  it('validates required name field on Add Item submit', () => {
    render(<MenuManager />)
    fireEvent.click(screen.getByText('+ Add Item'))
    fireEvent.click(screen.getByText('Add Item'))
    expect(screen.getByText('Name is required')).toBeInTheDocument()
  })

  it('validates required price field on Add Item submit', () => {
    render(<MenuManager />)
    fireEvent.click(screen.getByText('+ Add Item'))
    fireEvent.click(screen.getByText('Add Item'))
    expect(screen.getByText('Price is required')).toBeInTheDocument()
  })

  it('validates required category field on Add Item submit', () => {
    render(<MenuManager />)
    fireEvent.click(screen.getByText('+ Add Item'))
    fireEvent.click(screen.getByText('Add Item'))
    expect(screen.getByText('Category is required')).toBeInTheDocument()
  })

  it('validates required category name on Add Category submit', () => {
    render(<MenuManager />)
    fireEvent.click(screen.getByText('+ Add Category'))
    fireEvent.click(screen.getByText('Save Category'))
    expect(screen.getByText('Category name is required')).toBeInTheDocument()
  })

  it('adds a new item and shows success feedback', () => {
    render(<MenuManager />)
    fireEvent.click(screen.getByText('+ Add Item'))
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Caesar Salad' } })
    fireEvent.change(screen.getByLabelText(/^Price/), { target: { value: '8.50' } })
    const select = screen.getByLabelText(/^Category/)
    fireEvent.change(select, { target: { value: 'cat-1' } })
    fireEvent.click(screen.getByText('Add Item'))
    expect(screen.getByText('Caesar Salad')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('"Caesar Salad" added successfully.')
  })

  it('adds a new category and shows success feedback', () => {
    render(<MenuManager />)
    fireEvent.click(screen.getByText('+ Add Category'))
    fireEvent.change(screen.getByLabelText(/Category Name/), { target: { value: 'Specials' } })
    fireEvent.click(screen.getByText('Save Category'))
    expect(screen.getByRole('heading', { name: 'Specials' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Category "Specials" added.')
  })

  it('opens edit form pre-filled when Edit button is clicked on an item', () => {
    render(<MenuManager />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit Soup of the Day' }))
    expect(screen.getByRole('heading', { name: 'Edit Item' })).toBeInTheDocument()
    const nameInput = screen.getByLabelText(/^Name/) as HTMLInputElement
    expect(nameInput.value).toBe('Soup of the Day')
  })

  it('saves edited item and shows success feedback', () => {
    render(<MenuManager />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit Soup of the Day' }))
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Updated Soup' } })
    fireEvent.click(screen.getByText('Save Changes'))
    expect(screen.getByText('Updated Soup')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('"Updated Soup" updated successfully.')
  })

  it('edit form loads existing modifiers for an item', () => {
    render(<MenuManager />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit Grilled Chicken' }))
    expect(screen.getByText('Extra sauce')).toBeInTheDocument()
  })

  it('shows delete confirmation when Delete button is clicked on an item', () => {
    render(<MenuManager />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete Soup of the Day' }))
    expect(screen.getByText('Delete?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm delete Soup of the Day' })).toBeInTheDocument()
  })

  it('cancels item delete when No is clicked', () => {
    render(<MenuManager />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete Soup of the Day' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel delete' }))
    expect(screen.queryByText('Delete?')).not.toBeInTheDocument()
  })

  it('deletes item and shows success feedback when Yes is clicked', () => {
    render(<MenuManager />)
    expect(screen.getByText('Soup of the Day')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete Soup of the Day' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete Soup of the Day' }))
    expect(screen.queryByText('Soup of the Day')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('"Soup of the Day" deleted.')
  })

  it('validates modifier name before adding', () => {
    render(<MenuManager />)
    fireEvent.click(screen.getByText('+ Add Item'))
    fireEvent.click(screen.getByText('+ Add'))
    expect(screen.getByText('Modifier name is required')).toBeInTheDocument()
  })

  it('adds a modifier to the item form', () => {
    render(<MenuManager />)
    fireEvent.click(screen.getByText('+ Add Item'))
    fireEvent.change(screen.getByLabelText('Modifier name'), { target: { value: 'Extra cheese' } })
    fireEvent.change(screen.getByLabelText('Add-on price (£)'), { target: { value: '1.00' } })
    fireEvent.click(screen.getByText('+ Add'))
    expect(screen.getByText('Extra cheese')).toBeInTheDocument()
    expect(screen.getByText('+£1.00')).toBeInTheDocument()
  })

  it('shows Free label for a zero-price modifier', () => {
    render(<MenuManager />)
    fireEvent.click(screen.getByText('+ Add Item'))
    fireEvent.change(screen.getByLabelText('Modifier name'), { target: { value: 'No onion' } })
    fireEvent.click(screen.getByText('+ Add'))
    expect(screen.getByText('Free')).toBeInTheDocument()
  })

  it('removes a modifier from the item form', () => {
    render(<MenuManager />)
    fireEvent.click(screen.getByText('+ Add Item'))
    fireEvent.change(screen.getByLabelText('Modifier name'), { target: { value: 'Extra cheese' } })
    fireEvent.click(screen.getByText('+ Add'))
    fireEvent.click(screen.getByRole('button', { name: 'Remove modifier Extra cheese' }))
    expect(screen.queryByText('Extra cheese')).not.toBeInTheDocument()
  })

  it('saves modifiers when adding a new item', () => {
    render(<MenuManager />)
    fireEvent.click(screen.getByText('+ Add Item'))
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Test Dish' } })
    fireEvent.change(screen.getByLabelText(/^Price/), { target: { value: '10.00' } })
    fireEvent.change(screen.getByLabelText(/^Category/), { target: { value: 'cat-1' } })
    fireEvent.change(screen.getByLabelText('Modifier name'), { target: { value: 'Spicy' } })
    fireEvent.click(screen.getByText('+ Add'))
    fireEvent.click(screen.getByText('Add Item'))
    fireEvent.click(screen.getByRole('button', { name: 'Edit Test Dish' }))
    expect(screen.getByText('Spicy')).toBeInTheDocument()
  })

  it('shows category Edit and Delete buttons', () => {
    render(<MenuManager />)
    expect(screen.getByRole('button', { name: 'Edit category Starters' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete category Starters' })).toBeInTheDocument()
  })

  it('shows inline edit input when category Edit is clicked', () => {
    render(<MenuManager />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit category Starters' }))
    const input = screen.getByRole('textbox', { name: 'Edit category name' }) as HTMLInputElement
    expect(input.value).toBe('Starters')
  })

  it('renames a category and shows success feedback', () => {
    render(<MenuManager />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit category Starters' }))
    const input = screen.getByRole('textbox', { name: 'Edit category name' })
    fireEvent.change(input, { target: { value: 'Appetisers' } })
    fireEvent.click(screen.getByText('Save'))
    expect(screen.getByRole('heading', { name: 'Appetisers' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Category renamed to "Appetisers".')
  })

  it('validates empty name on category rename', () => {
    render(<MenuManager />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit category Starters' }))
    const input = screen.getByRole('textbox', { name: 'Edit category name' })
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.click(screen.getByText('Save'))
    expect(screen.getByText('Category name is required')).toBeInTheDocument()
  })

  it('cancels category rename', () => {
    render(<MenuManager />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit category Starters' }))
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.getByRole('heading', { name: 'Starters' })).toBeInTheDocument()
  })

  it('shows category delete confirmation when Delete category button is clicked', () => {
    render(<MenuManager />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete category Desserts' }))
    expect(screen.getByText('Delete category?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm delete category Desserts' })).toBeInTheDocument()
  })

  it('cancels category delete', () => {
    render(<MenuManager />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete category Desserts' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel delete category' }))
    expect(screen.queryByText('Delete category?')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Desserts' })).toBeInTheDocument()
  })

  it('deletes an empty category and shows success feedback', () => {
    render(<MenuManager />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete category Desserts' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete category Desserts' }))
    expect(screen.queryByRole('heading', { name: 'Desserts' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Category "Desserts" deleted.')
  })

  it('blocks deleting a category that has items and shows error', () => {
    render(<MenuManager />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete category Starters' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete category Starters' }))
    expect(screen.getByRole('heading', { name: 'Starters' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Remove all items in this category before deleting it.')
  })

  it('Add Item button touch targets meet 48px minimum', () => {
    render(<MenuManager />)
    const addItemBtn = screen.getByText('+ Add Item')
    expect(addItemBtn.className).toContain('min-h-[48px]')
  })

  it('item Edit buttons meet 48px touch target minimum', () => {
    render(<MenuManager />)
    const editBtn = screen.getByRole('button', { name: 'Edit Soup of the Day' })
    expect(editBtn.className).toContain('min-h-[48px]')
  })

  it('item Delete buttons meet 48px touch target minimum', () => {
    render(<MenuManager />)
    const deleteBtn = screen.getByRole('button', { name: 'Delete Soup of the Day' })
    expect(deleteBtn.className).toContain('min-h-[48px]')
  })
})
