import { useRef, useState } from 'react'
import type { TraceStep } from '../../core/agent/types'
import { InfoTip } from '../ui/InfoTip'
import { SERIES } from './colors'

type Category = keyof typeof SERIES

const LABEL: Record<Category, string> = { model: 'Model thinking', tool: 'Tool running', wait: 'Waiting for you' }

function categoryOf(kind: TraceStep['kind']): Category | null {
  if (kind === 'tool_call' || kind === 'assistant' || kind === 'error') return 'model'
  if (kind === 'tool_result') return 'tool'
  if (kind === 'approval') return 'wait'
  return null
}

interface Segment {
  stepId: string
  index: number
  category: Category
  ms: number
  title: string
}

function buildSegments(steps: TraceStep[]): Segment[] {
  const out: Segment[] = []
  for (let i = 1; i < steps.length; i++) {
    const category = categoryOf(steps[i].kind)
    if (!category) continue
    out.push({ stepId: steps[i].id, index: i + 1, category, ms: Math.max(0, steps[i].at - steps[i - 1].at), title: steps[i].content })
  }
  return out
}

const secs = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`)

/** Stacked bar of where a run's time went. Hover for details, click to jump to the step. */
export function RunTimeline({ steps, onJump }: { steps: TraceStep[]; onJump: (stepId: string) => void }) {
  const segments = buildSegments(steps)
  const [hover, setHover] = useState<{ seg: Segment; x: number } | null>(null)
  const bar = useRef<HTMLDivElement>(null)
  if (segments.length === 0) return null

  const total = segments.reduce((a, s) => a + s.ms, 0)
  const totals: Record<Category, number> = { model: 0, tool: 0, wait: 0 }
  for (const s of segments) totals[s.category] += s.ms
  const modelCalls = segments.filter((s) => s.category === 'model').length
  const toolCalls = segments.filter((s) => s.category === 'tool').length

  const show = (seg: Segment, el: HTMLElement) => {
    const box = bar.current?.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    // Keep the tooltip (≈140px wide) inside the bar.
    if (box) setHover({ seg, x: Math.min(Math.max(r.left - box.left + r.width / 2, 70), box.width - 70) })
  }

  return (
    <div className="space-y-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 p-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="font-medium text-zinc-300">Timeline</span>
        <InfoTip id="timeline" />
        <span className="ml-auto font-mono text-zinc-400">
          {secs(total)} · {modelCalls} model {modelCalls === 1 ? 'call' : 'calls'} · {toolCalls} tool {toolCalls === 1 ? 'call' : 'calls'}
        </span>
      </div>

      <div ref={bar} className="relative">
        <div className="flex h-4 gap-[2px]" onMouseLeave={() => setHover(null)}>
          {segments.map((s, i) => (
            <button
              key={s.stepId}
              type="button"
              aria-label={`Step ${s.index}: ${LABEL[s.category]}, ${secs(s.ms)}. Jump to step.`}
              onMouseEnter={(e) => show(s, e.currentTarget)}
              onFocus={(e) => show(s, e.currentTarget)}
              onBlur={() => setHover(null)}
              onClick={() => onJump(s.stepId)}
              className="h-full min-w-1 transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-zinc-100"
              style={{
                flexGrow: s.ms,
                flexBasis: 0,
                backgroundColor: SERIES[s.category],
                borderTopLeftRadius: i === 0 ? 4 : 0,
                borderBottomLeftRadius: i === 0 ? 4 : 0,
                borderTopRightRadius: i === segments.length - 1 ? 4 : 0,
                borderBottomRightRadius: i === segments.length - 1 ? 4 : 0,
              }}
            />
          ))}
        </div>
        {hover && (
          <div
            role="tooltip"
            className="pointer-events-none absolute bottom-6 z-10 -translate-x-1/2 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-[11px] whitespace-nowrap text-zinc-200 shadow-lg"
            style={{ left: hover.x }}
          >
            <span className="text-zinc-400">Step {hover.seg.index} · </span>
            {LABEL[hover.seg.category]} · <span className="font-mono">{secs(hover.seg.ms)}</span>
            <div className="max-w-56 truncate text-zinc-500">{hover.seg.title}</div>
          </div>
        )}
      </div>

      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-300">
        {(Object.keys(LABEL) as Category[])
          .filter((c) => segments.some((s) => s.category === c))
          .map((c) => (
            <li key={c} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ backgroundColor: SERIES[c] }} />
              {LABEL[c]} <span className="font-mono text-zinc-500">{secs(totals[c])}</span>
            </li>
          ))}
      </ul>
    </div>
  )
}
