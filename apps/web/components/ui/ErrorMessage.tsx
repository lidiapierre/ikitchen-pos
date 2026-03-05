interface ErrorMessageProps {
  message: string
}

export default function ErrorMessage({ message }: ErrorMessageProps): React.JSX.Element {
  return (
    <p role="alert" className="text-sm text-red-600">
      {message}
    </p>
  )
}
