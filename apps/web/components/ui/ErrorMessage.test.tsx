import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ErrorMessage from './ErrorMessage'

describe('ErrorMessage', () => {
  it('renders the message text', () => {
    render(<ErrorMessage message="Something went wrong" />)
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })

  it('has role="alert"', () => {
    render(<ErrorMessage message="Error" />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('applies red text class', () => {
    render(<ErrorMessage message="Error" />)
    expect(screen.getByRole('alert').className).toMatch(/text-red-600/)
  })
})
