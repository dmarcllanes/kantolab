import { ArrowRight, Brain, Check, Download, Hand, TriangleExclamationPoint, Wrench } from 'lucide-react'
import type { AgentStatus, TraceStep } from '../../core/agent/types'
import { InfoTip } from '../ui/InfoTip'

const STAGES = [
  { status: 'LOADING_MODEL', label: 'Load', icon: Download },
  { status: 'THINKING', label: 'Think', icon: Brain },
  { status: 'EXECUTING_TOOL', label: 'Use tool', icon: Wrench },
  { status: 'AWAITING_APPROVAL', label: 'Ask you', icon: Hand },
  { status: 'COMPLETED', label: 'Done', icon: Check },
] as const

const VISITED_BY_KIND: Partial<Record<TraceStep['kind'], AgentStatus>> = {
  tool_call: 'THINKING',
  assistant: 'COMPLETED',
  tool_result: 'EXECUTING_TOOL',
  approval: 'AWAITING_APPROVAL',
}

function currentStep(trace: TraceStep[]): number {
  let max = 0
  for (const s of trace) {
    const step = (s.data as { step?: unknown } | undefined)?.step
    if (typeof step === 'number' && step > max) max = step
  }
  return max
}

/** The agent's state machine as a strip: where it is now, and where this run has been. */
export function StatusPipeline({ status, trace, maxSteps }: { status: AgentStatus; trace: TraceStep[]; maxSteps?: number }) {
  const visited = new Set<AgentStatus>()
  for (const s of trace) {
    const v = VISITED_BY_KIND[s.kind]
    if (v) visited.add(v)
  }
  if (trace.length > 2) visited.add('THINKING')
  const step = currentStep(trace)
  const busy = status === 'THINKING' || status === 'EXECUTING_TOOL' || status === 'LOADING_MODEL' || status === 'AWAITING_APPROVAL'

  return (
    <div className="flex items-center gap-2">
      <ol aria-label={`Agent status: ${status}`} className="flex min-w-0 flex-wrap items-center gap-1">
        {STAGES.map((stage, i) => {
          const isError = stage.status === 'COMPLETED' && status === 'ERROR'
          const active = stage.status === status || isError
          const Icon = isError ? TriangleExclamationPoint : stage.icon
          const tone = isError
            ? 'border-red-500/50 bg-red-500/15 text-red-200'
            : active
              ? 'border-emerald-400/60 bg-emerald-500/15 text-emerald-100'
              : visited.has(stage.status)
                ? 'border-zinc-700 text-zinc-300'
                : 'border-zinc-800 text-zinc-600'
          return (
            <li key={stage.status} className="flex items-center gap-1" aria-current={active ? 'step' : undefined}>
              <span className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors ${tone}`}>
                <Icon className={`size-3 ${active && busy ? 'motion-safe:animate-pulse' : ''}`} />
                {isError ? 'Error' : stage.label}
              </span>
              {i < STAGES.length - 1 && <ArrowRight className="size-3 text-zinc-700" aria-hidden />}
            </li>
          )
        })}
      </ol>
      <InfoTip id="status" />
      {maxSteps !== undefined && step > 0 && (
        <span className="ml-auto shrink-0 font-mono text-[11px] text-zinc-400" title="Model replies used out of the max">
          step {step}/{maxSteps}
        </span>
      )}
    </div>
  )
}
