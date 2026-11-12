import { Check, LoaderCircle } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { defaultModelFor } from '../../core/agent/agents'
import type { AgentConfig } from '../../core/agent/types'
import { CLOUD_PRESETS, presetForBaseUrl } from '../../core/engine/cloudProviders'
import type { ProviderKind } from '../../core/engine/types'
import { db } from '../../core/memory/db'
import { Field, inputClass } from '../ui/Field'
import { Tabs } from '../ui/Tabs'
import { temperatureWord } from '../viz/labels'
import { DocumentsPanel } from './DocumentsPanel'
import { ProviderSetup } from './ProviderSetup'
import { ModelPicker } from './ModelPicker'
import { ToolPicker } from './ToolPicker'
import { GuideNote } from '../guide/GuideNote'

const TABS = [
  { id: 'agent', label: 'Agent' },
  { id: 'tools', label: 'Tools' },
  { id: 'docs', label: 'Documents' },
] as const
type Tab = (typeof TABS)[number]['id']

/** The provider menu: on-device first, then free cloud presets, then other servers and paid Claude. */
function providerChoice(a: Pick<AgentConfig, 'provider' | 'baseUrl'>): string {
  if (a.provider !== 'openai-compatible') return a.provider
  const preset = presetForBaseUrl(a.baseUrl)
  return preset ? `cloud:${preset.id}` : 'openai-compatible'
}

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
            <GuideNote id="agentSettings" />
            <Field label="Name">
              <input value={draft.name} onChange={(e) => update({ name: e.target.value })} className={inputClass} />
            </Field>

            <Field label="Provider" tip="provider">
              <select
                value={providerChoice(draft)}
                onChange={(e) => {
                  const v = e.target.value
                  const preset = v.startsWith('cloud:') ? CLOUD_PRESETS.find((p) => `cloud:${p.id}` === v) : undefined
                  if (preset) update({ provider: 'openai-compatible', baseUrl: preset.baseUrl, modelId: preset.defaultModel })
                  else if (v === 'openai-compatible') update({ provider: 'openai-compatible', baseUrl: presetForBaseUrl(draft.baseUrl) ? '' : draft.baseUrl, modelId: '' })
                  else {
                    const provider = v as ProviderKind
                    update({ provider, modelId: defaultModelFor(provider) })
                  }
                }}
                className={inputClass}
              >
                <option value="webllm">On this device · WebLLM (free, private)</option>
                <optgroup label="Free cloud AI (free API key)">
                  {CLOUD_PRESETS.map((p) => (
                    <option key={p.id} value={`cloud:${p.id}`}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Other">
                  <option value="openai-compatible">Your own server (Ollama, LM Studio, any OpenAI-compatible)</option>
                  <option value="anthropic">Anthropic Claude (paid API key)</option>
                </optgroup>
              </select>
            </Field>

            {draft.provider === 'webllm' && (
              <ModelPicker
                value={draft.modelId}
                onChange={(modelId) => update({ modelId })}
                onUseServer={(baseUrl) => update({ provider: 'openai-compatible', baseUrl, modelId: '' })}
              />
            )}

            {draft.provider !== 'webllm' && <ProviderSetup key={`${draft.id}|${providerChoice(draft)}`} draft={draft} update={update} />}

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
        {tab !== 'agent' && <GuideNote id={tab === 'tools' ? 'tools' : 'documents'} className="mb-3" />}
        {tab === 'tools' && <ToolPicker agentId={draft.id} selected={draft.toolNames} onChange={(toolNames) => update({ toolNames })} />}
        {tab === 'docs' && <DocumentsPanel toolEnabled={draft.toolNames.includes('search_documents')} />}
      </div>
    </div>
  )
}
