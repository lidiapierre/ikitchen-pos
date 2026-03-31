import { useState, useCallback } from 'react'
import type { ToastItem } from '@/components/ui/Toast'

let toastCounter = 0

export interface UseToastReturn {
  toasts: ToastItem[]
  addToast: (message: string, type?: ToastItem['type']) => void
  dismissToast: (id: string) => void
}

/**
 * Lightweight toast queue hook.
 * Usage:
 *   const { toasts, addToast, dismissToast } = useToast()
 *   // In JSX: <ToastContainer toasts={toasts} onDismiss={dismissToast} />
 *   // To show: addToast('Failed — please retry', 'error')
 */
export function useToast(): UseToastReturn {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const addToast = useCallback((message: string, type: ToastItem['type'] = 'error') => {
    const id = `toast-${String(++toastCounter)}`
    setToasts((prev) => [...prev, { id, message, type }])
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return { toasts, addToast, dismissToast }
}
