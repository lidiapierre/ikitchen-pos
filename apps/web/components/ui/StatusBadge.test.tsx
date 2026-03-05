import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatusBadge from './StatusBadge'

describe('StatusBadge', () => {
  it('renders "Empty" label for empty status', () => {
    render(<StatusBadge status="empty" />)
    expect(screen.getByText('Empty')).toBeInTheDocument()
  })

  it('renders "Occupied" label for occupied status', () => {
    render(<StatusBadge status="occupied" />)
    expect(screen.getByText('Occupied')).toBeInTheDocument()
  })

  it('renders "Pending Payment" label for pending_payment status', () => {
    render(<StatusBadge status="pending_payment" />)
    expect(screen.getByText('Pending Payment')).toBeInTheDocument()
  })

  it('applies grey classes for empty status', () => {
    render(<StatusBadge status="empty" />)
    expect(screen.getByText('Empty').className).toMatch(/bg-gray-100/)
  })

  it('applies green classes for occupied status', () => {
    render(<StatusBadge status="occupied" />)
    expect(screen.getByText('Occupied').className).toMatch(/bg-green-100/)
  })

  it('applies amber classes for pending_payment status', () => {
    render(<StatusBadge status="pending_payment" />)
    expect(screen.getByText('Pending Payment').className).toMatch(/bg-amber-100/)
  })
})
