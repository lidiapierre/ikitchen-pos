import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import TablesPage from './page'

vi.mock('./components/TableCard', () => ({
  default: ({ table }: { table: { id: number; number: number } }): JSX.Element => (
    <div data-testid="table-card">{table.number}</div>
  ),
}))

describe('TablesPage', () => {
  it('renders the Tables heading', (): void => {
    render(<TablesPage />)
    expect(screen.getByRole('heading', { name: 'Tables' })).toBeInTheDocument()
  })

  it('renders one card for each table in the list', (): void => {
    render(<TablesPage />)
    expect(screen.getAllByTestId('table-card')).toHaveLength(8)
  })
})
