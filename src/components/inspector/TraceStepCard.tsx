import { Bot, Braces, CornerDownRight, Pencil, PackageCheck, Settings2, ShieldCheck, TriangleExclamationPoint, User, Wrench } from 'lucide-react'
import { useState } from 'react'
import type { TraceStep, TraceStepKind } from '../../core/agent/types'
import { JsonView } from '../ui/JsonView'
import { StepGuide } from '../guide/GuideNote'

const KIND: Record<TraceStepKind, { label: string; icon: typeof Bot; tone: string; edge: string }> = {
  system: { label: 'System prompt', icon: Settings2, tone: 'text-zinc-400', edge: 'border-l-zinc-600' },
  user: { label: 'User', icon: User, tone: 'text-sky-300', edge: 'border-l-sky-400/60' },
  assistant: { label: 'Final answer', icon: Bot, tone: 'text-emerald-300', edge: 'border-l-emerald-400/70' },
  tool_call: { label: 'Tool call', icon: Wrench, tone: 'text-violet-300', edge: 'border-l-violet-400/60' },
  tool_result: { label: 'Tool result', icon: PackageCheck, tone: 'text-sky-300', edge: 'border-l-sky-400/60' },
  approval: { label: 'Approval', icon: ShieldCheck, tone: 'text-amber-300', edge: 'border-l-amber-400/60' },
  error: { label: 'Error', icon: TriangleExclamationPoint, tone: 'text-red-300', edge: 'border-l-red-400/70' },
}


/** Thinking a reasoning model wrote in <think> tags (see splitThinking). */
function reasoningOf(data: unknown): string | null {
  if (!data || typeof data !== 'object' || !('reasoning' in data)) return null
  const r = (data as { reasoning?: unknown }).reasoning
  return typeof r === 'string' && r.trim() ? r : null
}
export function TraceStepCard({ step, t0, index, onEdit }: { step: TraceStep; t0: number; index: number; onEdit?: () => void }) {
  const [showData, setShowData] = useState(false)
  const meta = KIND[step.kind]
  const Icon = meta.icon
  const ms = (step.data as { ms?: unknown } | undefined)?.ms
  return (
    <li
      id={`step-${step.id}`}
      style={step.depth ? { marginLeft: `${Math.min(step.depth, 4) * 1.25}rem` } : undefined}
      className={`group/step scroll-mt-4 rounded-md border border-l-2 p-3 transition-shadow motion-safe:animate-step-in ${step.edited ? 'border-amber-500/40' : 'border-zinc-800'} ${step.depth ? 'bg-zinc-900/30' : 'bg-zinc-900/60'} ${step.replayed ? 'opacity-60' : ''} ${meta.edge}`}
    >
      <div className="flex items-center gap-2 text-xs">
        <span className="font-mono text-zinc-600">{index}</span>
        <Icon className={`size-3.5 ${meta.tone}`} />
        <span className={`font-medium ${meta.tone}`}>{step.depth && step.kind === 'assistant' ? 'Sub-agent answer' : meta.label}</span>
        {step.agent && (
          <span className="flex min-w-0 items-center gap-1 truncate text-zinc-400" title={`Step of sub-agent "${step.agent}"`}>
            <CornerDownRight className="size-3 shrink-0" /> {step.agent}
          </span>
        )}
        {typeof ms === 'number' && <span className="font-mono text-zinc-500">{ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`}</span>}
        {step.edited && <span className="rounded bg-amber-500/15 px-1.5 font-mono text-[10px] text-amber-200">edited</span>}
        {step.replayed && <span className="font-mono text-[10px] text-zinc-500" title="Copied from the original run">replayed</span>}
        <span className="ml-auto font-mono text-zinc-500">+{((step.at - t0) / 1000).toFixed(2)}s</span>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            title="Change this step and continue the run from here"
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 sm:opacity-0 sm:group-hover/step:opacity-100 sm:focus-visible:opacity-100"
          >
            <Pencil className="size-3" /> Edit
          </button>
        )}
        {step.data !== undefined && (
          <button
            type="button"
            onClick={() => setShowData((v) => !v)}
            aria-pressed={showData}
            className={`flex items-center gap-1 rounded px-1.5 py-0.5 ${showData ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800'}`}
          >
            <Braces className="size-3" /> data
          </button>
        )}
      </div>
      {step.kind === 'system' ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-zinc-500">Show prompt ({step.content.length} chars)</summary>
          <pre className="mt-2 max-h-80 overflow-auto font-mono text-xs whitespace-pre-wrap text-zinc-300">{step.content}</pre>
        </details>
      ) : (
        <p className={`mt-1.5 text-sm break-words whitespace-pre-wrap ${step.kind === 'tool_call' ? 'font-mono text-violet-100' : 'text-zinc-200'}`}>{step.content}</p>
      )}
      {reasoningOf(step.data) && (
        <details className="mt-2 rounded-xl bg-zinc-950/50 px-3 py-2">
          <summary className="cursor-pointer text-xs text-zinc-500">Model’s reasoning ({reasoningOf(step.data)!.length} chars)</summary>
          <pre className="mt-2 max-h-60 overflow-auto font-mono text-xs whitespace-pre-wrap text-zinc-400">{reasoningOf(step.data)}</pre>
        </details>
      )}
      <StepGuide step={step} />
      {showData && step.data !== undefined && (
        <div className="mt-2">
          <JsonView value={step.data} />
        </div>
      )}
    </li>
  )
}
