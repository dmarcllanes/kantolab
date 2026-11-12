import { ChevronRight, CopyPlus } from 'lucide-react'
import { useState } from 'react'
import { newAgent } from '../../core/agent/agents'
import { useAgentStore } from '../../core/agent/store'
import type { EvalResult, EvalSet } from '../../core/evals/types'
import { agentFromSnapshot, caseChanges, diffSnapshots, passRate, previousFor, type SnapshotChange } from '../../core/evals/versions'
import { db } from '../../core/memory/db'
import { SectionTitle } from '../ui/SectionTitle'

const GOOD = '#0ca30c'
const CRITICAL = '#d03b3b'

const FIELD_LABEL: Record<SnapshotChange['field'], string> = {
  provider: 'Provider',
  model: 'Model',
  systemPrompt: 'System prompt',
  tools: 'Tools',
  temperature: 'Temperature',
  maxSteps: 'Max steps',
  name: 'Name',
}

function ChangeView({ change }: { change: SnapshotChange }) {
  if (change.field === 'systemPrompt') {
    return (
      <div className="space-y-1">
        <div className="text-zinc-400">{FIELD_LABEL.systemPrompt}</div>
        <pre className="max-h-60 overflow-auto rounded bg-zinc-950 p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
          {change.lines.map((l, i) => (
            <div
              // Diff lines are a fixed, re-computed list with no identity of their own.
              // oxlint-disable-next-line react/no-array-index-key
              key={i}
              className={l.op === 'add' ? 'bg-emerald-500/10 text-emerald-200' : l.op === 'del' ? 'bg-red-500/10 text-red-300 line-through decoration-red-400/40' : 'text-zinc-500'}
            >
              <span aria-hidden className="mr-2 inline-block w-2 select-none">
                {l.op === 'add' ? '+' : l.op === 'del' ? '−' : ' '}
              </span>
              <span className="sr-only">{l.op === 'add' ? 'added: ' : l.op === 'del' ? 'removed: ' : ''}</span>
              {l.text || ' '}
            </div>
          ))}
        </pre>
      </div>
    )
  }
  if (change.field === 'tools') {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-zinc-400">Tools</span>
        {change.added.map((t) => (
          <span key={`+${t}`} className="rounded bg-emerald-500/10 px-1.5 font-mono text-[11px] text-emerald-200">
            + {t}
          </span>
        ))}
        {change.removed.map((t) => (
          <span key={`-${t}`} className="rounded bg-red-500/10 px-1.5 font-mono text-[11px] text-red-300">
            − {t}
          </span>
        ))}
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-zinc-400">{FIELD_LABEL[change.field]}</span>
      <span className="font-mono text-[11px] text-red-300 line-through">{change.before}</span>
      <span className="text-zinc-500">→</span>
      <span className="font-mono text-[11px] text-emerald-200">{change.after}</span>
    </div>
  )
}

function Delta({ now, before }: { now: number; before: number }) {
  const pts = Math.round((now - before) * 100)
  if (pts === 0) return <span className="w-12 font-mono text-[11px] text-zinc-500">±0</span>
  return (
    <span className="w-12 font-mono text-[11px]" style={{ color: pts > 0 ? GOOD : CRITICAL }} title={`${pts > 0 ? 'Up' : 'Down'} ${Math.abs(pts)} points from the previous run of this agent`}>
      {pts > 0 ? '▲' : '▼'} {Math.abs(pts)}
    </span>
  )
}

function VersionRow({ set, index }: { set: EvalSet; index: number }) {
  const [open, setOpen] = useState(false)
  const select = useAgentStore((s) => s.selectAgent)
  const h: EvalResult = set.history[index]
  const prev = previousFor(set.history, index)
  const rate = passRate(h)
  const changes = h.snapshot && prev?.snapshot ? diffSnapshots(prev.snapshot, h.snapshot) : null
  const flips = prev ? caseChanges(prev, h) : null
  const caseNo = (id: string) => set.cases.findIndex((c) => c.id === id) + 1

  const tryVersion = async () => {
    if (!h.snapshot) return
    const agent = agentFromSnapshot(h.snapshot, h.at, newAgent)
    await db.agents.add(agent)
    select(agent.id)
  }

  return (
    <li className="rounded-md border border-zinc-800/80">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-zinc-900">
        <ChevronRight className={`size-3 shrink-0 text-zinc-500 transition-transform ${open ? 'rotate-90' : ''}`} />
        <span className="w-9 font-mono text-zinc-200 tabular-nums">{Math.round(rate * 100)}%</span>
        {prev ? <Delta now={rate} before={passRate(prev)} /> : <span className="w-12" />}
        <div className="h-1.5 w-16 shrink-0 rounded bg-zinc-800">
          <div className="h-full rounded" style={{ width: `${rate * 100}%`, backgroundColor: GOOD }} />
        </div>
        <span className="min-w-0 truncate text-zinc-400">
          {h.agentName}
          {changes && changes.length > 0 && <span className="text-zinc-500"> · changed {changes.map((c) => FIELD_LABEL[c.field].toLowerCase()).join(', ')}</span>}
        </span>
        <span className="ml-auto shrink-0 text-zinc-600">{new Date(h.at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-zinc-800/80 px-3 py-2 text-xs">
          {flips && (flips.fixed.length > 0 || flips.broke.length > 0) && (
            <p className="text-zinc-300">
              {flips.fixed.length > 0 && <span style={{ color: GOOD }}>Fixed case {flips.fixed.map(caseNo).filter(Boolean).join(', ')}. </span>}
              {flips.broke.length > 0 && <span style={{ color: CRITICAL }}>Broke case {flips.broke.map(caseNo).filter(Boolean).join(', ')}.</span>}
            </p>
          )}
          {!prev && <p className="text-zinc-500">First run of this agent on this set.</p>}
          {prev && !changes && <p className="text-zinc-500">No settings recorded for one of these runs (made before versions were tracked).</p>}
          {changes && changes.length === 0 && <p className="text-zinc-500">Same settings as the previous run: any difference is the model’s randomness.</p>}
          {changes?.map((c) => (
            <ChangeView key={c.field} change={c} />
          ))}
          {h.snapshot && (
            <button type="button" onClick={() => void tryVersion()} className="flex items-center gap-1 text-zinc-400 hover:text-zinc-100">
              <CopyPlus className="size-3.5" /> Restore as a new agent
            </button>
          )}
        </div>
      )}
    </li>
  )
}

/** Every test run of a set, newest first, with the pass-rate change and what was edited in between. */
export function VersionHistory({ set }: { set: EvalSet }) {
  if (set.history.length === 0) return null
  return (
    <section className="space-y-1.5">
      <SectionTitle tip="versions">Versions & results</SectionTitle>
      <ul className="space-y-1">
        {set.history.map((h, i) => (
          <VersionRow key={h.at} set={set} index={i} />
        ))}
      </ul>
    </section>
  )
}
