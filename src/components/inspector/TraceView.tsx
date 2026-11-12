import { useEffect, useRef } from 'react'
import type { TraceStep } from '../../core/agent/types'
import { TraceStepCard } from './TraceStepCard'

export function TraceView({ steps, follow }: { steps: TraceStep[]; follow: boolean }) {
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
          <TraceStepCard key={s.id} step={s} t0={t0} index={i + 1} />
        ))}
      </ol>
      <div ref={end} />
    </>
  )
}
