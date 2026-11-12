import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-emerald-500 text-zinc-950 hover:bg-emerald-400 disabled:bg-emerald-500/40',
  secondary: 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700 disabled:text-zinc-500',
  ghost: 'text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 disabled:text-zinc-600',
  danger: 'bg-red-500/15 text-red-300 hover:bg-red-500/25 disabled:text-red-300/40',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }) {
  const sizing = size === 'sm' ? 'h-7 px-2 text-xs gap-1' : 'h-9 px-3 text-sm gap-1.5'
  return (
    <button
      type="button"
      className={`inline-flex shrink-0 items-center justify-center rounded-md font-medium transition-colors disabled:cursor-not-allowed ${sizing} ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  )
}
