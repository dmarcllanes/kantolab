import { ArrowDown, ArrowRight } from 'lucide-react'
import type { AgentStatus } from '../../core/agent/types'
import { StatusBadge } from '../ui/Badge'
import { SERIES } from '../viz/colors'
import { TemperatureDemo } from '../viz/TemperatureDemo'
import type { TipVisualKind } from './tips'

function Bubble({ who, text, tone }: { who: string; text: string; tone: string }) {
  return (
    <div className={`rounded border px-2 py-1 ${tone}`}>
      <span className="font-medium">{who}</span> <span className="text-zinc-400">{text}</span>
    </div>
  )
}

function MessagesVisual() {
  return (
    <div className="space-y-1">
      <Bubble who="System" text="your prompt + tool list + JSON rules" tone="border-emerald-500/40 bg-emerald-500/10 text-emerald-200" />
      <Bubble who="You" text="What’s 15% of 2,340?" tone="border-zinc-700 text-sky-200" />
      <Bubble who="Model" text='{"tool":"calculator", …}' tone="border-zinc-700 text-violet-200" />
      <Bubble who="Tool" text='{"result": 351}' tone="border-zinc-700 text-sky-200" />
      <Bubble who="Model" text='{"final":"351"}' tone="border-zinc-700 text-emerald-200" />
      <p className="pt-1 text-zinc-500">The system prompt is always first, so it shapes every reply.</p>
    </div>
  )
}

function StepsVisual() {
  const steps = [
    { id: 'a', label: 'tool' },
    { id: 'b', label: 'tool' },
    { id: 'c', label: 'answer' },
  ]
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {steps.map((s, i) => (
        <div key={s.id} className="flex items-center gap-1.5">
          <span className="rounded border border-zinc-700 px-1.5 py-0.5">
            <span className="text-zinc-500">step {i + 1}</span> <span className="text-zinc-200">{s.label}</span>
          </span>
          {i < steps.length - 1 && <ArrowRight className="size-3 text-zinc-600" />}
        </div>
      ))}
      <span className="text-zinc-500">= 3 of max 8</span>
    </div>
  )
}

function ToolCallVisual() {
  return (
    <div className="space-y-1 font-mono">
      <div className="rounded bg-zinc-950 p-1.5 text-violet-200">{'{"tool":"calculator","args":{"expression":"6*7"}}'}</div>
      <div className="flex items-center gap-1 pl-2 font-sans text-zinc-500">
        <ArrowDown className="size-3" /> schema check → run
      </div>
      <div className="rounded bg-zinc-950 p-1.5 text-sky-200">{'TOOL_RESULT calculator: {"result":42}'}</div>
    </div>
  )
}

const STATE_MEANING: [AgentStatus, string][] = [
  ['IDLE', 'Waiting for you to run something.'],
  ['LOADING_MODEL', 'Downloading / preparing a local model.'],
  ['THINKING', 'The model is writing its next reply.'],
  ['EXECUTING_TOOL', 'A tool is running with the model’s arguments.'],
  ['AWAITING_APPROVAL', 'Paused until you approve or deny a tool.'],
  ['COMPLETED', 'The model gave a final answer.'],
  ['ERROR', 'Something failed. The trace shows what.'],
]

function StatesVisual() {
  return (
    <ul className="space-y-1">
      {STATE_MEANING.map(([s, text]) => (
        <li key={s} className="flex items-start gap-2">
          <span className="w-36 shrink-0">
            <StatusBadge status={s} />
          </span>
          <span className="text-zinc-400">{text}</span>
        </li>
      ))}
    </ul>
  )
}

function ChunksVisual() {
  return (
    <div className="space-y-1">
      <div className="flex gap-0.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={`h-6 flex-1 rounded-sm ${i === 2 ? 'bg-emerald-500/60' : 'bg-zinc-700'}`} />
        ))}
      </div>
      <p className="text-zinc-500">One document → 5 chunks. A search for “refund” returns the chunk that mentions it most (highlighted).</p>
    </div>
  )
}

function TimelineVisual() {
  const items = [
    { label: 'Model thinking', color: SERIES.model },
    { label: 'Tool running', color: SERIES.tool },
    { label: 'Waiting for you', color: SERIES.wait },
  ]
  return (
    <ul className="flex flex-wrap gap-3">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5 text-zinc-300">
          <span className="size-2.5 rounded-sm" style={{ backgroundColor: i.color }} />
          {i.label}
        </li>
      ))}
    </ul>
  )
}

export function TipVisual({ kind }: { kind: TipVisualKind }) {
  switch (kind) {
    case 'temperature':
      return <TemperatureDemo />
    case 'messages':
      return <MessagesVisual />
    case 'steps':
      return <StepsVisual />
    case 'toolcall':
      return <ToolCallVisual />
    case 'states':
      return <StatesVisual />
    case 'chunks':
      return <ChunksVisual />
    case 'timeline':
      return <TimelineVisual />
  }
}
