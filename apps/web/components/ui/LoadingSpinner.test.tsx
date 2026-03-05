import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LoadingSpinner from './LoadingSpinner'

describe('LoadingSpinner', () => {
  it('renders with default label', () => {
    render(<LoadingSpinner />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('renders with custom label', () => {
    render(<LoadingSpinner label="Please wait…" />)
    expect(screen.getByText('Please wait…')).toBeInTheDocument()
  })

  it('has role="status"', () => {
    render(<LoadingSpinner />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('contains the animated spinner element', () => {
    render(<LoadingSpinner />)
    const status = screen.getByRole('status')
    expect(status.querySelector('.animate-spin')).not.toBeNull()
  })
})
