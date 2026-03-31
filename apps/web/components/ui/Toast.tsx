'use client'

import { useEffect } from 'react'
import type { JSX } from 'react'
import { X, AlertCircle, CheckCircle2, Info } from 'lucide-react'

export interface ToastItem {
  id: string
  message: string
  type: 'error' | 'success' | 'info'
}

interface ToastContainerProps {
  toasts: ToastItem[]
  onDismiss: (id: string) => void
}

const TYPE_CONFIG = {
  error: {
    containerClass: 'bg-red-950/95 border-red-700 text-red-100',
    Icon: AlertCircle,
    iconClass: 'text-red-400',
  },
  success: {
    containerClass: 'bg-green-950/95 border-green-700 text-green-100',
    Icon: CheckCircle2,
    iconClass: 'text-green-400',
  },
  info: {
    containerClass: 'bg-zinc-800/95 border-zinc-600 text-zinc-100',
    Icon: Info,
    iconClass: 'text-zinc-400',
  },
}

function SingleToast({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }): JSX.Element {
  const { containerClass, Icon, iconClass } = TYPE_CONFIG[toast.type]

  useEffect(() => {
    const timer = setTimeout(() => { onDismiss(toast.id) }, 3500)
    return () => { clearTimeout(timer) }
  }, [toast.id, onDismiss])

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={[
        'pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border',
        'max-w-sm w-full shadow-xl',
        containerClass,
      ].join(' ')}
    >
      <Icon size={18} className={`${iconClass} shrink-0`} aria-hidden="true" />
      <span className="flex-1 text-sm font-medium leading-snug">{toast.message}</span>
      <button
        type="button"
        onClick={() => { onDismiss(toast.id) }}
        className="shrink-0 opacity-60 hover:opacity-100 transition-opacity min-h-[32px] min-w-[32px] flex items-center justify-center"
        aria-label="Dismiss"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  )
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps): JSX.Element {
  return (
    <div
      className="fixed bottom-6 left-0 right-0 z-[9999] flex flex-col items-center gap-2 px-4 pointer-events-none"
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <SingleToast key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  )
}
