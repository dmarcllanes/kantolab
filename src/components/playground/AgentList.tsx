import { useLiveQuery } from 'dexie-react-hooks'
import { Copy, FileUp, Plus, Share2, Trash } from 'lucide-react'
import { useRef, useState } from 'react'
import { deleteAgent, duplicateAgent, newAgent } from '../../core/agent/agents'
import { parseBundle, type AgentBundle } from '../../core/agent/share'
import { useAgentStore } from '../../core/agent/store'
import type { AgentConfig } from '../../core/agent/types'
import { db } from '../../core/memory/db'
import { Button } from '../ui/Button'
import { ImportAgentModal } from './ImportAgentModal'
import { ShareModal } from './ShareModal'

export function AgentList() {
  const agents = useLiveQuery(() => db.agents.orderBy('updatedAt').reverse().toArray(), [], [])
  const selectedId = useAgentStore((s) => s.selectedAgentId)
  const select = useAgentStore((s) => s.selectAgent)
  const [sharing, setSharing] = useState<AgentConfig | null>(null)
  const [importing, setImporting] = useState<AgentBundle | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const create = async () => {
    const a = newAgent()
    await db.agents.add(a)
    select(a.id)
  }

  const remove = async (id: string, name: string) => {
    if (!confirm(`Delete agent "${name}"? Its saved runs stay in History, and agents that used it as a tool lose that tool.`)) return
    await deleteAgent(id)
    if (selectedId === id) select(agents.find((a) => a.id !== id)?.id ?? null)
  }

  const importFile = async (file: File) => {
    try {
      setImporting(parseBundle(JSON.parse(await file.text())))
      setProblem(null)
    } catch (e) {
      setProblem(`${file.name}: ${e instanceof Error ? e.message : 'not a KantoLab agent file'}`)
    }
  }

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center gap-1 px-3 py-2">
        <h2 className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">Agents</h2>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => fileInput.current?.click()} title="Import an agent file">
          <FileUp className="size-3.5" /> Import
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void create()}>
          <Plus className="size-3.5" /> New
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void importFile(f)
            e.target.value = ''
          }}
        />
      </div>
      {problem && <p className="mx-3 mb-2 rounded bg-red-500/10 p-2 text-xs text-red-300">{problem}</p>}
      <ul className="min-h-0 space-y-0.5 overflow-y-auto px-2 pb-2">
        {agents.map((a) => (
          <li key={a.id} className={`group flex items-center rounded-md ${a.id === selectedId ? 'bg-zinc-800' : 'hover:bg-zinc-900'}`}>
            <button type="button" onClick={() => select(a.id)} className="min-w-0 flex-1 px-2 py-1.5 text-left">
              <span className="block truncate text-sm">{a.name}</span>
              <span className="block truncate font-mono text-[11px] text-zinc-500">
                {a.provider === 'webllm' ? a.modelId : `${a.provider} · ${a.modelId || '—'}`}
              </span>
            </button>
            <div className="flex pr-1 opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
              <button type="button" aria-label={`Share ${a.name}`} onClick={() => setSharing(a)} className="rounded p-1 text-zinc-500 hover:text-zinc-200">
                <Share2 className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label={`Duplicate ${a.name}`}
                onClick={() => void duplicateAgent(a).then((c) => select(c.id))}
                className="rounded p-1 text-zinc-500 hover:text-zinc-200"
              >
                <Copy className="size-3.5" />
              </button>
              <button type="button" aria-label={`Delete ${a.name}`} onClick={() => void remove(a.id, a.name)} className="rounded p-1 text-zinc-500 hover:text-red-300">
                <Trash className="size-3.5" />
              </button>
            </div>
          </li>
        ))}
      </ul>
      {sharing && <ShareModal agent={sharing} onClose={() => setSharing(null)} />}
      {importing && (
        <ImportAgentModal
          bundle={importing}
          onClose={() => setImporting(null)}
          onImported={(id) => {
            setImporting(null)
            select(id)
          }}
        />
      )}
    </div>
  )
}
