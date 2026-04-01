import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import VoiceOrderButton from './VoiceOrderButton'

// ── Mock user-context ─────────────────────────────────────────────────────────
vi.mock('@/lib/user-context', () => ({
  useUser: (): { accessToken: string | null } => ({ accessToken: 'test-token' }),
}))

// ── Mock voiceOrderApi ────────────────────────────────────────────────────────
vi.mock('./voiceOrderApi', () => ({
  callVoiceOrder: vi.fn(),
}))

import { callVoiceOrder } from './voiceOrderApi'

const ORDER_ID = 'order-abc-123'
const MOCK_RESULT = {
  transcript: 'two chicken biryani one lassi',
  items: [
    { menu_item_id: 'item-uuid-001', name: 'Chicken Biryani', quantity: 2 },
    { menu_item_id: 'item-uuid-002', name: 'Lassi', quantity: 1 },
  ],
}

// ── Mock MediaRecorder ────────────────────────────────────────────────────────
class MockMediaRecorder {
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  state: 'inactive' | 'recording' = 'inactive'

  start(): void {
    this.state = 'recording'
    if (this.ondataavailable) {
      this.ondataavailable({ data: new Blob(['fake-audio'], { type: 'audio/webm' }) })
    }
  }

  stop(): void {
    this.state = 'inactive'
    if (this.onstop) {
      this.onstop()
    }
  }
}

const originalEnv = process.env

beforeEach(() => {
  vi.clearAllMocks()
  process.env = {
    ...originalEnv,
    NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
  }

  // Patch navigator.mediaDevices without replacing the whole navigator
  const mockStream = {
    getTracks: (): Array<{ stop: () => void }> => [{ stop: vi.fn() }],
  }
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn().mockResolvedValue(mockStream) },
    writable: true,
    configurable: true,
  })

  // Patch MediaRecorder on window/globalThis
  Object.defineProperty(globalThis, 'MediaRecorder', {
    value: MockMediaRecorder,
    writable: true,
    configurable: true,
  })
})

afterEach(() => {
  process.env = originalEnv
  vi.clearAllMocks()
})

describe('VoiceOrderButton', () => {
  it('renders idle mic button', () => {
    const onConfirmed = vi.fn()
    render(<VoiceOrderButton orderId={ORDER_ID} onItemsConfirmed={onConfirmed} />)
    expect(screen.getByRole('button', { name: /start voice order/i })).toBeInTheDocument()
  })

  it('shows recording state after clicking mic button', async () => {
    const onConfirmed = vi.fn()
    // Never resolve so it stays in processing/recording state
    vi.mocked(callVoiceOrder).mockReturnValue(new Promise(() => {}))

    render(<VoiceOrderButton orderId={ORDER_ID} onItemsConfirmed={onConfirmed} />)

    await userEvent.click(screen.getByRole('button', { name: /start voice order/i }))

    await waitFor(() => {
      expect(screen.getByText(/Recording… tap to stop/i)).toBeInTheDocument()
    })
  })

  it('shows confirmation card on successful API response', async () => {
    const onConfirmed = vi.fn()
    vi.mocked(callVoiceOrder).mockResolvedValue(MOCK_RESULT)

    render(<VoiceOrderButton orderId={ORDER_ID} onItemsConfirmed={onConfirmed} />)

    // Start recording
    await userEvent.click(screen.getByRole('button', { name: /start voice order/i }))

    // Stop recording
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /stop recording/i }))
    })

    await waitFor(() => {
      expect(screen.getByText(/Confirm order items/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/two chicken biryani one lassi/i)).toBeInTheDocument()
    expect(screen.getByText('Chicken Biryani')).toBeInTheDocument()
    expect(screen.getByText('Lassi')).toBeInTheDocument()
    expect(screen.getByText('2×')).toBeInTheDocument()
    expect(screen.getByText('1×')).toBeInTheDocument()
  })

  it('calls onItemsConfirmed and dismisses when Add to order is clicked', async () => {
    const onConfirmed = vi.fn()
    vi.mocked(callVoiceOrder).mockResolvedValue(MOCK_RESULT)

    render(<VoiceOrderButton orderId={ORDER_ID} onItemsConfirmed={onConfirmed} />)

    await userEvent.click(screen.getByRole('button', { name: /start voice order/i }))
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /stop recording/i }))
    })

    await waitFor(() => {
      expect(screen.getByText(/Confirm order items/i)).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('button', { name: /Add to order/i }))

    expect(onConfirmed).toHaveBeenCalledWith(MOCK_RESULT.items)
    // Should return to idle
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /start voice order/i })).toBeInTheDocument()
    })
  })

  it('dismisses confirmation card when Cancel is clicked', async () => {
    const onConfirmed = vi.fn()
    vi.mocked(callVoiceOrder).mockResolvedValue(MOCK_RESULT)

    render(<VoiceOrderButton orderId={ORDER_ID} onItemsConfirmed={onConfirmed} />)

    await userEvent.click(screen.getByRole('button', { name: /start voice order/i }))
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /stop recording/i }))
    })

    await waitFor(() => {
      expect(screen.getByText(/Confirm order items/i)).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))

    expect(onConfirmed).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /start voice order/i })).toBeInTheDocument()
    })
  })

  it('shows error message when API call fails', async () => {
    const onConfirmed = vi.fn()
    vi.mocked(callVoiceOrder).mockRejectedValue(new Error('No items matched'))

    render(<VoiceOrderButton orderId={ORDER_ID} onItemsConfirmed={onConfirmed} />)

    await userEvent.click(screen.getByRole('button', { name: /start voice order/i }))
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: /stop recording/i }))
    })

    await waitFor(() => {
      expect(screen.getByText(/No items matched/i)).toBeInTheDocument()
    })
  })
})
