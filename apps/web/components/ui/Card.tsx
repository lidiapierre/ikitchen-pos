import React from 'react'

interface CardProps {
  children: React.ReactNode
  className?: string
}

export default function Card({ children, className = '' }: CardProps): React.JSX.Element {
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
