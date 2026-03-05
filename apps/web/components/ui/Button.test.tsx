import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Button from './Button'

describe('Button', () => {
  it('renders children', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument()
  })

  it('has minimum 48px height class', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByRole('button').className).toMatch(/min-h-\[48px\]/)
  })

  it('applies primary variant classes by default', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByRole('button').className).toMatch(/bg-blue-600/)
  })

  it('applies secondary variant classes', () => {
    render(<Button variant="secondary">Click me</Button>)
    expect(screen.getByRole('button').className).toMatch(/bg-gray-200/)
  })

  it('applies danger variant classes', () => {
    render(<Button variant="danger">Click me</Button>)
    expect(screen.getByRole('button').className).toMatch(/bg-red-600/)
  })

  it('is disabled when disabled prop is true', () => {
    render(<Button disabled>Click me</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('is disabled and shows loading text when loading prop is true', () => {
    render(<Button loading>Click me</Button>)
    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
    expect(button).toHaveTextContent('Loading…')
  })
})
