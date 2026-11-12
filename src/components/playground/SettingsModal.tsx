import { Check, ExternalLink, HardDrive, KeyRound, Monitor, Moon, Palette, Sun, Trophy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { releaseModel } from '../../core/agent/session'
import { CLOUD_PRESETS, serverKeySetting } from '../../core/engine/cloudProviders'
import { apiKeySetting } from '../../core/engine/providers'
import { clearModelCache } from '../../core/engine/webllm'
import { deleteAllData, deleteSetting, getSetting, setSetting } from '../../core/memory/db'
import { Button } from '../ui/Button'
import { Field, inputClass } from '../ui/Field'
import { InfoTip } from '../ui/InfoTip'
import { Modal } from '../ui/Modal'
import { getTheme, setTheme, type ThemeChoice } from '../ui/theme'
import { useGamify } from '../progress/useProgress'

/** One key per provider. Cloud presets first (free tiers), then the shared fallback and paid Claude. */
const KEY_ROWS: { setting: string; label: string; keyUrl?: string }[] = [
  ...CLOUD_PRESETS.map((p) => ({ setting: serverKeySetting(p.baseUrl), label: `${p.name} (free tier)`, keyUrl: p.keyUrl })),
  { setting: apiKeySetting('openai-compatible'), label: 'Other OpenAI-compatible servers (shared key)' },
  { setting: apiKeySetting('anthropic'), label: 'Anthropic Claude (paid)', keyUrl: 'https://platform.claude.com' },
]

const THEMES: { id: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { id: 'system', label: 'System', icon: Monitor },
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
]

/** Material 3 segmented button. */
function AppearancePicker() {
  const [theme, set] = useState<ThemeChoice>(getTheme)
  return (
    <div role="radiogroup" aria-label="Appearance" className="inline-flex overflow-hidden rounded-full border border-zinc-700">
      {THEMES.map(({ id, label, icon: Icon }, i) => {
        const on = theme === id
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => {
              set(id)
              setTheme(id)
            }}
            className={`flex h-9 items-center gap-1.5 px-4 text-sm font-medium transition-colors ${i > 0 ? 'border-l border-zinc-700' : ''} ${
              on ? 'bg-emerald-500/15 text-emerald-100' : 'text-zinc-300 hover:bg-zinc-500/10'
            }`}
          >
            {on ? <Check className="size-4" /> : <Icon className="size-4" />} {label}
          </button>
        )
      })}
    </div>
  )
}

function GamifySwitch() {
  const on = useGamify((s) => s.on)
  const setOn = useGamify((s) => s.setOn)
  return (
    <label className="flex cursor-pointer items-center gap-3 text-sm text-zinc-300">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => setOn(!on)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-emerald-500' : 'bg-zinc-700'}`}
      >
        <span className={`absolute top-1 left-1 size-4 rounded-full bg-zinc-900 shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
      </button>
      Show XP, levels, streaks and achievements
    </label>
  )
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [keys, setKeys] = useState<Record<string, string>>({})
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    void Promise.all(KEY_ROWS.map(async ({ setting }) => [setting, (await getSetting<string>(setting)) ?? ''] as const)).then((pairs) =>
      setKeys(Object.fromEntries(pairs)),
    )
  }, [])

  const save = async () => {
    for (const { setting } of KEY_ROWS) {
      const v = keys[setting]?.trim()
      if (v) await setSetting(setting, v)
      else await deleteSetting(setting)
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
        <section className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <Palette className="size-4" /> Appearance
          </h3>
          <AppearancePicker />
          <p className="text-xs text-zinc-500">System follows your device’s light or dark setting.</p>
        </section>

        <section className="space-y-2 border-t border-zinc-800 pt-4">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <Trophy className="size-4" /> Progress
          </h3>
          <GamifySwitch />
          <p className="text-xs text-zinc-500">Worked out from what’s already saved in this browser. Nothing is tracked or sent.</p>
        </section>

        <section className="space-y-3 border-t border-zinc-800 pt-4">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <KeyRound className="size-4" /> Bring your own key <InfoTip id="byok" />
          </h3>
          <p className="text-xs text-zinc-500">
            Keys are stored only in this browser's IndexedDB and sent only to the provider you choose. Anyone with access to this browser profile can read them.
          </p>
          <p className="text-xs text-zinc-500">Tip: you can also paste a key right in an agent’s settings after picking its provider.</p>
          {KEY_ROWS.map(({ setting, label, keyUrl }) => (
            <Field
              key={setting}
              label={
                <span className="flex items-center gap-2">
                  {label}
                  {keyUrl && (
                    <a href={keyUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-[11px] text-emerald-300 hover:underline">
                      get a key <ExternalLink className="size-3" />
                    </a>
                  )}
                </span>
              }
            >
              <input
                type="password"
                autoComplete="off"
                aria-label={label}
                value={keys[setting] ?? ''}
                onChange={(e) => setKeys((k) => ({ ...k, [setting]: e.target.value }))}
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
