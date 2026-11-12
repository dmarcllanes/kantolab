import { ArrowRight, Bot, FileText, ListChecks } from 'lucide-react'
import { useState } from 'react'
import { DEFAULT_WEBLLM_MODEL } from '../../core/agent/agents'
import { useAgentStore } from '../../core/agent/store'
import { agentToolName } from '../../core/agent/subagent'
import { installTemplate, TEMPLATES, type AgentTemplate, type InstalledTemplate, type ModelChoice } from '../../core/agent/templates'
import type { AgentConfig } from '../../core/agent/types'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'

function Wiring({ t }: { t: AgentTemplate }) {
  const entry = t.agents.find((a) => a.key === t.entry)!
  const helpers = t.agents.filter((a) => a.key !== t.entry)
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="flex items-center gap-1 rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-100">
        <Bot className="size-3" /> {entry.name}
      </span>
      <ArrowRight className="size-3 text-zinc-500" aria-label="calls" />
      {helpers.map((h) => (
        <span key={h.key} className="rounded border border-zinc-700 px-1.5 py-0.5 font-mono text-[11px] text-zinc-300" title={`${h.name}${h.toolNames.length ? ` · tools: ${h.toolNames.join(', ')}` : ''}`}>
          {agentToolName(h.name)}
        </span>
      ))}
    </div>
  )
}

export function TemplatesModal({ current, onClose }: { current: AgentConfig | undefined; onClose: () => void }) {
  const select = useAgentStore((s) => s.selectAgent)
  const [busy, setBusy] = useState<string | null>(null)
  const [done, setDone] = useState<{ t: AgentTemplate; result: InstalledTemplate } | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  const model: ModelChoice = current
    ? { provider: current.provider, modelId: current.modelId, baseUrl: current.baseUrl }
    : { provider: 'webllm', modelId: DEFAULT_WEBLLM_MODEL, baseUrl: '' }

  const install = async (t: AgentTemplate) => {
    setBusy(t.id)
    setProblem(null)
    try {
      const result = await installTemplate(t, model)
      select(result.entryId)
      setDone({ t, result })
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  if (done) {
    const entry = done.result.agents.find((a) => a.id === done.result.entryId)!
    return (
      <Modal title="Template added" onClose={onClose}>
        <div className="space-y-3 text-sm">
          <p className="text-zinc-200">
            Added {done.result.agents.length} agents. <span className="text-zinc-100">{entry.name}</span> is selected: ask it something and watch it delegate in the trace.
          </p>
          {done.result.evalSet && (
            <p className="flex items-start gap-1.5 text-xs text-zinc-400">
              <ListChecks className="mt-0.5 size-3.5 shrink-0" /> A test set “{done.result.evalSet.name}” is ready in the Tests tab. Run it, change a prompt, run it again and compare.
            </p>
          )}
          {done.t.documents && (
            <p className="flex items-start gap-1.5 text-xs text-zinc-400">
              <FileText className="mt-0.5 size-3.5 shrink-0" /> Added the sample document{done.t.documents.length > 1 ? 's' : ''} {done.t.documents.map((d) => `“${d.title}”`).join(', ')} (skipped if you already had it).
            </p>
          )}
          <div className="flex justify-end">
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title="Start from a template" onClose={onClose} wide>
      <div className="space-y-3 text-sm">
        <p className="text-xs text-zinc-400">
          Each template adds a few agents wired together as tools, plus a test set. All of them use{' '}
          <span className="font-mono text-zinc-200">{model.provider === 'webllm' ? model.modelId : `${model.provider} · ${model.modelId || '—'}`}</span>
          {current ? ` (from “${current.name}”)` : ''}, so a local model only downloads once. Everything stays editable.
        </p>
        {problem && <p className="rounded bg-red-500/10 p-2 text-xs text-red-300">{problem}</p>}
        <ul className="space-y-2">
          {TEMPLATES.map((t) => (
            <li key={t.id} className="space-y-2 rounded-md border border-zinc-800 p-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium text-zinc-100">{t.name}</h3>
                  <p className="mt-0.5 text-xs text-zinc-400">{t.description}</p>
                </div>
                <Button size="sm" variant="primary" disabled={busy !== null} onClick={() => void install(t)}>
                  {busy === t.id ? 'Adding…' : 'Add'}
                </Button>
              </div>
              <Wiring t={t} />
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  )
}
