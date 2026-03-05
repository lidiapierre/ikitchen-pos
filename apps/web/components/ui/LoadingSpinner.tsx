import type { JSX } from 'react'

interface LoadingSpinnerProps {
  label?: string
}

export default function LoadingSpinner({
  label = 'Loading…',
}: LoadingSpinnerProps): JSX.Element {
  return (
    <div role="status" className="flex items-center justify-center gap-2">
      <span aria-hidden="true" className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
      <span className="text-base text-gray-600">{label}</span>
    </div>
  )
}
