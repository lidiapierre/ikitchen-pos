import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import AdminDashboardPage from './page'

describe('AdminDashboardPage', () => {
  it('renders the Dashboard heading', () => {
    render(<AdminDashboardPage />)
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
  })

  it('shows total tables stat', () => {
    render(<AdminDashboardPage />)
    expect(screen.getByText('Total Tables')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
  })

  it('shows menu items stat', () => {
    render(<AdminDashboardPage />)
    expect(screen.getByText('Menu Items')).toBeInTheDocument()
    expect(screen.getByText('24')).toBeInTheDocument()
  })

  it('shows open orders stat', () => {
    render(<AdminDashboardPage />)
    expect(screen.getByText('Open Orders')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })
})
