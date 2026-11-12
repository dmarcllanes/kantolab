import type { ButtonHTMLAttributes, Ref } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANTS: Record<Variant, string> = {
  // Material 3: filled, tonal, text and error-tonal buttons.
  primary: 'bg-emerald-500 text-zinc-950 shadow-sm hover:bg-emerald-400 hover:shadow disabled:bg-zinc-500/20 disabled:text-zinc-500 disabled:shadow-none',
  secondary: 'bg-emerald-500/12 text-emerald-200 hover:bg-emerald-500/20 disabled:bg-zinc-500/10 disabled:text-zinc-500',
  ghost: 'text-emerald-300 hover:bg-emerald-500/10 disabled:text-zinc-500',
  danger: 'bg-red-500/12 text-red-300 hover:bg-red-500/20 disabled:text-red-300/40',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; ref?: Ref<HTMLButtonElement> }) {
  const sizing = size === 'sm' ? 'h-8 px-3 text-xs gap-1' : 'h-10 px-5 text-sm gap-2'
  return (
    <button
      type="button"
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-medium tracking-[0.01em] transition-[background-color,box-shadow,color] focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 focus-visible:outline-none disabled:cursor-not-allowed ${sizing} ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  )
}
