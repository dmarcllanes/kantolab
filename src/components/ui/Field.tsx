import { cloneElement, useId, type ReactElement, type ReactNode } from 'react'
import type { TipId } from '../tips/tips'
import { InfoTip } from './InfoTip'

export const inputClass =
  'w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 transition-colors hover:border-zinc-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none disabled:opacity-60'

type Control = ReactElement<{ id?: string; 'aria-describedby'?: string }>

/** Label + one form control (+ optional hint and ⓘ tip). The control gets the label's id. */
export function Field({ label, hint, tip, children }: { label: ReactNode; hint?: ReactNode; tip?: TipId; children: Control }) {
  const id = useId()
  const hintId = `${id}-hint`
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <label htmlFor={id} className="text-xs font-medium text-zinc-400">
          {label}
        </label>
        {tip && <InfoTip id={tip} />}
      </div>
      {cloneElement(children, { id, ...(hint ? { 'aria-describedby': hintId } : {}) })}
      {hint && (
        <p id={hintId} className="text-xs text-zinc-500">
          {hint}
        </p>
      )}
    </div>
  )
}
