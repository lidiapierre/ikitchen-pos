import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SectionSidebar, { getSectionTint } from './SectionSidebar'
import type { UnifiedSection, UnifiedTable, StaffUser } from './unifiedFloorPlanData'

const mockSections: UnifiedSection[] = [
  { id: 'sec-1', name: 'Main Hall', restaurant_id: 'rest-1', assigned_server_id: 'user-1', sort_order: 0, grid_cols: 8, grid_rows: 6 },
  { id: 'sec-2', name: 'Patio', restaurant_id: 'rest-1', assigned_server_id: null, sort_order: 1, grid_cols: 6, grid_rows: 4 },
]

const mockTables: UnifiedTable[] = [
  { id: 'table-1', label: 'T1', seat_count: 4, grid_x: 0, grid_y: 0, section_id: 'sec-1', open_order_id: null },
  { id: 'table-2', label: 'T2', seat_count: 2, grid_x: null, grid_y: null, section_id: null, open_order_id: null },
]

const mockStaff: StaffUser[] = [
  { id: 'user-1', name: 'Alice', email: 'alice@test.com', role: 'server' },
]

const defaultProps = {
  sections: mockSections,
  tables: mockTables,
  staffUsers: mockStaff,
  selectedSectionId: null,
  onSelectSection: vi.fn(),
  onCreateSection: vi.fn().mockResolvedValue(undefined),
  onDeleteSection: vi.fn().mockResolvedValue(undefined),
}

describe('SectionSidebar', () => {
  it('renders section names', () => {
    render(<SectionSidebar {...defaultProps} />)
    expect(screen.getByText('Main Hall')).toBeInTheDocument()
    expect(screen.getByText('Patio')).toBeInTheDocument()
  })

  it('shows unassigned tables count', () => {
    render(<SectionSidebar {...defaultProps} />)
    expect(screen.getByText('T2')).toBeInTheDocument()
  })

  it('shows assigned server badge', () => {
    render(<SectionSidebar {...defaultProps} />)
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  it('shows table count per section', () => {
    render(<SectionSidebar {...defaultProps} />)
    expect(screen.getByText(/1 table(?!s)/)).toBeInTheDocument()
    expect(screen.getByText('0 tables')).toBeInTheDocument()
  })

  it('shows grid dimensions per section', () => {
    render(<SectionSidebar {...defaultProps} />)
    expect(screen.getByText('8×6')).toBeInTheDocument()
    expect(screen.getByText('6×4')).toBeInTheDocument()
  })

  it('calls onCreateSection when adding', async () => {
    const onCreateSection = vi.fn().mockResolvedValue(undefined)
    render(<SectionSidebar {...defaultProps} onCreateSection={onCreateSection} />)
    const input = screen.getByPlaceholderText('New section name')
    fireEvent.change(input, { target: { value: 'VIP' } })
    fireEvent.click(screen.getByLabelText('Add section'))
    await waitFor(() => {
      expect(onCreateSection).toHaveBeenCalledWith('VIP')
    })
  })

  it('calls onSelectSection when clicking a section', () => {
    const onSelectSection = vi.fn()
    render(<SectionSidebar {...defaultProps} onSelectSection={onSelectSection} />)
    fireEvent.click(screen.getByText('Main Hall'))
    expect(onSelectSection).toHaveBeenCalledWith('sec-1')
  })

  it('shows empty state when no sections', () => {
    render(<SectionSidebar {...defaultProps} sections={[]} />)
    expect(screen.getByText('No sections yet')).toBeInTheDocument()
  })
})

describe('getSectionTint', () => {
  it('returns a string for any index', () => {
    expect(typeof getSectionTint(0)).toBe('string')
    expect(typeof getSectionTint(7)).toBe('string')
    expect(typeof getSectionTint(100)).toBe('string')
  })

  it('cycles through tints', () => {
    expect(getSectionTint(0)).toBe(getSectionTint(8))
  })
})
