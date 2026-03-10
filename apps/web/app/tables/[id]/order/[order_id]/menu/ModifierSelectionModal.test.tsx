import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ModifierSelectionModal from './ModifierSelectionModal'
import type { Modifier } from './menuData'

const modifiers: Modifier[] = [
  { id: 'mod-001', name: 'Extra cheese', price_delta_cents: 50 },
  { id: 'mod-002', name: 'No onions', price_delta_cents: 0 },
  { id: 'mod-003', name: 'Extra shot', price_delta_cents: 75 },
]

describe('ModifierSelectionModal', () => {
  describe('rendering', () => {
    it('shows the item name in the heading', () => {
      render(
        <ModifierSelectionModal
          itemName="Burger"
          modifiers={modifiers}
          modifierLoadError={null}
          selectedIds={[]}
          onToggle={vi.fn()}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
          confirming={false}
        />,
      )
      expect(screen.getByText(/Burger/)).toBeInTheDocument()
    })

    it('renders all modifier names', () => {
      render(
        <ModifierSelectionModal
          itemName="Burger"
          modifiers={modifiers}
          modifierLoadError={null}
          selectedIds={[]}
          onToggle={vi.fn()}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
          confirming={false}
        />,
      )
      expect(screen.getByText('Extra cheese')).toBeInTheDocument()
      expect(screen.getByText('No onions')).toBeInTheDocument()
      expect(screen.getByText('Extra shot')).toBeInTheDocument()
    })

    it('shows price delta for paid modifiers', () => {
      render(
        <ModifierSelectionModal
          itemName="Burger"
          modifiers={modifiers}
          modifierLoadError={null}
          selectedIds={[]}
          onToggle={vi.fn()}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
          confirming={false}
        />,
      )
      expect(screen.getByText('+$0.50')).toBeInTheDocument()
      expect(screen.getByText('+$0.75')).toBeInTheDocument()
    })

    it('shows "free" for zero-cost modifiers', () => {
      render(
        <ModifierSelectionModal
          itemName="Burger"
          modifiers={modifiers}
          modifierLoadError={null}
          selectedIds={[]}
          onToggle={vi.fn()}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
          confirming={false}
        />,
      )
      expect(screen.getByText('free')).toBeInTheDocument()
    })

    it('shows the modifier load error warning when provided', () => {
      render(
        <ModifierSelectionModal
          itemName="Burger"
          modifiers={[]}
          modifierLoadError="Failed to load"
          selectedIds={[]}
          onToggle={vi.fn()}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
          confirming={false}
        />,
      )
      expect(screen.getByText(/Could not load modifiers/)).toBeInTheDocument()
    })

    it('all modifier buttons have minimum 48px touch target', () => {
      render(
        <ModifierSelectionModal
          itemName="Burger"
          modifiers={modifiers}
          modifierLoadError={null}
          selectedIds={[]}
          onToggle={vi.fn()}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
          confirming={false}
        />,
      )
      const cheeseButton = screen.getByRole('button', { name: /Extra cheese/ })
      expect(cheeseButton.className).toContain('min-h-[48px]')
    })

    it('Confirm and Cancel buttons have minimum 48px touch target', () => {
      render(
        <ModifierSelectionModal
          itemName="Burger"
          modifiers={modifiers}
          modifierLoadError={null}
          selectedIds={[]}
          onToggle={vi.fn()}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
          confirming={false}
        />,
      )
      expect(screen.getByRole('button', { name: 'Add to Order' }).className).toContain('min-h-[48px]')
      expect(screen.getByRole('button', { name: 'Cancel' }).className).toContain('min-h-[48px]')
    })
  })

  describe('interactions', () => {
    it('calls onToggle with modifier id when a modifier button is clicked', async () => {
      const onToggle = vi.fn()
      render(
        <ModifierSelectionModal
          itemName="Burger"
          modifiers={modifiers}
          modifierLoadError={null}
          selectedIds={[]}
          onToggle={onToggle}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
          confirming={false}
        />,
      )
      await userEvent.click(screen.getByRole('button', { name: /Extra cheese/ }))
      expect(onToggle).toHaveBeenCalledWith('mod-001')
    })

    it('calls onConfirm when Add to Order is clicked', async () => {
      const onConfirm = vi.fn()
      render(
        <ModifierSelectionModal
          itemName="Burger"
          modifiers={modifiers}
          modifierLoadError={null}
          selectedIds={['mod-001']}
          onToggle={vi.fn()}
          onConfirm={onConfirm}
          onCancel={vi.fn()}
          confirming={false}
        />,
      )
      await userEvent.click(screen.getByRole('button', { name: 'Add to Order' }))
      expect(onConfirm).toHaveBeenCalled()
    })

    it('calls onCancel when Cancel is clicked', async () => {
      const onCancel = vi.fn()
      render(
        <ModifierSelectionModal
          itemName="Burger"
          modifiers={modifiers}
          modifierLoadError={null}
          selectedIds={[]}
          onToggle={vi.fn()}
          onConfirm={vi.fn()}
          onCancel={onCancel}
          confirming={false}
        />,
      )
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(onCancel).toHaveBeenCalled()
    })

    it('disables buttons when confirming is true', () => {
      render(
        <ModifierSelectionModal
          itemName="Burger"
          modifiers={modifiers}
          modifierLoadError={null}
          selectedIds={[]}
          onToggle={vi.fn()}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
          confirming={true}
        />,
      )
      expect(screen.getByRole('button', { name: 'Adding…' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    })
  })
})
