import { useEffect, useRef } from 'react'
import { editKind } from '../../core/agent/replay'
import type { TraceStep } from '../../core/agent/types'
import { TraceStepCard } from './TraceStepCard'

export function TraceView({ steps, follow, onEdit }: { steps: TraceStep[]; follow: boolean; onEdit?: (index: number) => void }) {
  const end = useRef<HTMLDivElement>(null)
  const count = steps.length
  useEffect(() => {
    if (follow && count > 0) end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [count, follow])

  if (steps.length === 0) return null
  const t0 = steps[0].at
  return (
    <>
      <ol className="space-y-2">
        {steps.map((s, i) => (
          <TraceStepCard key={s.id} step={s} t0={t0} index={i + 1} onEdit={onEdit && editKind(s) ? () => onEdit(i) : undefined} />
        ))}
      </ol>
      <div ref={end} />
    </>
  )
}
