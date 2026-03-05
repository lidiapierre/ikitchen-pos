import type { JSX, ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
}

export default function Card({ children, className = '' }: CardProps): JSX.Element {
  return (
    <div
      className={['rounded-xl border border-gray-200 bg-white p-4 shadow-sm', className]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  )
}
