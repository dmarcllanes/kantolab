import { TriangleExclamationPoint } from 'lucide-react'
import { useState } from 'react'
import { importBundle, type AgentBundle } from '../../core/agent/share'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'

export function ImportAgentModal({ bundle, onClose, onImported }: { bundle: AgentBundle; onClose: () => void; onImported: (agentId: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const { agent, customTools } = bundle

  const confirm = async () => {
    setBusy(true)
    try {
      const created = await importBundle(bundle)
      onImported(created.id)
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <Modal title="Import a shared agent" onClose={onClose} wide>
      <div className="space-y-4 text-sm">
        <div className="space-y-1">
          <p className="text-base font-semibold">{agent.name}</p>
          <p className="font-mono text-xs text-zinc-400">
            {agent.provider} · {agent.modelId || '—'} · max {agent.maxSteps} steps · temperature {agent.temperature}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {agent.toolNames.map((t) => (
            <Badge key={t} tone={customTools.some((c) => c.name === t) ? 'violet' : 'neutral'}>{t}</Badge>
          ))}
          {agent.toolNames.length === 0 && <span className="text-xs text-zinc-500">No tools</span>}
        </div>
        <details className="rounded-md border border-zinc-800 p-2">
          <summary className="cursor-pointer text-xs text-zinc-400">System prompt</summary>
          <pre className="mt-2 max-h-48 overflow-auto font-mono text-xs whitespace-pre-wrap text-zinc-300">{agent.systemPrompt}</pre>
        </details>

        {customTools.length > 0 && (
          <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
            <p className="flex items-center gap-2 text-xs text-amber-200">
              <TriangleExclamationPoint className="size-4 shrink-0" />
              This agent brings {customTools.length} custom {customTools.length === 1 ? 'tool' : 'tools'} with JavaScript code. It runs sandboxed, but only import code you’re comfortable running.
            </p>
            {customTools.map((t) => (
              <details key={t.name} className="rounded bg-zinc-950 p-2">
                <summary className="cursor-pointer font-mono text-xs text-zinc-200">
                  {t.name} <span className="font-sans text-zinc-500">· review code</span>
                </summary>
                <pre className="mt-2 max-h-48 overflow-auto font-mono text-xs whitespace-pre-wrap text-zinc-300">{t.code}</pre>
              </details>
            ))}
          </div>
        )}

        {agent.provider !== 'webllm' && <p className="text-xs text-zinc-500">This agent uses a bring-your-own-key provider. Add your own key in Settings to run it.</p>}
        {problem && <p className="rounded bg-red-500/10 p-2 text-xs text-red-300">{problem}</p>}

        <div className="flex gap-2">
          <Button variant="primary" disabled={busy} onClick={() => void confirm()}>
            Import agent
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  )
}
