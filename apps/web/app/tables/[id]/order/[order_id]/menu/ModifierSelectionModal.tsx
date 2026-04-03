'use client'

import type { JSX } from 'react'
import type { Modifier } from './menuData'

interface ModifierSelectionModalProps {
  itemName: string
  modifiers: Modifier[]
  modifierLoadError: string | null
  selectedIds: string[]
  onToggle: (id: string) => void
  onConfirm: () => void
  onCancel: () => void
  confirming: boolean
}

function formatDelta(priceDeltaCents: number): string {
  if (priceDeltaCents === 0) return 'free'
  const sign = priceDeltaCents > 0 ? '+' : '-'
  const abs = Math.abs(priceDeltaCents)
  return `${sign}$${(abs / 100).toFixed(2)}`
}

export default function ModifierSelectionModal({
  itemName,
  modifiers,
  modifierLoadError,
  selectedIds,
  onToggle,
  onConfirm,
  onCancel,
  confirming,
}: ModifierSelectionModalProps): JSX.Element {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70">
      <div className="w-full max-w-lg bg-brand-offwhite rounded-t-2xl p-6 space-y-4 border-t border-x border-brand-grey">
        <h2 className="text-xl font-semibold text-brand-navy font-heading">
          Customise — {itemName}
        </h2>

        {modifierLoadError !== null && (
          <p className="text-amber-400 text-base">
            Could not load modifiers. You can still add the item without extras.
          </p>
        )}

        {modifiers.length > 0 && (
          <ul className="space-y-2">
            {modifiers.map((mod) => {
              const selected = selectedIds.includes(mod.id)
              return (
                <li key={mod.id}>
                  <button
                    type="button"
                    onClick={() => { onToggle(mod.id) }}
                    className={[
                      'w-full min-h-[48px] flex items-center justify-between gap-4 px-4 rounded-xl',
                      'border-2 text-base font-medium transition-colors',
                      selected
                        ? 'border-brand-gold bg-brand-gold/10 text-brand-navy'
                        : 'border-brand-grey text-brand-navy hover:border-brand-blue bg-white',
                    ].join(' ')}
                  >
                    <span>{mod.name}</span>
                    <span className="text-sm font-semibold">{formatDelta(mod.price_delta_cents)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={confirming}
            className="flex-1 min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold border-2 border-brand-grey text-brand-navy hover:border-brand-blue transition-colors disabled:opacity-50 bg-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming}
            className={[
              'flex-1 min-h-[48px] min-w-[48px] px-6 rounded-xl text-base font-semibold transition-colors',
              confirming
                ? 'bg-brand-grey/30 text-brand-navy/50 cursor-wait'
                : 'bg-brand-gold hover:bg-brand-gold/90 text-brand-navy',
            ].join(' ')}
          >
            {confirming ? 'Adding…' : 'Add to Order'}
          </button>
        </div>
      </div>
    </div>
  )
}
