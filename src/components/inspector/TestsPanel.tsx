import { useLiveQuery } from 'dexie-react-hooks'
import { CircleCheck, CircleX, ListChecks, Plus, Square, Trash } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { isBusy, useAgentStore } from '../../core/agent/store'
import type { AgentConfig, RunRecord } from '../../core/agent/types'
import { CHECK_LABELS, exampleEvalSet, newEvalSet } from '../../core/evals/checks'
import { runEvalSet, stopEvalRun, useEvalStore } from '../../core/evals/runner'
import type { CheckKind, EvalCase, EvalCaseResult, EvalSet } from '../../core/evals/types'
import { db } from '../../core/memory/db'
import { Button } from '../ui/Button'
import { inputClass } from '../ui/Field'
import { SectionTitle } from '../ui/SectionTitle'

// Status colours (reserved for pass/fail), always paired with an icon and label.
const GOOD = '#0ca30c'
const CRITICAL = '#d03b3b'

function PassBar({ results, total }: { results: EvalCaseResult[]; total: number }) {
  const passed = results.filter((r) => r.pass).length
  const pct = results.length ? Math.round((passed / results.length) * 100) : 0
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-zinc-100 tabular-nums">{pct}%</span>
        <span className="text-xs text-zinc-400">
          {passed} of {results.length} passed{results.length < total && ` · ${total - results.length} not run`}
        </span>
      </div>
      <div className="flex h-2.5 gap-[2px]" role="img" aria-label={`${passed} passed, ${results.length - passed} failed`}>
        {results.map((r, i) => (
          <div
            key={r.caseId}
            className="h-full flex-1"
            title={`Case ${i + 1}: ${r.pass ? 'pass' : 'fail'}`}
            style={{
              backgroundColor: r.pass ? GOOD : CRITICAL,
              borderTopLeftRadius: i === 0 ? 4 : 0,
              borderBottomLeftRadius: i === 0 ? 4 : 0,
              borderTopRightRadius: i === total - 1 ? 4 : 0,
              borderBottomRightRadius: i === total - 1 ? 4 : 0,
            }}
          />
        ))}
        {Array.from({ length: total - results.length }, (_, i) => (
          <div key={`pending-${i}`} className="h-full flex-1 bg-zinc-800 last:rounded-r" />
        ))}
      </div>
    </div>
  )
}

function CaseEditor({ c, index, result, onChange, onRemove, onOpenRun, disabled }: {
  c: EvalCase
  index: number
  result?: EvalCaseResult
  onChange: (c: EvalCase) => void
  onRemove: () => void
  onOpenRun: (runId: string) => void
  disabled: boolean
}) {
  return (
    <li className="space-y-1.5 rounded-md border border-zinc-800 p-2">
      <div className="flex items-start gap-2">
        <span className="mt-1.5 font-mono text-[11px] text-zinc-600">{index + 1}</span>
        <textarea
          aria-label={`Question ${index + 1}`}
          value={c.input}
          disabled={disabled}
          onChange={(e) => onChange({ ...c, input: e.target.value })}
          rows={1}
          placeholder="Question for the agent"
          className={`${inputClass} resize-y`}
        />
        <button type="button" aria-label={`Remove case ${index + 1}`} onClick={onRemove} disabled={disabled} className="mt-1 rounded p-1 text-zinc-500 hover:text-red-300">
          <Trash className="size-3.5" />
        </button>
      </div>
      <div className="grid gap-2 pl-5 sm:grid-cols-[11rem_minmax(0,1fr)]">
        <select
          aria-label={`Check for case ${index + 1}`}
          value={c.check.kind}
          disabled={disabled}
          onChange={(e) => onChange({ ...c, check: { ...c.check, kind: e.target.value as CheckKind } })}
          className={inputClass}
        >
          {(Object.keys(CHECK_LABELS) as CheckKind[]).map((k) => (
            <option key={k} value={k}>{CHECK_LABELS[k]}</option>
          ))}
        </select>
        <input
          aria-label={`Expected value for case ${index + 1}`}
          value={c.check.value}
          disabled={disabled}
          onChange={(e) => onChange({ ...c, check: { ...c.check, value: e.target.value } })}
          placeholder={c.check.kind === 'tool_used' ? 'tool name, e.g. calculator' : c.check.kind === 'regex' ? 'pattern, e.g. 39[01]' : 'expected text'}
          className={`${inputClass} font-mono`}
        />
      </div>
      {result && (
        <div className="flex items-start gap-1.5 pl-5 text-xs">
          {result.pass ? <CircleCheck className="mt-0.5 size-3.5 shrink-0" style={{ color: GOOD }} /> : <CircleX className="mt-0.5 size-3.5 shrink-0" style={{ color: CRITICAL }} />}
          <span className="font-medium text-zinc-200">{result.pass ? 'Pass' : 'Fail'}</span>
          <span className="text-zinc-400">· {result.reason} · {(result.ms / 1000).toFixed(1)} s</span>
          <button type="button" onClick={() => onOpenRun(result.runId)} className="ml-auto shrink-0 text-zinc-400 hover:text-zinc-100">
            Open run
          </button>
        </div>
      )}
      {result?.answer && <p className="line-clamp-2 pl-5 text-xs text-zinc-500">“{result.answer}”</p>}
    </li>
  )
}

/** Local copy of a set that saves to IndexedDB shortly after each edit. */
function useDraftSet(set: EvalSet | undefined) {
  const [draft, setDraft] = useState(set)
  const pending = useRef<EvalSet | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const flush = useCallback(() => {
    window.clearTimeout(timer.current)
    const next = pending.current
    pending.current = null
    // Merge so results written by a test run in the meantime are kept.
    if (next) void db.evalSets.update(next.id, { name: next.name, cases: next.cases, updatedAt: Date.now() })
  }, [])
  useEffect(() => flush, [flush])
  useEffect(() => {
    if (!pending.current) setDraft(set)
  }, [set])
  const update = (next: EvalSet) => {
    setDraft(next)
    pending.current = next
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, 400)
  }
  return [draft, update] as const
}

function SetEditor({ set, agent, onOpenRun }: { set: EvalSet; agent: AgentConfig | undefined; onOpenRun: (run: RunRecord) => void }) {
  const [draft, update] = useDraftSet(set)
  const live = useEvalStore()
  const status = useAgentStore((s) => s.status)
  const batch = useAgentStore((s) => s.batch)
  if (!draft) return null

  const runningThis = live.setId === set.id
  const shown = runningThis ? live.results : set.history[0]?.results ?? []
  const shownFor = runningThis ? agent?.name : set.history[0]?.agentName
  const resultFor = (id: string) => shown.find((r) => r.caseId === id)
  const disabled = runningThis
  const canRun = !!agent && draft.cases.some((c) => c.input.trim()) && !isBusy(status) && !batch

  const openRun = async (runId: string) => {
    const run = await db.runs.get(runId)
    if (run) onOpenRun(run)
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input aria-label="Test set name" value={draft.name} disabled={disabled} onChange={(e) => update({ ...draft, name: e.target.value })} className={inputClass} />
        <Button
          variant="danger"
          size="sm"
          className="h-auto"
          disabled={disabled}
          onClick={() => {
            if (confirm(`Delete test set "${draft.name}"?`)) void db.evalSets.delete(set.id)
          }}
        >
          Delete
        </Button>
      </div>

      <div className="space-y-2 rounded-md border border-zinc-800 bg-zinc-900/60 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-400">
            Run {draft.cases.length} {draft.cases.length === 1 ? 'case' : 'cases'} against <span className="text-zinc-200">{agent?.name ?? 'no agent'}</span>
          </span>
          <div className="ml-auto">
            {runningThis ? (
              <Button variant="danger" size="sm" onClick={stopEvalRun}>
                <Square className="size-3.5" /> Stop
              </Button>
            ) : (
              <Button variant="primary" size="sm" disabled={!canRun} onClick={() => agent && void runEvalSet({ ...draft, cases: draft.cases.filter((c) => c.input.trim()) }, agent)}>
                <ListChecks className="size-3.5" /> Run tests
              </Button>
            )}
          </div>
        </div>
        {runningThis && (
          <p className="text-xs text-zinc-400">
            Running case {Math.min(live.done + 1, live.total)} of {live.total}… (tools that ask first are denied automatically)
          </p>
        )}
        {(shown.length > 0 || runningThis) && (
          <>
            <PassBar results={shown} total={runningThis ? live.total : shown.length} />
            {shownFor && !runningThis && <p className="text-[11px] text-zinc-500">Last run: {shownFor} · {new Date(set.history[0].at).toLocaleString()}</p>}
          </>
        )}
      </div>

      <ul className="space-y-2">
        {draft.cases.map((c, i) => (
          <CaseEditor
            key={c.id}
            c={c}
            index={i}
            result={resultFor(c.id)}
            disabled={disabled}
            onChange={(next) => update({ ...draft, cases: draft.cases.map((x) => (x.id === c.id ? next : x)) })}
            onRemove={() => update({ ...draft, cases: draft.cases.filter((x) => x.id !== c.id) })}
            onOpenRun={(id) => void openRun(id)}
          />
        ))}
      </ul>
      <Button
        size="sm"
        disabled={disabled}
        onClick={() => update({ ...draft, cases: [...draft.cases, { id: crypto.randomUUID(), input: '', check: { kind: 'contains', value: '' } }] })}
      >
        <Plus className="size-3.5" /> Add case
      </Button>

      {set.history.length > 1 && (
        <section className="space-y-1.5">
          <SectionTitle>Earlier results</SectionTitle>
          <ul className="space-y-1">
            {set.history.map((h) => {
              const passed = h.results.filter((r) => r.pass).length
              return (
                <li key={h.at} className="flex items-center gap-2 text-xs">
                  <span className="w-12 font-mono text-zinc-200 tabular-nums">{Math.round((passed / h.results.length) * 100)}%</span>
                  <div className="h-1.5 w-24 rounded bg-zinc-800">
                    <div className="h-full rounded" style={{ width: `${(passed / h.results.length) * 100}%`, backgroundColor: GOOD }} />
                  </div>
                  <span className="truncate text-zinc-400">{h.agentName} · {h.modelId}</span>
                  <span className="ml-auto shrink-0 text-zinc-600">{new Date(h.at).toLocaleDateString()}</span>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}

export function TestsPanel({ agent, onOpenRun }: { agent: AgentConfig | undefined; onOpenRun: (run: RunRecord) => void }) {
  const sets = useLiveQuery(() => db.evalSets.orderBy('updatedAt').reverse().toArray(), [], undefined)
  const [selected, setSelected] = useState<string | null>(null)
  const current = sets?.find((x) => x.id === selected) ?? sets?.[0]

  const create = async (set: EvalSet) => {
    await db.evalSets.add(set)
    setSelected(set.id)
  }

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
      <SectionTitle
        tip="tests"
        action={
          <Button size="sm" variant="ghost" onClick={() => void create(newEvalSet())}>
            <Plus className="size-3.5" /> New set
          </Button>
        }
      >
        Test sets
      </SectionTitle>

      {sets && sets.length === 0 && (
        <div className="space-y-3 rounded-lg border border-dashed border-zinc-800 p-4 text-center">
          <ListChecks className="mx-auto size-6 text-zinc-500" />
          <p className="text-sm text-zinc-300">Check your agent automatically</p>
          <p className="text-xs text-zinc-500">Write questions with expected answers, run them all, and get a pass rate. Change the prompt or model and run again to see if it improved.</p>
          <Button variant="primary" onClick={() => void create(exampleEvalSet())}>
            Create a starter set
          </Button>
        </div>
      )}

      {sets && sets.length > 1 && (
        <select aria-label="Test set" value={current?.id} onChange={(e) => setSelected(e.target.value)} className={inputClass}>
          {sets.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name} · {x.cases.length} cases
            </option>
          ))}
        </select>
      )}

      {current && <SetEditor key={current.id} set={current} agent={agent} onOpenRun={onOpenRun} />}
    </div>
  )
}
