import { ArrowLeft, Download, LoaderCircle, MessagesSquare, Play, Sparkles, Square, TriangleExclamationPoint } from 'lucide-react'
import { useRef, useState } from 'react'
import { preloadModel, rerunFrom, sendMessage, stopRun } from '../../core/agent/session'
import { isBusy, useAgentStore } from '../../core/agent/store'
import type { AgentConfig, RunRecord } from '../../core/agent/types'
import type { GpuProfile } from '../../core/engine/webgpu'
import { db } from '../../core/memory/db'
import { Button } from '../ui/Button'
import { inputClass } from '../ui/Field'
import { InfoTip } from '../ui/InfoTip'
import { SectionTitle } from '../ui/SectionTitle'
import { examplePrompts } from '../viz/examples'
import { HowItWorks } from '../viz/HowItWorks'
import { RunTimeline } from '../viz/RunTimeline'
import { StatusPipeline } from '../viz/StatusPipeline'
import { ApprovalGate } from './ApprovalGate'
import { EditStepModal } from './EditStepModal'
import { LiveReply } from './LiveReply'
import { TraceView } from './TraceView'

function download(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

function jumpToStep(stepId: string) {
  const el = document.getElementById(`step-${stepId}`)
  if (!el) return
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  el.classList.add('ring-2', 'ring-emerald-400/70')
  window.setTimeout(() => el.classList.remove('ring-2', 'ring-emerald-400/70'), 1400)
}

export function RunPanel({ agent, gpu }: { agent: AgentConfig | undefined; gpu: GpuProfile | null }) {
  const status = useAgentStore((s) => s.status)
  const error = useAgentStore((s) => s.error)
  const loadProgress = useAgentStore((s) => s.loadProgress)
  const loadMessage = useAgentStore((s) => s.loadMessage)
  const loadedModelId = useAgentStore((s) => s.loadedModelId)
  const trace = useAgentStore((s) => s.trace)
  const pending = useAgentStore((s) => s.pendingApproval)
  const viewedRun = useAgentStore((s) => s.viewedRun)
  const lastRun = useAgentStore((s) => s.lastRun)
  const viewRun = useAgentStore((s) => s.viewRun)
  const stream = useAgentStore((s) => s.stream)
  const batch = useAgentStore((s) => s.batch)
  const chatAll = useAgentStore((s) => s.chat)
  const chatAgentId = useAgentStore((s) => s.chatAgentId)
  const resetChat = useAgentStore((s) => s.resetChat)
  const [message, setMessage] = useState('')
  const [editing, setEditing] = useState<{ run: RunRecord; index: number } | null>(null)
  const [rerunError, setRerunError] = useState<string | null>(null)
  const box = useRef<HTMLTextAreaElement>(null)

  const chat = agent && chatAgentId === agent.id ? chatAll : []
  const busy = isBusy(status) || batch !== null
  const isLocal = agent?.provider === 'webllm'
  const needsLoad = isLocal && loadedModelId !== agent.modelId
  const noGpu = isLocal && gpu !== null && !gpu.supported
  const steps = viewedRun ? viewedRun.steps : trace
  const exportable = viewedRun ?? lastRun
  // Steps can be edited once a run is saved: a viewed run, or the live trace after it finished.
  const editableRun = viewedRun ?? (lastRun && lastRun.steps === trace ? lastRun : null)

  const rerun = async (text: string) => {
    if (!editing) return
    const { run: from, index } = editing
    setEditing(null)
    setRerunError(await rerunFrom(from, index, text))
  }

  const run = async () => {
    if (!agent || !message.trim()) return
    // Read the saved row so edits made a moment ago are included.
    const latest = (await db.agents.get(agent.id)) ?? agent
    const text = message.trim()
    setMessage('')
    await sendMessage(latest, text)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-3 border-b border-zinc-800 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{agent?.name ?? 'No agent selected'}</span>
          {isLocal && !needsLoad && <span className="text-xs text-emerald-400">● model ready</span>}
          <div className="ml-auto flex gap-1">
            {isLocal && needsLoad && (
              <Button size="sm" disabled={busy || noGpu} onClick={() => void preloadModel(agent.modelId)}>
                <Download className="size-3.5" /> Load model
              </Button>
            )}
            {exportable && (
              <Button size="sm" variant="ghost" onClick={() => download(`kantolab-run-${exportable.id.slice(0, 8)}.json`, exportable)}>
                Export JSON
              </Button>
            )}
          </div>
        </div>

        <StatusPipeline status={viewedRun ? 'IDLE' : status} trace={steps} maxSteps={viewedRun ? undefined : agent?.maxSteps} />

        {noGpu && (
          <p className="flex items-start gap-2 rounded bg-red-500/10 p-2 text-xs text-red-300">
            <TriangleExclamationPoint className="mt-0.5 size-3.5 shrink-0" />
            Local models need WebGPU: {gpu.reason} Try a recent Chrome or Edge, or switch this agent to a bring-your-own-key provider.
          </p>
        )}

        {status === 'LOADING_MODEL' && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-zinc-400">
              <span>Loading model (first time downloads it; later loads use the cache)</span>
              <span className="font-mono text-zinc-200">{Math.round(loadProgress * 100)}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded bg-zinc-800" role="progressbar" aria-valuenow={Math.round(loadProgress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded bg-sky-400 transition-[width]" style={{ width: `${Math.round(loadProgress * 100)}%` }} />
            </div>
            <p className="truncate text-[11px] text-zinc-500">{loadMessage}</p>
          </div>
        )}

        {rerunError && (
          <p className="flex items-start gap-2 rounded bg-red-500/10 p-2 text-xs text-red-300">
            {rerunError}
            <button type="button" onClick={() => setRerunError(null)} className="ml-auto text-red-200 hover:text-white">
              Dismiss
            </button>
          </p>
        )}

        {error && status === 'ERROR' && <p className="rounded bg-red-500/10 p-2 text-xs text-red-300">{error}</p>}

        <div className="flex gap-2">
          <textarea
            ref={box}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void run()
            }}
            rows={2}
            placeholder={chat.length ? 'Ask a follow-up… (⌘/Ctrl + Enter)' : 'Ask the agent something… (⌘/Ctrl + Enter to run)'}
            className={`${inputClass} resize-y`}
          />
          {busy && status !== 'LOADING_MODEL' && !batch ? (
            <Button variant="danger" onClick={stopRun} className="h-auto">
              <Square className="size-4" /> Stop
            </Button>
          ) : (
            <Button variant="primary" className="h-auto" disabled={!agent || !message.trim() || busy || noGpu} onClick={() => void run()}>
              {status === 'LOADING_MODEL' ? <LoaderCircle className="size-4 animate-spin" /> : <Play className="size-4" />} Run
            </Button>
          )}
        </div>

        {batch && (
          <p className="text-xs text-zinc-400">
            A {batch === 'compare' ? 'comparison' : 'test run'} is using the agent. Its live steps show here; manage it from the {batch === 'compare' ? 'Compare' : 'Tests'} tab.
          </p>
        )}

        {chat.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <MessagesSquare className="size-3.5" />
            Chat · {chat.length} earlier {chat.length === 1 ? 'turn' : 'turns'}
            <InfoTip id="chat" />
            <button type="button" onClick={resetChat} disabled={busy} className="ml-auto rounded px-2 py-0.5 text-zinc-300 hover:bg-zinc-800 disabled:text-zinc-600">
              New chat
            </button>
          </div>
        )}

        {agent && !message && !busy && chat.length === 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Sparkles className="size-3.5 text-zinc-500" aria-hidden />
            <span className="text-xs text-zinc-500">Try:</span>
            {examplePrompts(agent.toolNames).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setMessage(p)
                  box.current?.focus()
                }}
                className="rounded-full border border-zinc-800 px-2.5 py-0.5 text-xs text-zinc-300 transition-colors hover:border-emerald-500/50 hover:text-emerald-200"
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {viewedRun && (
          <div className="flex items-center gap-2 rounded bg-zinc-800/60 px-2 py-1.5 text-xs text-zinc-300">
            <span className="truncate">
              Viewing saved run · {viewedRun.agentName} · {new Date(viewedRun.startedAt).toLocaleString()}
            </span>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => viewRun(null)}>
              <ArrowLeft className="size-3.5" /> Live
            </Button>
          </div>
        )}
        {!viewedRun && chat.length > 0 && (
          <details className="rounded-md border border-zinc-800 p-2 text-xs">
            <summary className="cursor-pointer text-zinc-400">Earlier in this chat</summary>
            <ol className="mt-2 space-y-2">
              {chat.map((t) => (
                <li key={t.id} className="space-y-0.5">
                  <p className="text-sky-200">
                    <span className="text-zinc-500">You:</span> {t.user}
                  </p>
                  <p className="text-emerald-200">
                    <span className="text-zinc-500">Agent:</span> {t.answer}
                  </p>
                </li>
              ))}
            </ol>
          </details>
        )}
        {!viewedRun && pending && <ApprovalGate pending={pending} />}
        {steps.length === 0 && !stream ? (
          <HowItWorks toolCount={agent?.toolNames.length ?? 0} />
        ) : (
          <>
            <RunTimeline steps={steps} onJump={jumpToStep} />
            <SectionTitle tip="trace">Trace · {steps.length} steps</SectionTitle>
            {editableRun && !busy && (
              <p className="text-[11px] text-zinc-500">
                Hover a step and press <span className="text-zinc-300">Edit</span> to change a reply or tool result and re-run from there. <InfoTip id="rerun" />
              </p>
            )}
            <TraceView
              steps={steps}
              follow={!viewedRun}
              onEdit={editableRun && !busy ? (index) => setEditing({ run: editableRun, index }) : undefined}
            />
          </>
        )}
        {!viewedRun && stream && <LiveReply stream={stream} />}
        {editing && <EditStepModal run={editing.run} index={editing.index} onClose={() => setEditing(null)} onRun={(text) => void rerun(text)} />}
      </div>
    </div>
  )
}
