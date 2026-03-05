import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Card from './Card'

describe('Card', () => {
  it('renders children', () => {
    render(<Card>Card content</Card>)
    expect(screen.getByText('Card content')).toBeInTheDocument()
  })

  it('applies rounded and padding classes', () => {
    const { container } = render(<Card>Card content</Card>)
    const card = container.firstChild as HTMLElement
    expect(card.className).toMatch(/rounded-xl/)
    expect(card.className).toMatch(/p-4/)
  })

  it('merges additional className', () => {
    const { container } = render(<Card className="extra-class">Card content</Card>)
    expect((container.firstChild as HTMLElement).className).toMatch(/extra-class/)
  })
})
