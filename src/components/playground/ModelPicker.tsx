import { useEffect, useState } from 'react'
import { listModels, type ModelInfo } from '../../core/engine/webllm'
import { Field, inputClass } from '../ui/Field'
import { InfoTip } from '../ui/InfoTip'
import { MAGNITUDE } from '../viz/colors'

const formatMB = (mb?: number) => (mb === undefined ? '?' : mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`)
const weight = (mb?: number) => (mb === undefined ? '' : mb < 1500 ? 'light' : mb < 3500 ? 'medium' : mb < 7000 ? 'heavy' : 'very heavy')
const SCALE_MB = 8 * 1024

export function ModelPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [models, setModels] = useState<ModelInfo[]>([])
  const [maxGB, setMaxGB] = useState(4)

  useEffect(() => {
    listModels().then(setModels, () => setModels([]))
  }, [])

  const visible = models.filter((m) => m.id === value || (m.vramMB ?? 0) <= maxGB * 1024)
  const selected = models.find((m) => m.id === value)

  return (
    <div className="space-y-2">
      <Field label="Local model (WebGPU)" tip="model">
        <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
          {models.length === 0 && <option value={value}>{value}</option>}
          {visible.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id} · {formatMB(m.vramMB)}
            </option>
          ))}
        </select>
      </Field>

      {selected?.vramMB !== undefined && (
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-xs text-zinc-400">
            Needs <span className="font-mono text-zinc-200">{formatMB(selected.vramMB)}</span> GPU memory · {weight(selected.vramMB)}
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
