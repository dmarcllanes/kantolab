import { Check, LoaderCircle } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { defaultModelFor } from '../../core/agent/agents'
import type { AgentConfig } from '../../core/agent/types'
import { ANTHROPIC_MODEL_SUGGESTIONS, OPENAI_BASE_URL_EXAMPLES } from '../../core/engine/providers'
import type { ProviderKind } from '../../core/engine/types'
import { db } from '../../core/memory/db'
import { Field, inputClass } from '../ui/Field'
import { Tabs } from '../ui/Tabs'
import { temperatureWord } from '../viz/labels'
import { DocumentsPanel } from './DocumentsPanel'
import { ModelPicker } from './ModelPicker'
import { ToolPicker } from './ToolPicker'

const TABS = [
  { id: 'agent', label: 'Agent' },
  { id: 'tools', label: 'Tools' },
  { id: 'docs', label: 'Documents' },
] as const
type Tab = (typeof TABS)[number]['id']

const PROVIDERS: { id: ProviderKind; label: string }[] = [
  { id: 'webllm', label: 'Local · WebLLM (free, private)' },
  { id: 'anthropic', label: 'Anthropic (your API key)' },
  { id: 'openai-compatible', label: 'OpenAI-compatible (your API key)' },
]

type SaveState = 'idle' | 'saving' | 'saved'

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'idle') return null
  return (
    <span aria-live="polite" className="flex items-center gap-1 text-[11px] text-zinc-500">
      {state === 'saving' ? <LoaderCircle className="size-3 animate-spin" /> : <Check className="size-3 text-emerald-400" />}
      {state === 'saving' ? 'Saving' : 'Saved'}
    </span>
  )
}

/** Edits one agent. Mount with key={agent.id}; changes save to IndexedDB after a short pause. */
export function AgentEditor({ agent }: { agent: AgentConfig }) {
  const [draft, setDraft] = useState(agent)
  const [tab, setTab] = useState<Tab>('agent')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const pending = useRef<AgentConfig | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const flush = useCallback(() => {
    window.clearTimeout(timer.current)
    const next = pending.current
    pending.current = null
    if (next) void db.agents.put({ ...next, updatedAt: Date.now() }).then(() => setSaveState('saved'))
  }, [])

  // Save any unsaved edit when switching agents or leaving.
  useEffect(() => flush, [flush])

  const update = (patch: Partial<AgentConfig>) => {
    const next = { ...draft, ...patch }
    setDraft(next)
    setSaveState('saving')
    pending.current = next
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, 400)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Tabs tabs={TABS} value={tab} onChange={setTab} right={<SaveIndicator state={saveState} />} />
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === 'agent' && (
          <div className="space-y-4">
            <Field label="Name">
              <input value={draft.name} onChange={(e) => update({ name: e.target.value })} className={inputClass} />
            </Field>

            <Field label="Provider" tip="provider">
              <select
                value={draft.provider}
                onChange={(e) => {
                  const provider = e.target.value as ProviderKind
                  update({ provider, modelId: defaultModelFor(provider) })
                }}
                className={inputClass}
              >
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>

            {draft.provider === 'webllm' && <ModelPicker value={draft.modelId} onChange={(modelId) => update({ modelId })} />}

            {draft.provider === 'anthropic' && (
              <>
                <Field label="Model" tip="provider" hint="Requests go straight from your browser to Anthropic with your key.">
                  <input list="anthropic-models" value={draft.modelId} onChange={(e) => update({ modelId: e.target.value })} className={`${inputClass} font-mono`} />
                </Field>
                <datalist id="anthropic-models">
                  {ANTHROPIC_MODEL_SUGGESTIONS.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </>
            )}

            {draft.provider === 'openai-compatible' && (
              <>
                <Field label="Base URL" tip="baseUrl" hint="Must allow browser (CORS) requests. Groq, OpenRouter and local Ollama do.">
                  <input
                    list="openai-base-urls"
                    placeholder="https://api.groq.com/openai/v1"
                    value={draft.baseUrl}
                    onChange={(e) => update({ baseUrl: e.target.value })}
                    className={`${inputClass} font-mono`}
                  />
                </Field>
                <datalist id="openai-base-urls">
                  {OPENAI_BASE_URL_EXAMPLES.map((u) => (
                    <option key={u} value={u} />
                  ))}
                </datalist>
                <Field label="Model">
                  <input placeholder="e.g. llama-3.3-70b-versatile" value={draft.modelId} onChange={(e) => update({ modelId: e.target.value })} className={`${inputClass} font-mono`} />
                </Field>
              </>
            )}

            <Field label="System prompt" tip="systemPrompt" hint="Tool instructions and schemas are added automatically when tools are enabled.">
              <textarea value={draft.systemPrompt} onChange={(e) => update({ systemPrompt: e.target.value })} rows={8} className={`${inputClass} font-mono text-xs`} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Max steps" tip="maxSteps">
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={draft.maxSteps}
                  onChange={(e) => update({ maxSteps: Math.min(50, Math.max(1, Number(e.target.value) || 1)) })}
                  className={inputClass}
                />
              </Field>
              {draft.provider !== 'anthropic' && (
                <Field
                  label={
                    <>
                      Temperature · <span className="font-mono text-zinc-200">{draft.temperature.toFixed(1)}</span>{' '}
                      <span className="text-zinc-500">{temperatureWord(draft.temperature)}</span>
                    </>
                  }
                  tip="temperature"
                >
                  <input type="range" min={0} max={1.5} step={0.1} value={draft.temperature} onChange={(e) => update({ temperature: Number(e.target.value) })} className="w-full accent-emerald-400" />
                </Field>
              )}
            </div>
          </div>
        )}
        {tab === 'tools' && <ToolPicker selected={draft.toolNames} onChange={(toolNames) => update({ toolNames })} />}
        {tab === 'docs' && <DocumentsPanel toolEnabled={draft.toolNames.includes('search_documents')} />}
      </div>
    </div>
  )
}
