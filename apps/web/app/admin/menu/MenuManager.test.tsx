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

  it('opens edit form pre-filled when Edit button is clicked', () => {
    render(<MenuManager />)
    fireEvent.click(screen.getAllByText('Edit')[0])
    expect(screen.getByRole('heading', { name: 'Edit Item' })).toBeInTheDocument()
    const nameInput = screen.getByLabelText(/^Name/) as HTMLInputElement
    expect(nameInput.value).not.toBe('')
  })

  it('saves edited item and shows success feedback', () => {
    render(<MenuManager />)
    fireEvent.click(screen.getAllByText('Edit')[0])
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Updated Soup' } })
    fireEvent.click(screen.getByText('Save Changes'))
    expect(screen.getByText('Updated Soup')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('"Updated Soup" updated successfully.')
  })

  it('shows delete confirmation when Delete button is clicked', () => {
    render(<MenuManager />)
    fireEvent.click(screen.getAllByText('Delete')[0])
    expect(screen.getByText('Delete?')).toBeInTheDocument()
    expect(screen.getByText('Yes')).toBeInTheDocument()
    expect(screen.getByText('No')).toBeInTheDocument()
  })

  it('cancels delete when No is clicked', () => {
    render(<MenuManager />)
    fireEvent.click(screen.getAllByText('Delete')[0])
    fireEvent.click(screen.getByText('No'))
    expect(screen.queryByText('Delete?')).not.toBeInTheDocument()
  })

  it('deletes item and shows success feedback when Yes is clicked', () => {
    render(<MenuManager />)
    expect(screen.getByText('Soup of the Day')).toBeInTheDocument()
    fireEvent.click(screen.getAllByText('Delete')[0])
    fireEvent.click(screen.getByText('Yes'))
    expect(screen.queryByText('Soup of the Day')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('"Soup of the Day" deleted.')
  })

  it('Add Item button touch targets meet 48px minimum', () => {
    render(<MenuManager />)
    const addItemBtn = screen.getByText('+ Add Item')
    expect(addItemBtn.className).toContain('min-h-[48px]')
  })

  it('Edit buttons meet 48px touch target minimum', () => {
    render(<MenuManager />)
    const editButtons = screen.getAllByText('Edit')
    expect(editButtons[0].className).toContain('min-h-[48px]')
  })

  it('Delete buttons meet 48px touch target minimum', () => {
    render(<MenuManager />)
    const deleteButtons = screen.getAllByText('Delete')
    expect(deleteButtons[0].className).toContain('min-h-[48px]')
  })
})
