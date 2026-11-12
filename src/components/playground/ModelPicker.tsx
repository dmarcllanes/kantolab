import { useLiveQuery } from 'dexie-react-hooks'
import { HardDriveUpload, Trash } from 'lucide-react'
import { useEffect, useState } from 'react'
import { DEFAULT_WEBLLM_MODEL } from '../../core/agent/agents'
import { useAgentStore } from '../../core/agent/store'
import { listModels, removeCustomModel, type ModelInfo } from '../../core/engine/webllm'
import { db } from '../../core/memory/db'
import { Badge } from '../ui/Badge'
import { Field, inputClass } from '../ui/Field'
import { InfoTip } from '../ui/InfoTip'
import { MAGNITUDE } from '../viz/colors'
import { CustomModelModal } from './CustomModelModal'

const formatMB = (mb?: number) => (mb === undefined ? '?' : mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`)
const weight = (mb?: number) => (mb === undefined ? '' : mb < 1500 ? 'light' : mb < 3500 ? 'medium' : mb < 7000 ? 'heavy' : 'very heavy')
const SCALE_MB = 8 * 1024

export function ModelPicker({ value, onChange, onUseServer }: { value: string; onChange: (id: string) => void; onUseServer?: (baseUrl: string) => void }) {
  const [prebuilt, setPrebuilt] = useState<ModelInfo[]>([])
  const [maxGB, setMaxGB] = useState(4)
  const [adding, setAdding] = useState(false)
  const loadedModelId = useAgentStore((s) => s.loadedModelId)
  const customs = useLiveQuery(() => db.customModels.orderBy('createdAt').toArray(), [], [])

  useEffect(() => {
    listModels().then(setPrebuilt, () => setPrebuilt([]))
  }, [])

  const mine: ModelInfo[] = customs.map((c) => ({ id: c.modelId, vramMB: c.vramMB, custom: c }))
  const models = [...mine, ...prebuilt]
  const visible = prebuilt.filter((m) => m.id === value || (m.vramMB ?? 0) <= maxGB * 1024)
  const selected = models.find((m) => m.id === value)
  const custom = selected?.custom

  const remove = async () => {
    if (!custom) return
    const where = custom.source === 'folder' ? ' and delete its copied files from this browser' : ''
    if (!confirm(`Remove "${custom.modelId}" from your models${where}?`)) return
    if (loadedModelId === custom.modelId) return alert('This model is loaded right now. Load another model or reload the page first.')
    await removeCustomModel(custom)
    onChange(DEFAULT_WEBLLM_MODEL)
  }

  return (
    <div className="space-y-2">
      <Field label="Local model (WebGPU)" tip="model">
        <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
          {models.length === 0 && <option value={value}>{value}</option>}
          {!selected && models.length > 0 && <option value={value}>{value} (not found)</option>}
          {mine.length > 0 && (
            <optgroup label="Your models">
              {mine.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id} · {m.custom?.source === 'folder' ? 'this computer' : 'URL'}
                  {m.vramMB ? ` · ~${formatMB(m.vramMB)}` : ''}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="WebLLM models">
            {visible.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id} · {formatMB(m.vramMB)}
              </option>
            ))}
          </optgroup>
        </select>
      </Field>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button type="button" onClick={() => setAdding(true)} className="flex items-center gap-1 text-emerald-300 hover:text-emerald-200">
          <HardDriveUpload className="size-3.5" /> Use my own quantized model
        </button>
        <InfoTip id="customModel" />
        {custom && (
          <span className="ml-auto flex items-center gap-2">
            <Badge tone="violet">{custom.source === 'folder' ? `your model · ${custom.bytes ? formatMB(custom.bytes / 1024 / 1024) : ''} in browser` : 'your model · from URL'}</Badge>
            <button type="button" onClick={() => void remove()} aria-label={`Remove ${custom.modelId}`} className="rounded p-1 text-zinc-500 hover:text-red-300">
              <Trash className="size-3.5" />
            </button>
          </span>
        )}
      </div>
      {adding && (
        <CustomModelModal
          onClose={() => setAdding(false)}
          onAdded={(id) => {
            setAdding(false)
            onChange(id)
          }}
          onUseServer={
            onUseServer
              ? (url) => {
                  setAdding(false)
                  onUseServer(url)
                }
              : undefined
          }
        />
      )}

      {selected?.vramMB !== undefined && (
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-xs text-zinc-400">
            Needs {custom ? 'about ' : ''}<span className="font-mono text-zinc-200">{formatMB(selected.vramMB)}</span> GPU memory · {weight(selected.vramMB)}
            <InfoTip id="vram" />
          </div>
          <div className="h-1.5 rounded bg-zinc-800" role="img" aria-label={`${formatMB(selected.vramMB)} of an 8 GB scale`}>
            <div className="h-full rounded" style={{ width: `${Math.min(100, (selected.vramMB / SCALE_MB) * 100)}%`, backgroundColor: MAGNITUDE }} />
          </div>
          <div className="flex justify-between font-mono text-[10px] text-zinc-600">
            <span>0</span>
            <span>8 GB</span>
          </div>
        </div>
      )}

      <label className="flex items-center gap-2 text-xs text-zinc-400">
        List models up to
        <select value={maxGB} onChange={(e) => setMaxGB(Number(e.target.value))} className="rounded border border-zinc-800 bg-zinc-950 px-1 py-0.5">
          {[2, 4, 8, 16, 64].map((g) => (
            <option key={g} value={g}>
              {g} GB
            </option>
          ))}
        </select>
        <span className="text-zinc-600">{models.length === 0 ? 'loading list…' : `(${visible.length} of ${models.length})`}</span>
      </label>
    </div>
  )
}
