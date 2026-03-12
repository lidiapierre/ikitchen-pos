import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ReactNode, JSX } from 'react'
import TableDetailClient from './TableDetailClient'

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }): JSX.Element => (
    <a href={href}>{children as ReactNode}</a>
  ),
}))

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: (): { push: ReturnType<typeof vi.fn> } => ({ push: mockPush }),
}))

vi.mock('./tableDetailData', () => ({
  fetchTableById: vi.fn(),
}))

vi.mock('../components/createOrderApi', () => ({
  callCreateOrder: vi.fn(),
}))

describe('TableDetailClient', () => {
  beforeEach((): void => {
    vi.clearAllMocks()
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'test-key')
  })

  afterEach((): void => {
    vi.unstubAllEnvs()
  })

  describe('occupied table', () => {
    beforeEach(async (): Promise<void> => {
      const { fetchTableById } = await import('./tableDetailData')
      vi.mocked(fetchTableById).mockResolvedValue({
        id: 'table-001',
        label: '3',
        open_order_id: 'order-abc-123',
      })
    })

    it('shows loading state initially', (): void => {
      render(<TableDetailClient tableId="table-001" />)
      expect(screen.getByText('Loading…')).toBeInTheDocument()
    })

    it('renders the table label', async (): Promise<void> => {
      render(<TableDetailClient tableId="table-001" />)
      expect(await screen.findByText('Table 3')).toBeInTheDocument()
    })

    it('renders "Occupied" status badge', async (): Promise<void> => {
      render(<TableDetailClient tableId="table-001" />)
      expect(await screen.findByText('Occupied')).toBeInTheDocument()
    })

    it('renders a "Go to Order" link pointing to the active order', async (): Promise<void> => {
      render(<TableDetailClient tableId="table-001" />)
      const link = await screen.findByRole('link', { name: 'Go to Order' })
      expect(link).toHaveAttribute('href', '/tables/table-001/order/order-abc-123')
    })

    it('"Go to Order" link meets 48px minimum touch target', async (): Promise<void> => {
      render(<TableDetailClient tableId="table-001" />)
      const link = await screen.findByRole('link', { name: 'Go to Order' })
      expect(link.className).toContain('min-h-[')
    })

    it('does not render "Start Order" button for occupied table', async (): Promise<void> => {
      render(<TableDetailClient tableId="table-001" />)
      await screen.findByText('Occupied')
      expect(screen.queryByRole('button', { name: 'Start Order' })).not.toBeInTheDocument()
    })
  })

  describe('empty table', () => {
    beforeEach(async (): Promise<void> => {
      const { fetchTableById } = await import('./tableDetailData')
      vi.mocked(fetchTableById).mockResolvedValue({
        id: 'table-002',
        label: '5',
        open_order_id: null,
      })
    })

    it('renders the table label', async (): Promise<void> => {
      render(<TableDetailClient tableId="table-002" />)
      expect(await screen.findByText('Table 5')).toBeInTheDocument()
    })

    it('renders "Empty" status badge', async (): Promise<void> => {
      render(<TableDetailClient tableId="table-002" />)
      expect(await screen.findByText('Empty')).toBeInTheDocument()
    })

    it('renders "Start Order" button', async (): Promise<void> => {
      render(<TableDetailClient tableId="table-002" />)
      expect(await screen.findByRole('button', { name: 'Start Order' })).toBeInTheDocument()
    })

    it('"Start Order" button meets 48px minimum touch target', async (): Promise<void> => {
      render(<TableDetailClient tableId="table-002" />)
      const btn = await screen.findByRole('button', { name: 'Start Order' })
      expect(btn.className).toContain('min-h-[')
    })

    it('calls create_order and navigates to the new order on success', async (): Promise<void> => {
      const { callCreateOrder } = await import('../components/createOrderApi')
      vi.mocked(callCreateOrder).mockResolvedValue({ order_id: 'new-order-xyz' })

      render(<TableDetailClient tableId="table-002" />)
      const btn = await screen.findByRole('button', { name: 'Start Order' })
      fireEvent.click(btn)

      await waitFor((): void => {
        expect(mockPush).toHaveBeenCalledWith('/tables/table-002/order/new-order-xyz')
      })
    })

    it('shows "Creating…" and disables button while create_order is in progress', async (): Promise<void> => {
      const { callCreateOrder } = await import('../components/createOrderApi')
      vi.mocked(callCreateOrder).mockImplementation(
        (): Promise<{ order_id: string }> => new Promise(() => {}),
      )

      render(<TableDetailClient tableId="table-002" />)
      const btn = await screen.findByRole('button', { name: 'Start Order' })
      fireEvent.click(btn)

      await waitFor((): void => {
        expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled()
      })
    })

    it('shows error message when create_order fails', async (): Promise<void> => {
      const { callCreateOrder } = await import('../components/createOrderApi')
      vi.mocked(callCreateOrder).mockRejectedValue(new Error('Table has an open order'))

      render(<TableDetailClient tableId="table-002" />)
      const btn = await screen.findByRole('button', { name: 'Start Order' })
      fireEvent.click(btn)

      await waitFor((): void => {
        expect(screen.getByText('Table has an open order')).toBeInTheDocument()
      })
    })

    it('shows "API not configured" error when env vars are absent', async (): Promise<void> => {
      vi.unstubAllEnvs()

      render(<TableDetailClient tableId="table-002" />)
      const btn = await screen.findByRole('button', { name: 'Start Order' })
      fireEvent.click(btn)

      await waitFor((): void => {
        expect(screen.getByText('API not configured')).toBeInTheDocument()
      })
    })

    it('does not render "Go to Order" link for empty table', async (): Promise<void> => {
      render(<TableDetailClient tableId="table-002" />)
      await screen.findByText('Empty')
      expect(screen.queryByRole('link', { name: 'Go to Order' })).not.toBeInTheDocument()
    })
  })

  describe('error and loading states', () => {
    it('shows error message when fetch fails', async (): Promise<void> => {
      const { fetchTableById } = await import('./tableDetailData')
      vi.mocked(fetchTableById).mockRejectedValue(new Error('Table not found'))

      render(<TableDetailClient tableId="table-999" />)
      expect(await screen.findByText('Table not found')).toBeInTheDocument()
    })

    it('shows "Supabase is not configured" when env vars are absent', (): void => {
      vi.unstubAllEnvs()

      render(<TableDetailClient tableId="table-001" />)
      expect(screen.getByText('Supabase is not configured')).toBeInTheDocument()
    })
  })

  describe('navigation', () => {
    it('renders "Back to Tables" link pointing to /tables', (): void => {
      render(<TableDetailClient tableId="table-001" />)
      const backLink = screen.getByRole('link', { name: /Back to Tables/ })
      expect(backLink).toHaveAttribute('href', '/tables')
    })

    it('"Back to Tables" link meets 48px minimum touch target', (): void => {
      render(<TableDetailClient tableId="table-001" />)
      const backLink = screen.getByRole('link', { name: /Back to Tables/ })
      expect(backLink.className).toContain('min-h-[48px]')
    })
  })
})
