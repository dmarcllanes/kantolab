import { HardDrive, KeyRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { releaseModel } from '../../core/agent/session'
import { apiKeySetting } from '../../core/engine/providers'
import { clearModelCache } from '../../core/engine/webllm'
import { deleteAllData, deleteSetting, getSetting, setSetting } from '../../core/memory/db'
import { Button } from '../ui/Button'
import { Field, inputClass } from '../ui/Field'
import { InfoTip } from '../ui/InfoTip'
import { Modal } from '../ui/Modal'

const KINDS = [
  { kind: 'anthropic', label: 'Anthropic API key' },
  { kind: 'openai-compatible', label: 'OpenAI-compatible API key' },
] as const

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [keys, setKeys] = useState<Record<string, string>>({})
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    void Promise.all(KINDS.map(async ({ kind }) => [kind, (await getSetting<string>(apiKeySetting(kind))) ?? ''] as const)).then((pairs) =>
      setKeys(Object.fromEntries(pairs)),
    )
  }, [])

  const save = async () => {
    for (const { kind } of KINDS) {
      const v = keys[kind]?.trim()
      if (v) await setSetting(apiKeySetting(kind), v)
      else await deleteSetting(apiKeySetting(kind))
    }
    setNote('Keys saved in this browser.')
  }

  const clearModels = async () => {
    await releaseModel()
    const n = await clearModelCache()
    setNote(n ? 'Downloaded models removed.' : 'No downloaded models found.')
  }

  const wipe = async () => {
    if (!confirm('Delete ALL agents, runs, documents, custom tools and API keys from this browser? This cannot be undone.')) return
    await deleteAllData()
    location.reload()
  }

  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="space-y-5">
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <KeyRound className="size-4" /> Bring your own key <InfoTip id="byok" />
          </h3>
          <p className="text-xs text-zinc-500">
            Keys are stored only in this browser's IndexedDB and sent only to the provider you choose. Anyone with access to this browser profile can read them.
          </p>
          {KINDS.map(({ kind, label }) => (
            <Field key={kind} label={label}>
              <input
                type="password"
                autoComplete="off"
                value={keys[kind] ?? ''}
                onChange={(e) => setKeys((k) => ({ ...k, [kind]: e.target.value }))}
                className={`${inputClass} font-mono`}
              />
            </Field>
          ))}
          <Button variant="primary" onClick={() => void save()}>
            Save keys
          </Button>
        </section>

        <section className="space-y-2 border-t border-zinc-800 pt-4">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <HardDrive className="size-4" /> Storage
          </h3>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void clearModels()}>Remove downloaded models</Button>
            <Button variant="danger" onClick={() => void wipe()}>
              Delete all local data
            </Button>
          </div>
        </section>

        {note && <p className="text-xs text-emerald-300">{note}</p>}
      </div>
    </Modal>
  )
}
