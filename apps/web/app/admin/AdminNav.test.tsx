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
    expect(screen.getByText('Menu')).toBeInTheDocument()
    expect(screen.getByText('Floor Plan')).toBeInTheDocument()
  })

  it('does not render separate Tables or Sections links', () => {
    vi.mocked(usePathname).mockReturnValue('/admin')
    render(<AdminNav />)
    // "Tables" and "Sections" are merged into "Floor Plan"
    const links = screen.getAllByRole('link')
    const labels = links.map((l) => l.textContent)
    expect(labels).not.toContain('Tables')
    expect(labels).not.toContain('Sections')
  })

  it('highlights the active Dashboard link when on /admin', () => {
    vi.mocked(usePathname).mockReturnValue('/admin')
    render(<AdminNav />)
    const dashboardLink = screen.getByText('Dashboard').closest('a')
    expect(dashboardLink?.className).toMatch(/bg-brand-gold/)
  })

  it('highlights the active Floor Plan link when on /admin/floor-plan', () => {
    vi.mocked(usePathname).mockReturnValue('/admin/floor-plan')
    render(<AdminNav />)
    const floorPlanLink = screen.getByText('Floor Plan').closest('a')
    expect(floorPlanLink?.className).toMatch(/bg-brand-gold/)
  })

  it('highlights the active Menu link when on /admin/menu', () => {
    vi.mocked(usePathname).mockReturnValue('/admin/menu')
    render(<AdminNav />)
    const menuLink = screen.getByText('Menu').closest('a')
    expect(menuLink?.className).toMatch(/bg-brand-gold/)
  })

  it('does not highlight Dashboard when on /admin/menu', () => {
    vi.mocked(usePathname).mockReturnValue('/admin/menu')
    render(<AdminNav />)
    const dashboardLink = screen.getByText('Dashboard').closest('a')
    expect(dashboardLink?.className).not.toMatch(/bg-brand-gold/)
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
