import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import AdminLayout from './layout'

vi.mock('next/navigation', () => ({
  usePathname: vi.fn().mockReturnValue('/admin'),
}))

describe('AdminLayout', () => {
  it('renders the Admin badge in the header', () => {
    render(<AdminLayout>child content</AdminLayout>)
    expect(screen.getByText('Admin')).toBeInTheDocument()
  })

  it('renders the iKitchen brand name', () => {
    render(<AdminLayout>child content</AdminLayout>)
    expect(screen.getByText('iKitchen')).toBeInTheDocument()
  })

  it('renders a "Back to POS" link pointing to /tables', () => {
    render(<AdminLayout>child content</AdminLayout>)
    const link = screen.getByRole('link', { name: /Back to POS/ })
    expect(link).toBeInTheDocument()
    expect(link.getAttribute('href')).toBe('/tables')
  })

  it('"Back to POS" link meets the 48px touch target requirement', () => {
    render(<AdminLayout>child content</AdminLayout>)
    const link = screen.getByRole('link', { name: /Back to POS/ })
    expect(link.className).toContain('min-h-[48px]')
  })

  it('renders children inside main', () => {
    render(<AdminLayout><span>test child</span></AdminLayout>)
    const main = screen.getByRole('main')
    expect(main).toBeInTheDocument()
    expect(main).toHaveTextContent('test child')
  })

  it('renders the AdminNav sidebar', () => {
    render(<AdminLayout>child content</AdminLayout>)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })
})
