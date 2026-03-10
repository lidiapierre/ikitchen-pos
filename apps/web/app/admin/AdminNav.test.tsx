import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import AdminNav from './AdminNav'

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
}))

import { usePathname } from 'next/navigation'

describe('AdminNav', () => {
  it('renders all nav links', () => {
    vi.mocked(usePathname).mockReturnValue('/admin')
    render(<AdminNav />)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Tables')).toBeInTheDocument()
    expect(screen.getByText('Menu')).toBeInTheDocument()
  })

  it('highlights the active Dashboard link when on /admin', () => {
    vi.mocked(usePathname).mockReturnValue('/admin')
    render(<AdminNav />)
    const dashboardLink = screen.getByText('Dashboard').closest('a')
    expect(dashboardLink?.className).toMatch(/bg-indigo-600/)
  })

  it('highlights the active Tables link when on /admin/tables', () => {
    vi.mocked(usePathname).mockReturnValue('/admin/tables')
    render(<AdminNav />)
    const tablesLink = screen.getByText('Tables').closest('a')
    expect(tablesLink?.className).toMatch(/bg-indigo-600/)
  })

  it('does not highlight Dashboard when on /admin/tables', () => {
    vi.mocked(usePathname).mockReturnValue('/admin/tables')
    render(<AdminNav />)
    const dashboardLink = screen.getByText('Dashboard').closest('a')
    expect(dashboardLink?.className).not.toMatch(/bg-indigo-600/)
  })

  it('all nav links meet minimum 48px touch target height', () => {
    vi.mocked(usePathname).mockReturnValue('/admin')
    render(<AdminNav />)
    const links = screen.getAllByRole('link')
    for (const link of links) {
      expect(link.className).toMatch(/min-h-\[48px\]/)
    }
  })
})
