type ButtonVariant = 'primary' | 'secondary' | 'danger'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  loading?: boolean
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300',
  secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300 disabled:bg-gray-100 disabled:text-gray-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300',
}

export default function Button({
  variant = 'primary',
  loading = false,
  disabled,
  children,
  className = '',
  ...props
}: ButtonProps): React.JSX.Element {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={[
        'min-h-[48px] px-4 py-2 rounded-lg font-semibold text-base transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2',
        variantClasses[variant],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Loading…
        </span>
      ) : (
        children
      )}
    </button>
  )
}
