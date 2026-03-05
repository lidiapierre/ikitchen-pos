import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

  it('merges additional className onto the button', () => {
    render(<Button className="extra-class">Click me</Button>)
    expect(screen.getByRole('button').className).toMatch(/extra-class/)
  })

  it('fires onClick handler when clicked', async () => {
    const handleClick = vi.fn()
    render(<Button onClick={handleClick}>Click me</Button>)
    await userEvent.click(screen.getByRole('button'))
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('does not fire onClick when disabled', async () => {
    const handleClick = vi.fn()
    render(<Button onClick={handleClick} disabled>Click me</Button>)
    await userEvent.click(screen.getByRole('button'))
    expect(handleClick).not.toHaveBeenCalled()
  })

  it('does not fire onClick when loading', async () => {
    const handleClick = vi.fn()
    render(<Button onClick={handleClick} loading>Click me</Button>)
    await userEvent.click(screen.getByRole('button'))
    expect(handleClick).not.toHaveBeenCalled()
  })
})
