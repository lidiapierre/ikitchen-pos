import type { JSX } from 'react'

interface ErrorMessageProps {
  message: string
}

export default function ErrorMessage({ message }: ErrorMessageProps): JSX.Element {
  return (
    <p role="alert" className="text-base text-red-600">
      {message}
    </p>
  )
}
