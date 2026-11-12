import type { ReactNode } from 'react'

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  right,
}: {
  tabs: readonly { id: T; label: string }[]
  value: T
  onChange: (id: T) => void
  right?: ReactNode
}) {
  return (
    <div className="flex items-center gap-1 border-b border-zinc-800 px-3">
      <div role="tablist" className="flex min-w-0 gap-1 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={value === t.id}
            onClick={() => onChange(t.id)}
            className={`-mb-px shrink-0 rounded-t-lg border-b-[3px] px-4 py-3 text-sm font-medium transition-colors ${
              value === t.id ? 'border-emerald-500 text-emerald-300' : 'border-transparent text-zinc-500 hover:bg-zinc-500/10 hover:text-zinc-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {right && <div className="ml-auto pr-1">{right}</div>}
    </div>
  )
}
