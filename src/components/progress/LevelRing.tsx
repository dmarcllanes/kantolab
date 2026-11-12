/** Circular XP ring with the level number in the middle. */
export function LevelRing({ level, fraction, size = 36, stroke = 3.5 }: { level: number; fraction: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const id = `ring-${size}`
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--color-emerald-500)" />
            <stop offset="100%" stopColor="var(--color-violet-500)" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-zinc-800)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(1, fraction)))}
          className="transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none"
        />
      </svg>
      <span className="absolute font-semibold text-zinc-100" style={{ fontSize: size * 0.36 }}>
        {level}
      </span>
    </span>
  )
}

/** Gradient progress bar. */
export function XpBar({ fraction, className = '' }: { fraction: number; className?: string }) {
  return (
    <div className={`h-2 overflow-hidden rounded-full bg-zinc-800 ${className}`}>
      <div
        className="xp-shimmer h-full rounded-full bg-linear-to-r from-emerald-500 to-violet-500 transition-[width] duration-700 ease-out motion-reduce:transition-none"
        style={{ width: `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%` }}
      />
    </div>
  )
}
