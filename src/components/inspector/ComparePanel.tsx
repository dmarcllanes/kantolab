import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, Columns2, Square } from 'lucide-react'
import { useState } from 'react'
import { runComparison, stopComparison, summarize, useCompareStore, type RunSummary } from '../../core/agent/compare'
import { isBusy, useAgentStore } from '../../core/agent/store'
import type { AgentConfig, RunRecord } from '../../core/agent/types'
import { db } from '../../core/memory/db'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { inputClass } from '../ui/Field'
import { SectionTitle } from '../ui/SectionTitle'
import { RunTimeline } from '../viz/RunTimeline'
import { StatusPipeline } from '../viz/StatusPipeline'
import { ApprovalGate } from './ApprovalGate'
import { LiveReply } from './LiveReply'
import { TraceView } from './TraceView'
import { GuideNote } from '../guide/GuideNote'

const secs = (ms: number) => `${(ms / 1000).toFixed(2)} s`

// Only metrics where less is clearly better get a winner; fewer tool calls can just mean a lazier agent.
type Metric = { label: string; get: (s: RunSummary) => number; fmt: (n: number) => string; better: 'lower' | null }
const METRICS: Metric[] = [
  { label: 'Total time', get: (s) => s.totalMs, fmt: secs, better: 'lower' },
  { label: 'Model calls', get: (s) => s.modelCalls, fmt: String, better: null },
  { label: 'Tool calls', get: (s) => s.toolCalls, fmt: String, better: null },
  { label: 'Format errors', get: (s) => s.formatErrors, fmt: String, better: 'lower' },
]

const OUTCOME_TONE = { completed: 'green', error: 'red', stopped: 'amber' } as const

function SummaryTable({ a, b }: { a: RunRecord; b: RunRecord }) {
  const sa = summarize(a)
  const sb = summarize(b)
  return (
    <div className="overflow-x-auto rounded-md border border-zinc-800">
      <table className="w-full text-xs">
        <thead className="bg-zinc-900 text-zinc-400">
          <tr>
            <th className="px-2 py-1.5 text-left font-medium" />
            <th className="px-2 py-1.5 text-left font-medium">A · {a.agentName}</th>
            <th className="px-2 py-1.5 text-left font-medium">B · {b.agentName}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800">
          <tr>
            <th scope="row" className="px-2 py-1.5 text-left font-normal text-zinc-400">Outcome</th>
            <td className="px-2 py-1.5"><Badge tone={OUTCOME_TONE[a.outcome]}>{a.outcome}</Badge></td>
            <td className="px-2 py-1.5"><Badge tone={OUTCOME_TONE[b.outcome]}>{b.outcome}</Badge></td>
          </tr>
          {METRICS.map((m) => {
            const va = m.get(sa)
            const vb = m.get(sb)
            const aWins = m.better === 'lower' && va < vb
            const bWins = m.better === 'lower' && vb < va
            return (
              <tr key={m.label}>
                <th scope="row" className="px-2 py-1.5 text-left font-normal text-zinc-400">{m.label}</th>
                <td className={`px-2 py-1.5 font-mono ${aWins ? 'text-emerald-300' : 'text-zinc-200'}`}>
                  {m.fmt(va)} {aWins && <span className="font-sans text-[10px]">✓ better</span>}
                </td>
                <td className={`px-2 py-1.5 font-mono ${bWins ? 'text-emerald-300' : 'text-zinc-200'}`}>
                  {m.fmt(vb)} {bWins && <span className="font-sans text-[10px]">✓ better</span>}
                </td>
              </tr>
            )
          })}
          <tr className="align-top">
            <th scope="row" className="px-2 py-1.5 text-left font-normal text-zinc-400">Answer</th>
            <td className="px-2 py-1.5 whitespace-pre-wrap text-zinc-200">{sa.answer || '—'}</td>
            <td className="px-2 py-1.5 whitespace-pre-wrap text-zinc-200">{sb.answer || '—'}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function RunColumn({ label, run, onOpen }: { label: string; run: RunRecord; onOpen: () => void }) {
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <span className="font-semibold text-zinc-200">{label}</span>
        <span className="truncate text-zinc-400">{run.agentName}</span>
        <button type="button" onClick={onOpen} className="ml-auto flex items-center gap-1 text-zinc-400 hover:text-zinc-100">
          Open <ArrowRight className="size-3" />
        </button>
      </div>
      <RunTimeline steps={run.steps} onJump={() => onOpen()} />
      <details className="text-xs">
        <summary className="cursor-pointer text-zinc-400">Trace · {run.steps.length} steps</summary>
        <div className="mt-2">
          <TraceView steps={run.steps} follow={false} />
        </div>
      </details>
    </div>
  )
}

export function ComparePanel({ current, onOpenRun }: { current: AgentConfig | undefined; onOpenRun: (run: RunRecord) => void }) {
  const agents = useLiveQuery(() => db.agents.orderBy('updatedAt').reverse().toArray(), [], [])
  const { message, setMessage, a, b, running } = useCompareStore()
  const status = useAgentStore((s) => s.status)
  const trace = useAgentStore((s) => s.trace)
  const stream = useAgentStore((s) => s.stream)
  const pending = useAgentStore((s) => s.pendingApproval)
  const batch = useAgentStore((s) => s.batch)
  const ids = useCompareIds(agents, current)

  const agentA = agents.find((x) => x.id === ids.a)
  const agentB = agents.find((x) => x.id === ids.b)
  const blocked = (isBusy(status) || batch !== null) && !running

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
      <SectionTitle tip="compare">Compare two agents</SectionTitle>
      <GuideNote id="compare" />

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <select aria-label="Agent A" value={ids.a} onChange={(e) => ids.setA(e.target.value)} className={inputClass} disabled={!!running}>
          {agents.map((x) => (
            <option key={x.id} value={x.id}>A · {x.name}</option>
          ))}
        </select>
        <span className="text-xs text-zinc-500">vs</span>
        <select aria-label="Agent B" value={ids.b} onChange={(e) => ids.setB(e.target.value)} className={inputClass} disabled={!!running}>
          {agents.map((x) => (
            <option key={x.id} value={x.id}>B · {x.name}</option>
          ))}
        </select>
      </div>
      {agents.length < 2 && <p className="text-xs text-zinc-500">Tip: duplicate an agent in the list and change its model or prompt, then compare them.</p>}

      <div className="flex gap-2">
        <textarea
          aria-label="Question to compare"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={2}
          placeholder="One question, sent to both agents…"
          className={`${inputClass} resize-y`}
        />
        {running ? (
          <Button variant="danger" className="h-auto" onClick={stopComparison}>
            <Square className="size-4" /> Stop
          </Button>
        ) : (
          <Button
            variant="primary"
            className="h-auto"
            disabled={!agentA || !agentB || !message.trim() || blocked}
            onClick={() => agentA && agentB && void runComparison(agentA, agentB, message.trim())}
          >
            <Columns2 className="size-4" /> Compare
          </Button>
        )}
      </div>

      {running && (
        <div className="space-y-2 rounded-md border border-zinc-800 p-3">
          <p className="text-xs text-zinc-300">
            Running <span className="font-semibold">{running.toUpperCase()}</span> · {running === 'a' ? agentA?.name : agentB?.name}
            {running === 'b' && ' (A is done)'}
          </p>
          <StatusPipeline status={status} trace={trace} />
          {pending && <ApprovalGate pending={pending} />}
          {stream && <LiveReply stream={stream} />}
        </div>
      )}

      {a && b && <SummaryTable a={a} b={b} />}
      {(a || b) && (
        <div className="grid gap-4 md:grid-cols-2">
          {a && <RunColumn label="A" run={a} onOpen={() => onOpenRun(a)} />}
          {b && <RunColumn label="B" run={b} onOpen={() => onOpenRun(b)} />}
        </div>
      )}
    </div>
  )
}


/** Selected agent ids for A and B, defaulting to the current agent and the next one. */
function useCompareIds(agents: AgentConfig[], current: AgentConfig | undefined) {
  const [a, setA] = useState<string | null>(null)
  const [b, setB] = useState<string | null>(null)
  const fallbackA = current?.id ?? agents[0]?.id ?? ''
  const resolvedA = a && agents.some((x) => x.id === a) ? a : fallbackA
  const fallbackB = agents.find((x) => x.id !== resolvedA)?.id ?? resolvedA
  const resolvedB = b && agents.some((x) => x.id === b) ? b : fallbackB
  return { a: resolvedA, b: resolvedB, setA, setB }
}
