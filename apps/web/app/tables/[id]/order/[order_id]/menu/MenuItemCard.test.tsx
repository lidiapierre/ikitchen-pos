import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MenuItemCard from './MenuItemCard'
import type { MenuItem } from './menuData'

const mockItem: MenuItem = {
  id: '00000000-0000-0000-0000-000000000301',
  name: 'Bruschetta',
  price_cents: 850,
}

const ORDER_ID = 'order-abc-123'

describe('MenuItemCard', () => {
  const originalFetch = global.fetch
  const originalEnv = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
    }
  })

  afterEach(() => {
    global.fetch = originalFetch
    process.env = originalEnv
    vi.useRealTimers()
  })

  describe('rendering', () => {
    it('renders the item name', () => {
      render(<MenuItemCard item={mockItem} orderId={ORDER_ID} onItemAdded={vi.fn()} />)
      expect(screen.getByText('Bruschetta')).toBeInTheDocument()
    })

    it('renders the item price formatted as dollars', () => {
      render(<MenuItemCard item={mockItem} orderId={ORDER_ID} onItemAdded={vi.fn()} />)
      expect(screen.getByText('$8.50')).toBeInTheDocument()
    })

    it('renders the Add button', () => {
      render(<MenuItemCard item={mockItem} orderId={ORDER_ID} onItemAdded={vi.fn()} />)
      expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument()
    })

    it('Add button has minimum 48px touch target', () => {
      render(<MenuItemCard item={mockItem} orderId={ORDER_ID} onItemAdded={vi.fn()} />)
      const button = screen.getByRole('button', { name: 'Add' })
      expect(button.className).toContain('min-h-[48px]')
    })

    it('item name uses at least base (16px) font size', () => {
      render(<MenuItemCard item={mockItem} orderId={ORDER_ID} onItemAdded={vi.fn()} />)
      expect(screen.getByText('Bruschetta').className).toContain('text-base')
    })
  })

  describe('font-size compliance', () => {
    it('error message uses at least base (16px) font size', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ success: false, error: 'Order not found' }),
      })

      render(<MenuItemCard item={mockItem} orderId={ORDER_ID} onItemAdded={vi.fn()} />)
      await userEvent.click(screen.getByRole('button', { name: 'Add' }))

      await waitFor(() => {
        expect(screen.getByText('Order not found').className).toContain('text-base')
      })
    })
  })

  describe('on successful add', () => {
    it('shows "✓ Added" after a successful API call', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            success: true,
            data: { order_item_id: 'new-item-uuid', order_total: 850 },
          }),
      })

      render(<MenuItemCard item={mockItem} orderId={ORDER_ID} onItemAdded={vi.fn()} />)
      await userEvent.click(screen.getByRole('button', { name: 'Add' }))

      await waitFor(() => {
        expect(screen.getByText('✓ Added')).toBeInTheDocument()
      })
    })

    it('calls onItemAdded with the item price in cents', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            success: true,
            data: { order_item_id: 'new-item-uuid', order_total: 850 },
          }),
      })

      const onItemAdded = vi.fn()
      render(<MenuItemCard item={mockItem} orderId={ORDER_ID} onItemAdded={onItemAdded} />)
      await userEvent.click(screen.getByRole('button', { name: 'Add' }))

      await waitFor(() => {
        expect(onItemAdded).toHaveBeenCalledWith(850)
      })
    })

    it('sends the correct order_id and menu_item_id to the API', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            success: true,
            data: { order_item_id: 'new-item-uuid', order_total: 0 },
          }),
      })
      global.fetch = mockFetch

      render(<MenuItemCard item={mockItem} orderId={ORDER_ID} onItemAdded={vi.fn()} />)
      await userEvent.click(screen.getByRole('button', { name: 'Add' }))

      await waitFor(() => expect(mockFetch).toHaveBeenCalled())
      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(init.body as string) as { order_id: string; menu_item_id: string }
      expect(body.order_id).toBe(ORDER_ID)
      expect(body.menu_item_id).toBe(mockItem.id)
    })
  })

  describe('on failed add', () => {
    it('shows an inline error message when the API returns success: false', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            success: false,
            error: 'Order not found',
          }),
      })

      render(<MenuItemCard item={mockItem} orderId={ORDER_ID} onItemAdded={vi.fn()} />)
      await userEvent.click(screen.getByRole('button', { name: 'Add' }))

      await waitFor(() => {
        expect(screen.getByText('Order not found')).toBeInTheDocument()
      })
    })

    it('shows an inline error message when the fetch throws', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      render(<MenuItemCard item={mockItem} orderId={ORDER_ID} onItemAdded={vi.fn()} />)
      await userEvent.click(screen.getByRole('button', { name: 'Add' }))

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument()
      })
    })

    it('shows "API not configured" when NEXT_PUBLIC_SUPABASE_URL is missing', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = ''

      render(<MenuItemCard item={mockItem} orderId={ORDER_ID} onItemAdded={vi.fn()} />)
      await userEvent.click(screen.getByRole('button', { name: 'Add' }))

      await waitFor(() => {
        expect(screen.getByText('API not configured')).toBeInTheDocument()
      })
    })

    it('shows "API not configured" when NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ''

      render(<MenuItemCard item={mockItem} orderId={ORDER_ID} onItemAdded={vi.fn()} />)
      await userEvent.click(screen.getByRole('button', { name: 'Add' }))

      await waitFor(() => {
        expect(screen.getByText('API not configured')).toBeInTheDocument()
      })
    })
  })

  describe('success auto-reset', () => {
    it('clears the success indicator after 1500ms', async () => {
      vi.useFakeTimers()
      global.fetch = vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({
            success: true,
            data: { order_item_id: 'new-item-uuid', order_total: 850 },
          }),
      })

      render(<MenuItemCard item={mockItem} orderId={ORDER_ID} onItemAdded={vi.fn()} />)
      await userEvent.click(screen.getByRole('button', { name: 'Add' }))

      await waitFor(() => {
        expect(screen.getByText('✓ Added')).toBeInTheDocument()
      })

      vi.advanceTimersByTime(1500)

      await waitFor(() => {
        expect(screen.queryByText('✓ Added')).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument()
      })
    })
  })

  describe('loading state', () => {
    it('shows "Adding…" while the API call is in flight', async () => {
      let resolveJson!: (value: unknown) => void
      global.fetch = vi.fn().mockResolvedValue({
        json: (): Promise<unknown> =>
          new Promise((resolve) => {
            resolveJson = resolve
          }),
      })

      render(<MenuItemCard item={mockItem} orderId={ORDER_ID} onItemAdded={vi.fn()} />)
      await userEvent.click(screen.getByRole('button', { name: 'Add' }))

      expect(screen.getByText('Adding…')).toBeInTheDocument()

      resolveJson({ success: true, data: { order_item_id: 'uuid', order_total: 0 } })
      await waitFor(() => {
        expect(screen.queryByText('Adding…')).not.toBeInTheDocument()
      })
    })

    it('disables the button while the API call is in flight', async () => {
      let resolveJson!: (value: unknown) => void
      global.fetch = vi.fn().mockResolvedValue({
        json: (): Promise<unknown> =>
          new Promise((resolve) => {
            resolveJson = resolve
          }),
      })

      render(<MenuItemCard item={mockItem} orderId={ORDER_ID} onItemAdded={vi.fn()} />)
      const button = screen.getByRole('button')
      await userEvent.click(button)

      expect(button).toBeDisabled()

      resolveJson({ success: true, data: { order_item_id: 'uuid', order_total: 0 } })
      await waitFor(() => {
        expect(button).not.toBeDisabled()
      })
    })
  })
})
