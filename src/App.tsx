import { useLiveQuery } from 'dexie-react-hooks'
import { Cpu, FlaskConical, Settings } from 'lucide-react'
import { useEffect, useState } from 'react'
import { InspectorTabs } from './components/inspector/InspectorTabs'
import { AgentEditor } from './components/playground/AgentEditor'
import { AgentList } from './components/playground/AgentList'
import { ImportAgentModal } from './components/playground/ImportAgentModal'
import { SettingsModal } from './components/playground/SettingsModal'
import { seedAgentsIfEmpty } from './core/agent/agents'
import { decodeBundle, type AgentBundle } from './core/agent/share'
import { useAgentStore } from './core/agent/store'
import { profileGpu, type GpuProfile } from './core/engine/webgpu'
import { db } from './core/memory/db'

function GpuStatus({ gpu }: { gpu: GpuProfile | null }) {
  const text = gpu === null ? 'Checking WebGPU…' : gpu.supported ? `WebGPU${gpu.vendor ? ` · ${gpu.vendor}` : ''}${gpu.shaderF16 ? ' · f16' : ''}` : 'No WebGPU'
  return (
    <span title={gpu?.reason} className={`hidden items-center gap-1.5 text-xs sm:flex ${gpu && !gpu.supported ? 'text-red-300' : 'text-zinc-400'}`}>
      <Cpu className="size-3.5" /> {text}
    </span>
  )
}

function App() {
  const [gpu, setGpu] = useState<GpuProfile | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [sharedAgent, setSharedAgent] = useState<AgentBundle | null>(null)
  const [linkProblem, setLinkProblem] = useState<string | null>(null)
  const selectedId = useAgentStore((s) => s.selectedAgentId)
  const selectAgent = useAgentStore((s) => s.selectAgent)
  const agent = useLiveQuery(() => (selectedId ? db.agents.get(selectedId) : undefined), [selectedId])

  useEffect(() => {
    profileGpu().then(setGpu, (e: unknown) => setGpu({ supported: false, reason: e instanceof Error ? e.message : String(e) }))
    void seedAgentsIfEmpty().then((id) => {
      if (!useAgentStore.getState().selectedAgentId) selectAgent(id)
    })
  }, [selectAgent])

  // Shared agent links: #agent=<compressed bundle>
  useEffect(() => {
    const match = location.hash.match(/^#agent=([\w-]+)$/)
    if (!match) return
    decodeBundle(match[1]).then(setSharedAgent, (e: unknown) => setLinkProblem(e instanceof Error ? e.message : String(e)))
  }, [])

  const clearHash = () => history.replaceState(null, '', location.pathname + location.search)

  return (
    <div className="flex h-dvh flex-col bg-zinc-950 text-zinc-100">
      <header className="flex items-center gap-3 border-b border-zinc-800 px-4 py-2.5">
        <FlaskConical className="size-5 text-emerald-400" />
        <h1 className="font-semibold">KantoLab</h1>
        <span className="hidden text-xs text-zinc-500 md:inline">Assemble, run and inspect AI agents — entirely in your browser</span>
        <div className="ml-auto flex items-center gap-3">
          <GpuStatus gpu={gpu} />
          <button type="button" aria-label="Settings" onClick={() => setSettingsOpen(true)} className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100">
            <Settings className="size-4" />
          </button>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[240px_minmax(0,1fr)_minmax(0,1.25fr)] lg:overflow-hidden">
        <aside className="max-h-64 border-b border-zinc-800 lg:max-h-none lg:border-r lg:border-b-0">
          <AgentList />
        </aside>
        <section className="flex min-h-[28rem] flex-col border-b border-zinc-800 lg:min-h-0 lg:border-r lg:border-b-0">
          {agent ? <AgentEditor key={agent.id} agent={agent} /> : <p className="p-6 text-sm text-zinc-500">Select or create an agent.</p>}
        </section>
        <section className="flex min-h-[32rem] flex-col lg:min-h-0">
          <InspectorTabs agent={agent} gpu={gpu} />
        </section>
      </main>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {sharedAgent && (
        <ImportAgentModal
          bundle={sharedAgent}
          onClose={() => {
            setSharedAgent(null)
            clearHash()
          }}
          onImported={(id) => {
            setSharedAgent(null)
            clearHash()
            selectAgent(id)
          }}
        />
      )}
      {linkProblem && (
        <div role="alert" className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-md border border-red-500/40 bg-zinc-900 px-3 py-2 text-xs text-red-200 shadow-xl">
          Couldn’t open shared agent: {linkProblem}
          <button
            type="button"
            className="text-zinc-400 hover:text-zinc-100"
            onClick={() => {
              setLinkProblem(null)
              clearHash()
            }}
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  )
}

export default App
