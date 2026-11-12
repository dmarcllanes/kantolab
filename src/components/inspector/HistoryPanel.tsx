import { useLiveQuery } from 'dexie-react-hooks'
import { Trash, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod/v3'
import { useAgentStore } from '../../core/agent/store'
import { runRecordSchema, type RunRecord } from '../../core/agent/types'
import { db } from '../../core/memory/db'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { InfoTip } from '../ui/InfoTip'
import { GuideNote } from '../guide/GuideNote'

const sampleIndexSchema = z.array(z.object({ file: z.string(), title: z.string(), description: z.string() }))
type Sample = z.infer<typeof sampleIndexSchema>[number]

const OUTCOME_TONE = { completed: 'green', error: 'red', stopped: 'amber' } as const

function RunRow({ run, onOpen, onDelete }: { run: RunRecord; onOpen: () => void; onDelete?: () => void }) {
  return (
    <li className="flex items-center gap-2 rounded-md border border-zinc-800 p-2 hover:border-zinc-700">
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm">{run.agentName}</span>
          <Badge tone={OUTCOME_TONE[run.outcome]}>{run.outcome}</Badge>
          {run.rerunOf && <Badge tone="amber">re-run</Badge>}
        </div>
        <p className="truncate text-xs text-zinc-500">
          {new Date(run.startedAt).toLocaleString()} · {run.steps.length} steps · {run.userMessage}
        </p>
      </button>
      {onDelete && (
        <button type="button" aria-label="Delete run" onClick={onDelete} className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-red-300">
          <Trash className="size-3.5" />
        </button>
      )}
    </li>
  )
}

export function HistoryPanel({ onOpened }: { onOpened: () => void }) {
  const viewRun = useAgentStore((s) => s.viewRun)
  const runs = useLiveQuery(() => db.runs.orderBy('startedAt').reverse().limit(100).toArray(), [], [])
  const [samples, setSamples] = useState<Sample[]>([])
  const [problem, setProblem] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}samples/index.json`)
      .then((r) => r.json())
      .then((j) => setSamples(sampleIndexSchema.parse(j)))
      .catch(() => setSamples([]))
  }, [])

  const open = (run: RunRecord) => {
    viewRun(run)
    onOpened()
  }

  const openJson = (raw: unknown, source: string) => {
    const parsed = runRecordSchema.safeParse(raw)
    if (!parsed.success) {
      setProblem(`${source} is not a valid KantoLab transcript.`)
      return
    }
    setProblem(null)
    open(parsed.data)
  }

  const openSample = async (s: Sample) => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}samples/${s.file}`)
      openJson(await res.json(), s.title)
    } catch {
      setProblem(`Could not load ${s.title}.`)
    }
  }

  const importFile = async (file: File) => {
    try {
      openJson(JSON.parse(await file.text()), file.name)
    } catch {
      setProblem(`${file.name} is not valid JSON.`)
    }
  }

  return (
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3">
      <GuideNote id="history" />
      {problem && <p className="rounded bg-red-500/10 p-2 text-xs text-red-300">{problem}</p>}

      <section className="space-y-2">
        <h3 className="flex items-center gap-1 text-xs font-semibold tracking-wide text-zinc-400 uppercase">
          Sample transcripts <InfoTip id="history" />
        </h3>
        <p className="text-xs text-zinc-500">Recorded runs you can inspect without downloading a model.</p>
        <ul className="space-y-1.5">
          {samples.map((s) => (
            <li key={s.file}>
              <button type="button" onClick={() => void openSample(s)} className="w-full rounded-md border border-zinc-800 p-2 text-left hover:border-zinc-700">
                <span className="text-sm">{s.title}</span>
                <span className="block text-xs text-zinc-500">{s.description}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">Your runs</h3>
          <div className="ml-auto flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => fileInput.current?.click()}>
              <Upload className="size-3.5" /> Import
            </Button>
            {runs.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (confirm('Delete all saved runs?')) void db.runs.clear()
                }}
              >
                Clear
              </Button>
            )}
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void importFile(f)
              e.target.value = ''
            }}
          />
        </div>
        {runs.length === 0 ? (
          <p className="text-xs text-zinc-500">Runs are saved here automatically, in this browser only.</p>
        ) : (
          <ul className="space-y-1.5">
            {runs.map((r) => (
              <RunRow key={r.id} run={r} onOpen={() => open(r)} onDelete={() => void db.runs.delete(r.id)} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
