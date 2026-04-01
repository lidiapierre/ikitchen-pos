import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import TableDialog from './TableDialog'

describe('TableDialog', () => {
  it('renders in add mode with empty fields', () => {
    render(
      <TableDialog
        mode="add"
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Add Table' })).toBeInTheDocument()
    expect(screen.getByLabelText(/Table Label/)).toHaveValue('')
    expect(screen.getByLabelText(/Seat Count/)).toHaveValue(null)
  })

  it('renders in edit mode with pre-filled fields', () => {
    render(
      <TableDialog
        mode="edit"
        initialLabel="T5"
        initialSeatCount={6}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Edit Table' })).toBeInTheDocument()
    expect(screen.getByLabelText(/Table Label/)).toHaveValue('T5')
    expect(screen.getByLabelText(/Seat Count/)).toHaveValue(6)
  })

  it('shows validation errors when fields are empty', async () => {
    const onSubmit = vi.fn()
    render(
      <TableDialog
        mode="add"
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Add Table' }))
    await waitFor(() => {
      expect(screen.getByText('Table label is required')).toBeInTheDocument()
      expect(screen.getByText('Seat count is required')).toBeInTheDocument()
    })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('calls onSubmit with correct values on valid submission', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <TableDialog
        mode="add"
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText(/Table Label/), { target: { value: 'Table 1' } })
    fireEvent.change(screen.getByLabelText(/Seat Count/), { target: { value: '4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Table' }))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('Table 1', 4)
    })
  })

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn()
    render(
      <TableDialog
        mode="add"
        onSubmit={vi.fn()}
        onClose={onClose}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('shows delete button in edit mode when canDelete is true', () => {
    render(
      <TableDialog
        mode="edit"
        initialLabel="T1"
        initialSeatCount={4}
        onSubmit={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
        canDelete={true}
      />,
    )
    expect(screen.getByText('Delete Table')).toBeInTheDocument()
  })

  it('does not show delete button in add mode', () => {
    render(
      <TableDialog
        mode="add"
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.queryByText('Delete Table')).not.toBeInTheDocument()
  })

  it('shows delete confirmation when Delete Table is clicked', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined)
    render(
      <TableDialog
        mode="edit"
        initialLabel="T1"
        initialSeatCount={4}
        onSubmit={vi.fn()}
        onDelete={onDelete}
        onClose={vi.fn()}
        canDelete={true}
      />,
    )

    fireEvent.click(screen.getByText('Delete Table'))
    expect(screen.getByText('Delete this table?')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Yes, Delete'))
    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledOnce()
    })
  })
})
