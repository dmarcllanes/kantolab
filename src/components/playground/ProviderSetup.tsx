import { CircleAlert, CircleCheck, ExternalLink, Gift, LoaderCircle, PlugZap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { checkConnection, saveKeyFor, savedKeyFor } from '../../core/agent/session'
import type { AgentConfig } from '../../core/agent/types'
import { presetForBaseUrl } from '../../core/engine/cloudProviders'
import { ANTHROPIC_MODEL_SUGGESTIONS, isLocalServer, OPENAI_BASE_URL_EXAMPLES, type ConnectionCheck } from '../../core/engine/providers'
import { currentConsent } from '../../core/privacy/consent'
import { Button } from '../ui/Button'
import { Field, inputClass } from '../ui/Field'

/**
 * Key, base URL, model and connection test for API agents (cloud presets,
 * other OpenAI-compatible servers, Anthropic). Mount with a key that changes
 * when the provider or server changes.
 */
export function ProviderSetup({ draft, update }: { draft: AgentConfig; update: (patch: Partial<AgentConfig>) => void }) {
  const preset = draft.provider === 'openai-compatible' ? presetForBaseUrl(draft.baseUrl) : undefined
  const local = draft.provider === 'openai-compatible' && isLocalServer(draft.baseUrl)
  const [key, setKey] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ConnectionCheck | null>(null)
  const [models, setModels] = useState<string[]>([])

  const check = async (quiet: boolean, agent = draft) => {
    if (!quiet) {
      setBusy(true)
      setResult(null)
    }
    try {
      const r = await checkConnection(agent)
      if (r.models?.length) setModels(r.models)
      if (!quiet) setResult(r)
    } catch (e) {
      if (!quiet) setResult({ ok: false, message: e instanceof Error ? e.message : String(e) })
    } finally {
      if (!quiet) setBusy(false)
    }
  }

  // Load the saved key, then (if allowed) quietly fetch the model list. Lists models only; generates nothing.
  useEffect(() => {
    let live = true
    void savedKeyFor(draft).then((k) => {
      if (!live) return
      setKey(k)
      setHasKey(!!k)
      if ((k || local) && currentConsent().remoteAi && (draft.provider === 'anthropic' || draft.baseUrl.trim())) void check(true)
    })
    return () => {
      live = false
    }
    // Runs once per mount; the parent remounts this when the provider or server changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saveKey = async () => {
    await saveKeyFor(draft, key)
    setHasKey(!!key.trim())
    if (key.trim()) await check(false)
  }

  const suggestions = models.length ? models : draft.provider === 'anthropic' ? ANTHROPIC_MODEL_SUGGESTIONS : preset?.defaultModel ? [preset.defaultModel] : []
  const listId = `models-${draft.id}`
  const modelMissing = models.length > 0 && draft.modelId.trim() !== '' && !models.includes(draft.modelId.trim()) && !/\/free$|\/auto$/.test(draft.modelId)

  return (
    <div className="space-y-3">
      {preset && (
        <div className="flex items-start gap-3 rounded-2xl bg-emerald-500/8 px-3 py-2.5 ring-1 ring-emerald-500/20">
          <Gift className="mt-0.5 size-4 shrink-0 text-emerald-300" />
          <div className="min-w-0 flex-1 text-xs">
            <p className="text-zinc-200">
              <span className="font-medium">{preset.name}</span> · {preset.free}
            </p>
            <p className="mt-0.5 font-mono text-[11px] break-all text-zinc-500">{preset.baseUrl}</p>
          </div>
          <a href={preset.keyUrl} target="_blank" rel="noopener noreferrer" className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-medium text-zinc-950 hover:bg-emerald-400">
            Get a free key <ExternalLink className="size-3" />
          </a>
        </div>
      )}

      {draft.provider === 'openai-compatible' && !preset && (
        <>
          <Field label="Base URL" tip="baseUrl" hint="Any server that speaks the OpenAI chat format and allows browser (CORS) requests. Local servers need no key.">
            <input
              list="openai-base-urls"
              placeholder="http://localhost:11434/v1"
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
        </>
      )}

      {!local && (
        <Field
          label={draft.provider === 'anthropic' ? 'Anthropic API key' : `${preset ? preset.name : 'Server'} API key`}
          hint={hasKey ? 'Saved in this browser only. Sent only to this provider.' : 'Stored only in this browser (IndexedDB) and sent only to this provider.'}
        >
          <div className="flex gap-2">
            <input
              type="password"
              autoComplete="off"
              placeholder={preset ? `Paste your ${preset.name} key` : 'Paste your key'}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void saveKey()}
              className={`${inputClass} min-w-0 flex-1 font-mono`}
              aria-label="API key"
            />
            <Button onClick={() => void saveKey()} disabled={!key.trim() && !hasKey}>
              {key.trim() ? 'Save' : 'Remove'}
            </Button>
          </div>
        </Field>
      )}

      <Field label="Model" tip="provider" hint={models.length ? `${models.length} models available with your key. Start typing or open the list.` : 'Save your key to load the list of models.'}>
        <input
          list={listId}
          placeholder={preset?.defaultModel || 'model name'}
          value={draft.modelId}
          onChange={(e) => update({ modelId: e.target.value })}
          className={`${inputClass} font-mono`}
        />
      </Field>
      <datalist id={listId}>
        {suggestions.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      {(modelMissing || (models.length > 0 && !draft.modelId.trim())) && (
        <div className="space-y-1.5 rounded-xl bg-amber-500/8 px-3 py-2 ring-1 ring-amber-500/20">
          <p className="text-[11px] text-amber-300">
            {modelMissing ? `Your key can’t use “${draft.modelId}” (it may have been retired). Pick one:` : 'Pick a model:'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {models.slice(0, 12).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  update({ modelId: m })
                  setResult(null)
                }}
                className="rounded-full bg-zinc-900 px-2.5 py-1 font-mono text-[11px] text-zinc-200 ring-1 ring-zinc-700 hover:bg-emerald-500/12 hover:text-emerald-200 hover:ring-emerald-500/40"
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Button size="sm" onClick={() => void check(false)} disabled={busy}>
          {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <PlugZap className="size-3.5" />} Test connection
        </Button>
        {result && (
          <p role="status" className={`flex items-start gap-1.5 rounded-xl px-3 py-2 text-xs ${result.ok ? 'bg-emerald-500/10 text-emerald-200' : 'bg-red-500/10 text-red-300'}`}>
            {result.ok ? <CircleCheck className="mt-px size-3.5 shrink-0" /> : <CircleAlert className="mt-px size-3.5 shrink-0" />}
            <span>{result.message}</span>
          </p>
        )}
      </div>
    </div>
  )
}
