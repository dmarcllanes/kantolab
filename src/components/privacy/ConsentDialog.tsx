import { ArrowLeftRight, ChevronDown, Cloud, Cpu, Database, HardDrive, Laptop, Lock, ServerOff, ShieldCheck } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { presetForBaseUrl } from '../../core/engine/cloudProviders'
import { profileGpu, type GpuProfile } from '../../core/engine/webgpu'
import { db } from '../../core/memory/db'
import { ALL_CONSENT, DEFAULT_CONSENT, useConsent, type Consent } from '../../core/privacy/consent'

const fmt = (bytes?: number) =>
  bytes === undefined ? '?' : bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : bytes >= 1024 ** 2 ? `${Math.round(bytes / 1024 ** 2)} MB` : `${Math.round(bytes / 1024)} KB`

function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange?: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none disabled:cursor-not-allowed ${
        checked ? (disabled ? 'bg-emerald-700' : 'bg-emerald-500') : 'bg-zinc-700'
      }`}
    >
      <span className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform motion-reduce:transition-none ${checked ? 'translate-x-5' : ''}`} />
    </button>
  )
}

/** One permission: what it is, a switch, and a live "see what KantoLab sees" check. */
function Item({
  icon,
  title,
  summary,
  checked,
  onChange,
  required,
  details,
  check,
}: {
  icon: ReactNode
  title: string
  summary: string
  checked: boolean
  onChange?: (v: boolean) => void
  required?: boolean
  details: string[]
  check: { label: string; run: () => Promise<[string, string][]> }
}) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<[string, string][] | null>(null)
  const [busy, setBusy] = useState(false)
  const panel = useId()
  const runCheck = async () => {
    setBusy(true)
    try {
      setRows(await check.run())
    } catch (e) {
      setRows([['Error', e instanceof Error ? e.message : String(e)]])
    } finally {
      setBusy(false)
    }
  }
  return (
    <li className={`rounded-lg border p-3 transition-colors ${checked ? 'border-emerald-500/30 bg-emerald-500/[0.04]' : 'border-zinc-800'}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 ${checked ? 'text-emerald-300' : 'text-zinc-500'}`}>{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium text-zinc-100">{title}</h3>
            {required && <span className="rounded bg-zinc-800 px-1.5 font-mono text-[10px] text-zinc-400">needed</span>}
          </div>
          <p className="mt-0.5 text-xs text-zinc-400">{summary}</p>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panel}
            onClick={() => setOpen((v) => !v)}
            className="mt-1.5 flex items-center gap-1 text-xs text-sky-300 hover:text-sky-200"
          >
            <ChevronDown className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`} /> {open ? 'Hide details' : 'What exactly happens?'}
          </button>
          {open && (
            <div id={panel} className="mt-2 space-y-2">
              <ul className="list-disc space-y-0.5 pl-4 text-xs text-zinc-300">
                {details.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
              <div className="rounded-md bg-zinc-950 p-2">
                <button type="button" onClick={() => void runCheck()} disabled={busy} className="text-xs font-medium text-sky-300 hover:text-sky-200 disabled:text-zinc-500">
                  {busy ? 'Checking…' : rows ? '↻ Check again' : `▸ ${check.label}`}
                </button>
                {rows && (
                  <dl className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 font-mono text-[11px]">
                    {rows.map(([k, v]) => (
                      <div key={k} className="contents">
                        <dt className="text-zinc-500">{k}</dt>
                        <dd className="break-words text-zinc-200">{v}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {rows && <p className="mt-1.5 text-[11px] text-zinc-500">Read just now, shown only to you. Not stored or sent anywhere.</p>}
              </div>
            </div>
          )}
        </div>
        <Switch checked={checked} onChange={onChange} label={title} disabled={required} />
      </div>
    </li>
  )
}

function FlowNode({ icon, label, sub, active }: { icon: ReactNode; label: string; sub: string; active: boolean }) {
  return (
    <div className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-md border p-2 text-center transition-colors ${active ? 'border-sky-500/40 bg-sky-500/[0.06]' : 'border-zinc-800 opacity-50'}`}>
      <span className={active ? 'text-sky-300' : 'text-zinc-500'}>{icon}</span>
      <span className="text-[11px] font-medium text-zinc-200">{label}</span>
      <span className="text-[10px] text-zinc-500">{sub}</span>
    </div>
  )
}

function FlowLink({ on, label }: { on: boolean; label: string }) {
  return (
    <div className="flex shrink-0 flex-col items-center justify-center px-1" aria-hidden>
      <ArrowLeftRight className={`size-4 ${on ? 'text-sky-300' : 'text-zinc-700'}`} />
      <span className={`text-[9px] ${on ? 'text-sky-300' : 'text-zinc-600'}`}>{label}</span>
    </div>
  )
}

/** Where data can go, redrawn as the switches change. */
function DataFlow({ c }: { c: Consent }) {
  const leaving = [c.localAi && 'model files are downloaded (in)', c.remoteAi && 'your messages go to the provider you pick'].filter(Boolean)
  return (
    <figure className="space-y-1.5">
      <div className="flex items-stretch gap-1">
        <FlowNode icon={<Cloud className="size-4" />} label="Model files" sub="Hugging Face / GitHub" active={c.localAi} />
        <FlowLink on={c.localAi} label="download" />
        <FlowNode icon={<Laptop className="size-4" />} label="Your browser" sub="everything runs here" active />
        <FlowLink on={c.remoteAi} label="your messages" />
        <FlowNode icon={<Cloud className="size-4" />} label="AI provider" sub="only one you choose" active={c.remoteAi} />
      </div>
      <div className="flex items-center justify-center gap-1.5 text-[11px] text-zinc-500">
        <ServerOff className="size-3.5" /> KantoLab has no server: there is nothing to send your data to.
      </div>
      <figcaption className="sr-only">
        Your browser runs everything. {leaving.length ? `With your choices: ${leaving.join('; ')}.` : 'With your choices, nothing leaves this browser.'}
      </figcaption>
    </figure>
  )
}

const CHECKS = {
  storage: async (): Promise<[string, string][]> => {
    const est = await navigator.storage?.estimate?.()
    const [agents, runs, docs, models] = await Promise.all([db.agents.count(), db.runs.count(), db.documents.count(), db.customModels.count()])
    return [
      ['Used', `${fmt(est?.usage)} of ${fmt(est?.quota)} the browser allows`],
      ['Saved here', `${agents} agents · ${runs} runs · ${docs} documents · ${models} own models`],
      ['Where', 'IndexedDB + Cache Storage of this site, in this browser profile'],
    ]
  },
  gpu: async (): Promise<[string, string][]> => {
    const g: GpuProfile = await profileGpu()
    const cached = (await caches.keys()).filter((k) => k.startsWith('webllm')).length
    if (!g.supported) return [['WebGPU', `not available: ${g.reason ?? 'unknown reason'}`]]
    return [
      ['WebGPU', 'available'],
      ['GPU maker', g.vendor || 'not reported'],
      ['Architecture', g.architecture || 'not reported'],
      ['Half precision (f16)', g.shaderF16 ? 'yes: faster, smaller models' : 'no'],
      ['Largest buffer', fmt(g.maxBufferSize)],
      ['Model caches', cached ? `${cached} in this browser` : 'none yet'],
    ]
  },
  remote: async (): Promise<[string, string][]> => {
    const keys = (await db.settings.toArray()).filter((r) => r.key.startsWith('apiKey:') && typeof r.value === 'string' && r.value)
    const agents = await db.agents.toArray()
    const remote = agents.filter((a) => a.provider !== 'webllm')
    const label = (k: string) => {
      if (k === 'apiKey:anthropic') return 'Anthropic'
      if (k === 'apiKey:openai-compatible') return 'shared OpenAI-compatible'
      const url = k.split('@')[1] ?? ''
      return presetForBaseUrl(url)?.name ?? url.replace(/^https?:\/\//, '')
    }
    return [
      ['Saved API keys', keys.length ? keys.map((r) => `${label(r.key)} (…${String(r.value).slice(-4)})`).join(', ') : 'none'],
      ['Agents using a provider', remote.length ? remote.map((a) => a.name).join(', ') : 'none'],
    ]
  },
  persist: async (): Promise<[string, string][]> => {
    const persisted = await navigator.storage?.persisted?.()
    return [['Protected from clean-up', persisted === undefined ? 'not supported by this browser' : persisted ? 'yes' : 'not yet']]
  },
}

/** Shown on every visit before the app is used; reopen any time from the shield button. */
export function ConsentDialog() {
  const dialogOpen = useConsent((s) => s.dialogOpen)
  // Mounted fresh on each open, so the switches start from the saved choices.
  return dialogOpen ? <ConsentPanel /> : null
}

function ConsentPanel() {
  const { choices, returning, decided, decide } = useConsent()
  const [draft, setDraft] = useState<Consent>(choices)
  const primary = useRef<HTMLButtonElement>(null)
  const titleId = useId()

  useEffect(() => {
    primary.current?.focus()
  }, [])

  const set = (patch: Partial<Consent>) => setDraft((d) => ({ ...d, ...patch }))
  const finish = (c: Consent) => {
    if (c.persistStorage) void navigator.storage?.persist?.().catch(() => false)
    decide(c)
  }
  const allowed = [draft.localAi && 'local AI', draft.remoteAi && 'AI providers', draft.persistStorage && 'protected storage'].filter(Boolean)

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/55 p-4 sm:p-8">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        // Choosing is required on each visit: Esc picks nothing, the buttons do.
        onKeyDown={(e) => e.key === 'Escape' && decided && decide(choices)}
        className="flex max-h-full w-full max-w-xl flex-col rounded-2xl bg-zinc-900 shadow-2xl ring-1 ring-zinc-800"
      >
        <div className="space-y-1 border-b border-zinc-800 px-5 py-4">
          <h2 id={titleId} className="flex items-center gap-2 text-lg font-semibold">
            <ShieldCheck className="size-5 text-emerald-400" /> {returning ? 'Welcome back: your privacy choices' : 'Before you start: your privacy'}
          </h2>
          <p className="text-sm text-zinc-400">
            KantoLab runs entirely in your browser. Choose what it may use on this device. Open “What exactly happens?” on any item to see, live, what KantoLab can read.
          </p>
        </div>

        {/* Only the middle scrolls, so the choice buttons are always visible. */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <DataFlow c={draft} />
          <ul className="space-y-2">
            <Item
              icon={<Database className="size-4" />}
              title="Save your work in this browser"
              summary="Agents, runs, documents, test sets and keys are stored on this device so they’re here next time."
              checked
              required
              details={['Stored in this site’s IndexedDB, in this browser profile only.', 'Nothing is synced or uploaded.', 'Delete it any time in Settings → Delete all data.']}
              check={{ label: 'Show my storage', run: CHECKS.storage }}
            />
            <Item
              icon={<Cpu className="size-4" />}
              title="Run AI on this device"
              summary="Uses your graphics card (WebGPU) to run models locally, and downloads model files the first time (≈1 GB for the default)."
              checked={draft.localAi}
              onChange={(v) => set({ localAi: v })}
              details={[
                'Reads your GPU’s capabilities (maker, features, memory limits) to warn you before a model is too big.',
                'Downloads model files from Hugging Face and GitHub, then caches them in this browser.',
                'Your prompts and answers never leave the device.',
                'Off: local models are disabled and the GPU is never touched.',
              ]}
              check={{ label: 'Check my GPU now', run: CHECKS.gpu }}
            />
            <Item
              icon={<Cloud className="size-4" />}
              title="Use AI providers you choose"
              summary="For agents set to a cloud AI (Groq, Gemini, OpenRouter, … or Claude) or a server on your computer (Ollama, LM Studio), messages go to that provider with your key."
              checked={draft.remoteAi}
              onChange={(v) => set({ remoteAi: v })}
              details={[
                'Only the agent’s messages and tool results are sent, only to the provider you configured.',
                'Your API key goes from this browser straight to that provider. KantoLab never sees it.',
                'That provider’s own privacy policy and billing apply.',
                'Off: agents using a provider won’t run.',
              ]}
              check={{ label: 'Show my saved keys & agents', run: CHECKS.remote }}
            />
            <Item
              icon={<HardDrive className="size-4" />}
              title="Protect saved data from clean-up"
              summary="Asks the browser not to delete KantoLab’s data (like downloaded models) when your disk gets full."
              checked={draft.persistStorage}
              onChange={(v) => set({ persistStorage: v })}
              details={['Uses the browser’s “persistent storage” request; some browsers decide on their own or ask you.', 'Off: the browser may clear model downloads under storage pressure; they’d download again.']}
              check={{ label: 'Check protection status', run: CHECKS.persist }}
            />
          </ul>
          <p className="flex items-start gap-1.5 text-xs text-zinc-500">
            <Lock className="mt-0.5 size-3.5 shrink-0" /> Never: no accounts, no cookies, no analytics or tracking, no ads. Shared agent links carry the agent inside the link itself.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-zinc-800 px-5 py-3">
          <span className="mr-auto text-xs text-zinc-400" aria-live="polite">
            {allowed.length ? `Allowing: storage, ${allowed.join(', ')}` : 'Allowing: storage only'}
          </span>
          <button
            type="button"
            onClick={() => finish(DEFAULT_CONSENT)}
            className="rounded-full px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
          >
            Only what’s needed
          </button>
          <button
            ref={returning ? primary : undefined}
            type="button"
            onClick={() => finish(draft)}
            className="rounded-full bg-emerald-500/12 px-4 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-500/20"
          >
            {returning ? 'Continue with these' : 'Save my choices'}
          </button>
          <button
            ref={returning ? undefined : primary}
            type="button"
            onClick={() => finish(ALL_CONSENT)}
            className="rounded-full bg-emerald-500 px-5 py-2 text-sm font-medium text-zinc-950 shadow-sm hover:bg-emerald-400"
          >
            Allow all
          </button>
        </div>
      </div>
    </div>
  )
}
