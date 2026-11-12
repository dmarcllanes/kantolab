import { useLiveQuery } from 'dexie-react-hooks'
import { Compass, Cpu, FlaskConical, GraduationCap, Settings, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { InspectorTabs } from './components/inspector/InspectorTabs'
import { AgentEditor } from './components/playground/AgentEditor'
import { AgentList } from './components/playground/AgentList'
import { ImportAgentModal } from './components/playground/ImportAgentModal'
import { SettingsModal } from './components/playground/SettingsModal'
import { seedAgentsIfEmpty } from './core/agent/agents'
import { releaseModel } from './core/agent/session'
import { useConsent } from './core/privacy/consent'
import { ConsentDialog } from './components/privacy/ConsentDialog'
import { decodeBundle, type AgentBundle } from './core/agent/share'
import { useAgentStore } from './core/agent/store'
import { profileGpu, type GpuProfile } from './core/engine/webgpu'
import { db } from './core/memory/db'
import { Tour } from './components/guide/Tour'
import { useGuide } from './components/guide/useGuide'
import { LevelChip } from './components/progress/LevelChip'
import { ProgressModal } from './components/progress/ProgressModal'
import { ProgressWatcher } from './components/progress/ProgressWatcher'

function GpuStatus({ gpu, allowed }: { gpu: GpuProfile | null; allowed: boolean }) {
  if (!allowed)
    return (
      <span className="hidden items-center gap-1.5 text-xs text-zinc-500 sm:flex" title="Turned off in Privacy">
        <Cpu className="size-3.5" /> Local AI off
      </span>
    )
  const text = gpu === null ? 'Checking WebGPU…' : gpu.supported ? `WebGPU${gpu.vendor ? ` · ${gpu.vendor}` : ''}${gpu.shaderF16 ? ' · f16' : ''}` : 'No WebGPU'
  return (
    <span title={gpu?.reason} className={`hidden items-center gap-1.5 text-xs sm:flex ${gpu && !gpu.supported ? 'text-red-300' : 'text-zinc-400'}`}>
      <Cpu className="size-3.5" /> {text}
    </span>
  )
}

function GuideToggle() {
  const on = useGuide((s) => s.on)
  const setOn = useGuide((s) => s.setOn)
  const startTour = useGuide((s) => s.startTour)
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        data-tour="guide-toggle"
        aria-pressed={on}
        onClick={() => setOn(!on)}
        title={on ? 'Turn off beginner explanations' : 'Turn on beginner explanations'}
        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
          on ? 'border-sky-500/50 bg-sky-500/15 text-sky-100' : 'border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100'
        }`}
      >
        <GraduationCap className="size-3.5" /> Guide <span className={`font-mono text-[10px] ${on ? 'text-sky-300' : 'text-zinc-500'}`}>{on ? 'ON' : 'OFF'}</span>
      </button>
      {on && (
        <button type="button" onClick={startTour} title="Take the tour" aria-label="Take the tour" className="rounded-full p-2 text-sky-300 hover:bg-sky-500/10">
          <Compass className="size-4" />
        </button>
      )}
    </div>
  )
}

/** One-time offer for first visits. */
function GuidePrompt() {
  const asked = useGuide((s) => s.asked)
  const on = useGuide((s) => s.on)
  const setOn = useGuide((s) => s.setOn)
  const dismiss = useGuide((s) => s.dismissPrompt)
  const startTour = useGuide((s) => s.startTour)
  if (asked || on) return null
  return (
    <div className="mx-3 mb-3 flex flex-wrap items-center gap-2 rounded-2xl bg-sky-500/10 px-4 py-2.5 text-sm">
      <GraduationCap className="size-4 shrink-0 text-sky-300" aria-hidden />
      <span className="text-zinc-200">New to AI agents? Guide mode explains every panel, button and result in plain words.</span>
      <div className="ml-auto flex gap-2">
        <button
          type="button"
          onClick={() => {
            setOn(true)
            startTour()
          }}
          className="rounded-full bg-sky-500 px-4 py-1.5 text-xs font-medium text-zinc-950 hover:bg-sky-400"
        >
          Turn on & take the tour
        </button>
        <button type="button" onClick={dismiss} className="rounded-full px-3 py-1.5 text-xs font-medium text-sky-300 hover:bg-sky-500/10">
          No thanks
        </button>
      </div>
    </div>
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

  const consentDecided = useConsent((s) => s.decided)
  const localAi = useConsent((s) => s.decided && s.choices.localAi)
  const openPrivacy = useConsent((s) => s.openDialog)

  // The GPU is only queried once the user allows local AI on this visit.
  useEffect(() => {
    if (!localAi) {
      // Turned off mid-visit: let go of any loaded model too.
      if (useAgentStore.getState().loadedModelId) void releaseModel()
      return
    }
    let live = true
    profileGpu().then(
      (g) => live && setGpu(g),
      (e: unknown) => live && setGpu({ supported: false, reason: e instanceof Error ? e.message : String(e) }),
    )
    return () => {
      live = false
    }
  }, [localAi])

  useEffect(() => {
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
    <div className="flex h-dvh flex-col text-zinc-100">
      <header className="flex h-16 shrink-0 items-center gap-2 px-3 sm:gap-3 sm:px-5">
        <span className="flex size-9 items-center justify-center rounded-xl bg-linear-to-br from-emerald-500 to-violet-500 shadow-md">
          <FlaskConical className="size-5 text-zinc-950" />
        </span>
        <h1 className="bg-linear-to-r from-zinc-100 to-zinc-400 bg-clip-text text-[22px] leading-none font-medium tracking-tight text-transparent">KantoLab</h1>
        <span className="hidden text-sm text-zinc-500 md:inline">Assemble, run and inspect AI agents — entirely in your browser</span>
        <div className="ml-auto flex items-center gap-1 sm:gap-3">
          <GpuStatus gpu={localAi ? gpu : null} allowed={localAi} />
          <LevelChip />
          <GuideToggle />
          <button type="button" aria-label="Privacy choices" title="Privacy choices" onClick={openPrivacy} className="rounded-full p-2 text-zinc-500 hover:bg-zinc-500/10 hover:text-zinc-100">
            <ShieldCheck className="size-4" />
          </button>
          <button type="button" aria-label="Settings" onClick={() => setSettingsOpen(true)} className="rounded-full p-2 text-zinc-500 hover:bg-zinc-500/10 hover:text-zinc-100">
            <Settings className="size-4" />
          </button>
        </div>
      </header>
      {consentDecided && <GuidePrompt />}

      <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto px-3 pb-3 lg:grid-cols-[256px_minmax(0,1fr)_minmax(0,1.25fr)] lg:overflow-hidden">
        <aside data-tour="agents" className="max-h-72 overflow-hidden rounded-2xl lg:max-h-none">
          <AgentList />
        </aside>
        <section data-tour="editor" className="flex min-h-[28rem] flex-col overflow-hidden rounded-2xl bg-zinc-900/85 shadow-sm ring-1 ring-zinc-800/70 backdrop-blur-sm lg:min-h-0">
          {agent ? <AgentEditor key={agent.id} agent={agent} /> : <p className="p-6 text-sm text-zinc-500">Select or create an agent.</p>}
        </section>
        <section data-tour="inspector" className="flex min-h-[32rem] flex-col overflow-hidden rounded-2xl bg-zinc-900/85 shadow-sm ring-1 ring-zinc-800/70 backdrop-blur-sm lg:min-h-0">
          <InspectorTabs agent={agent} gpu={gpu} />
        </section>
      </main>

      <Tour />
      <ProgressModal />
      <ProgressWatcher />
      <ConsentDialog />
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
