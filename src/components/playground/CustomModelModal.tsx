import { FolderOpen, Server } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  estimateVramMB,
  localLibUrl,
  localModelUrl,
  MODEL_ID_PATTERN,
  planFolderImport,
  relativePath,
  suggestModelId,
  writeFolderToCache,
  type CustomModel,
  type FolderPlan,
} from '../../core/engine/customModels'
import { isPrebuiltModel, listPrebuiltLibs } from '../../core/engine/webllm'
import { db } from '../../core/memory/db'
import { Button } from '../ui/Button'
import { Field, inputClass } from '../ui/Field'
import { InfoTip } from '../ui/InfoTip'
import { Modal } from '../ui/Modal'
import { Tabs } from '../ui/Tabs'

const TABS = [
  { id: 'folder', label: 'From this computer' },
  { id: 'url', label: 'From a URL' },
  { id: 'gguf', label: 'GGUF / Ollama' },
] as const
type Tab = (typeof TABS)[number]['id']

type Prebuilt = Awaited<ReturnType<typeof listPrebuiltLibs>>[number]

const fmtBytes = (n: number) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(2)} GB` : `${Math.round(n / 1024 ** 2)} MB`)

async function idProblem(modelId: string): Promise<string | null> {
  if (!MODEL_ID_PATTERN.test(modelId)) return 'Use 2–80 letters, digits, dots, dashes or underscores.'
  if (await isPrebuiltModel(modelId)) return 'That name is a built-in WebLLM model. Pick another.'
  if ((await db.customModels.where('modelId').equals(modelId).count()) > 0) return 'You already have a model with this name.'
  return null
}

/** Pick the compiled model library: from a prebuilt model of the same architecture, or a URL. */
function LibraryPicker({
  prebuilt,
  value,
  onChange,
  quantization,
}: {
  prebuilt: Prebuilt[]
  value: { mode: 'prebuilt'; modelId: string } | { mode: 'url'; url: string }
  onChange: (v: { mode: 'prebuilt'; modelId: string } | { mode: 'url'; url: string }) => void
  quantization?: string
}) {
  // Suggest libraries with the same quantization first.
  const sorted = useMemo(
    () => (quantization ? [...prebuilt].sort((a, b) => Number(b.modelId.includes(quantization)) - Number(a.modelId.includes(quantization))) : prebuilt),
    [prebuilt, quantization],
  )
  return (
    <div className="space-y-2 rounded-md border border-zinc-800 p-3">
      <div className="flex items-center gap-1 text-xs font-medium text-zinc-300">
        Model library (.wasm) <InfoTip id="modelLib" />
      </div>
      <label className="flex items-start gap-2 text-xs text-zinc-300">
        <input type="radio" checked={value.mode === 'prebuilt'} onChange={() => onChange({ mode: 'prebuilt', modelId: sorted[0]?.modelId ?? '' })} className="mt-0.5 accent-emerald-400" />
        <span className="flex-1 space-y-1">
          Same architecture as a built-in model (fine-tunes of it)
          {value.mode === 'prebuilt' && (
            <select aria-label="Built-in model to borrow the library from" value={value.modelId} onChange={(e) => onChange({ mode: 'prebuilt', modelId: e.target.value })} className={inputClass}>
              {sorted.map((p) => (
                <option key={p.modelId} value={p.modelId}>
                  {p.modelId}
                </option>
              ))}
            </select>
          )}
        </span>
      </label>
      <label className="flex items-start gap-2 text-xs text-zinc-300">
        <input type="radio" checked={value.mode === 'url'} onChange={() => onChange({ mode: 'url', url: '' })} className="mt-0.5 accent-emerald-400" />
        <span className="flex-1 space-y-1">
          My own compiled library (URL)
          {value.mode === 'url' && (
            <input
              aria-label="Model library URL"
              value={value.url}
              onChange={(e) => onChange({ mode: 'url', url: e.target.value })}
              placeholder="https://huggingface.co/you/your-model/resolve/main/model-webgpu.wasm"
              className={`${inputClass} font-mono`}
            />
          )}
        </span>
      </label>
      {quantization && <p className="text-[11px] text-zinc-500">Your model is {quantization}: the library must match its architecture, quantization and context size, or loading fails.</p>}
    </div>
  )
}

type Lib = { mode: 'prebuilt'; modelId: string } | { mode: 'url'; url: string }

function libUrl(lib: Lib, prebuilt: Prebuilt[]): string | null {
  if (lib.mode === 'prebuilt') return prebuilt.find((p) => p.modelId === lib.modelId)?.lib ?? null
  return /^https:\/\/\S+\.wasm(\?\S*)?$/i.test(lib.url.trim()) ? lib.url.trim() : null
}

function FolderTab({ prebuilt, onAdded }: { prebuilt: Prebuilt[]; onAdded: (modelId: string) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<Map<string, File> | null>(null)
  const [manifestPath, setManifestPath] = useState('')
  const [chatConfig, setChatConfig] = useState<unknown>(null)
  const [manifest, setManifest] = useState<unknown>(null)
  const [modelId, setModelId] = useState('')
  const [lib, setLib] = useState<Lib>({ mode: 'prebuilt', modelId: '' })
  const [progress, setProgress] = useState<{ done: number; total: number; file: string } | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  const plan: FolderPlan | null = useMemo(
    () => (files && chatConfig && manifest ? planFolderImport('preview', [...files].map(([path, f]) => ({ path, size: f.size })), chatConfig, manifest, manifestPath) : null),
    [files, chatConfig, manifest, manifestPath],
  )

  const choose = async (list: FileList) => {
    setProblem(null)
    const map = new Map([...list].map((f) => [relativePath(f), f]))
    const cfgFile = map.get('mlc-chat-config.json')
    const mPath = ['tensor-cache.json', 'ndarray-cache.json'].find((p) => map.has(p))
    if (!cfgFile || !mPath) {
      setFiles(null)
      setProblem('This folder needs mlc-chat-config.json and tensor-cache.json (or ndarray-cache.json): the output of `mlc_llm convert_weight` + `gen_config`. For a .gguf file, use the GGUF tab.')
      return
    }
    try {
      setChatConfig(JSON.parse(await cfgFile.text()))
      setManifest(JSON.parse(await map.get(mPath)!.text()))
    } catch {
      setProblem('mlc-chat-config.json or the tensor manifest is not valid JSON.')
      return
    }
    setManifestPath(mPath)
    setFiles(map)
    const folder = (list[0]?.webkitRelativePath || '').split('/')[0] || 'my-model'
    setModelId(suggestModelId(folder))
    const quant = (JSON.parse(await cfgFile.text()) as { quantization?: string }).quantization
    const match = prebuilt.find((p) => quant && p.modelId.includes(quant))
    setLib({ mode: 'prebuilt', modelId: match?.modelId ?? prebuilt[0]?.modelId ?? '' })
  }

  const ready = plan?.ok ? plan : null
  const wasmFile = ready?.wasmPath ? files?.get(ready.wasmPath) : undefined

  const importIt = async () => {
    if (!ready || !files) return
    const err = await idProblem(modelId)
    if (err) return setProblem(err)
    const lUrl = wasmFile ? localLibUrl(modelId) : libUrl(lib, prebuilt)
    if (!lUrl) return setProblem('Choose a model library: a built-in one, or an https URL ending in .wasm.')
    // Ask the browser not to evict the copied weights under storage pressure.
    await navigator.storage?.persist?.().catch(() => false)
    try {
      const fresh = planFolderImport(modelId, [...files].map(([path, f]) => ({ path, size: f.size })), chatConfig, manifest, manifestPath)
      if (!fresh.ok) return setProblem(fresh.error)
      await writeFolderToCache(fresh, files, wasmFile ? { url: lUrl, blob: wasmFile } : null, (done, total, file) => setProgress({ done, total, file }))
      const shardBytes = fresh.entries.filter((e) => e.path.endsWith('.bin')).reduce((n, e) => n + (files.get(e.path)?.size ?? 0), 0)
      const record: CustomModel = {
        id: crypto.randomUUID(),
        modelId,
        source: 'folder',
        modelUrl: localModelUrl(modelId),
        modelLibUrl: lUrl,
        ...(fresh.contextWindow ? { contextWindow: fresh.contextWindow } : {}),
        vramMB: estimateVramMB(shardBytes),
        files: fresh.entries.length + (wasmFile ? 1 : 0),
        bytes: fresh.bytes,
        createdAt: Date.now(),
      }
      await db.customModels.add(record)
      onAdded(modelId)
    } catch (e) {
      setProgress(null)
      setProblem(
        e instanceof DOMException && e.name === 'QuotaExceededError'
          ? 'Not enough browser storage for this model. Free space (Settings → remove downloaded models) or use a smaller quantization.'
          : `Import failed: ${e instanceof Error ? e.message : String(e)}`,
      )
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-zinc-400">
        Pick the folder of an <strong className="text-zinc-200">MLC-format</strong> model (e.g. your own <span className="font-mono">q4f16_1</span> quantization). The files are copied into this browser’s
        storage, not uploaded anywhere, and load like a downloaded model.
      </p>
      <input
        ref={input}
        type="file"
        multiple
        className="hidden"
        {...{ webkitdirectory: '', directory: '' }}
        onChange={(e) => {
          if (e.target.files?.length) void choose(e.target.files)
          e.target.value = ''
        }}
      />
      <Button onClick={() => input.current?.click()} disabled={!!progress}>
        <FolderOpen className="size-4" /> Choose model folder
      </Button>

      {plan && !plan.ok && <p className="rounded bg-red-500/10 p-2 text-xs text-red-300">{plan.error}</p>}
      {ready && (
        <div className="space-y-3">
          <p className="text-xs text-zinc-300">
            Found {ready.entries.length} files · <span className="font-mono">{fmtBytes(ready.bytes)}</span>
            {ready.quantization && <> · {ready.quantization}</>}
            {ready.contextWindow && <> · context {ready.contextWindow}</>}
            {wasmFile && <> · library <span className="font-mono">{ready.wasmPath}</span></>}
          </p>
          <Field label="Model name" hint="Agents refer to the model by this name.">
            <input value={modelId} onChange={(e) => setModelId(e.target.value.trim())} className={`${inputClass} font-mono`} disabled={!!progress} />
          </Field>
          {!wasmFile && <LibraryPicker prebuilt={prebuilt} value={lib} onChange={setLib} quantization={ready.quantization} />}
          {progress ? (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-zinc-400">
                <span className="truncate">Copying {progress.file}</span>
                <span className="font-mono">{Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded bg-zinc-800">
                <div className="h-full bg-sky-400 transition-[width]" style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }} />
              </div>
            </div>
          ) : (
            <Button variant="primary" onClick={() => void importIt()}>
              Add model
            </Button>
          )}
        </div>
      )}
      {problem && <p className="rounded bg-red-500/10 p-2 text-xs text-red-300">{problem}</p>}
    </div>
  )
}

function UrlTab({ prebuilt, onAdded }: { prebuilt: Prebuilt[]; onAdded: (modelId: string) => void }) {
  const [modelUrl, setModelUrl] = useState('')
  const [modelId, setModelId] = useState('')
  const [chosenLib, setLib] = useState<Lib>({ mode: 'prebuilt', modelId: '' })
  const [problem, setProblem] = useState<string | null>(null)
  // Until the user picks, default to the first built-in library (the list loads async).
  const lib: Lib = chosenLib.mode === 'prebuilt' && !chosenLib.modelId ? { mode: 'prebuilt', modelId: prebuilt[0]?.modelId ?? '' } : chosenLib

  const onUrl = (url: string) => {
    setModelUrl(url)
    const last = url.replace(/\/(resolve|tree)\/.*$/, '').replace(/\/+$/, '').split('/').pop()
    if (last && !modelId) setModelId(suggestModelId(last))
  }

  const add = async () => {
    setProblem(null)
    if (!/^https:\/\/\S+$/i.test(modelUrl.trim())) return setProblem('The weights URL must start with https://.')
    const err = await idProblem(modelId)
    if (err) return setProblem(err)
    const lUrl = libUrl(lib, prebuilt)
    if (!lUrl) return setProblem('Choose a model library: a built-in one, or an https URL ending in .wasm.')
    const base = lib.mode === 'prebuilt' ? prebuilt.find((p) => p.modelId === lib.modelId) : undefined
    await db.customModels.add({
      id: crypto.randomUUID(),
      modelId,
      source: 'url',
      modelUrl: modelUrl.trim(),
      modelLibUrl: lUrl,
      ...(base?.contextWindow ? { contextWindow: base.contextWindow } : {}),
      ...(base?.vramMB ? { vramMB: base.vramMB } : {}),
      createdAt: Date.now(),
    })
    onAdded(modelId)
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-zinc-400">
        Upload your MLC-format weights to a free public host, like a Hugging Face model repo, and paste its address. The model downloads straight into this browser on first load, then it’s cached.
      </p>
      <Field label="Weights URL" hint="Folder with mlc-chat-config.json, tensor-cache.json and params_shard_*.bin. Must allow cross-origin requests (Hugging Face does).">
        <input value={modelUrl} onChange={(e) => onUrl(e.target.value)} placeholder="https://huggingface.co/you/my-model-q4f16_1-MLC" className={`${inputClass} font-mono`} />
      </Field>
      <Field label="Model name">
        <input value={modelId} onChange={(e) => setModelId(e.target.value.trim())} className={`${inputClass} font-mono`} />
      </Field>
      <LibraryPicker prebuilt={prebuilt} value={lib} onChange={setLib} />
      {problem && <p className="rounded bg-red-500/10 p-2 text-xs text-red-300">{problem}</p>}
      <Button variant="primary" onClick={() => void add()}>
        Add model
      </Button>
    </div>
  )
}

const SERVERS = [
  { name: 'Ollama', url: 'http://localhost:11434/v1', how: 'ollama create my-model -f Modelfile  (FROM ./my-model.Q4_K_M.gguf), then ollama serve', cors: 'For the hosted site, start it with OLLAMA_ORIGINS=* (or your site’s address).' },
  { name: 'LM Studio', url: 'http://localhost:1234/v1', how: 'Load your .gguf, open the Developer tab and start the server.', cors: 'Turn on “Enable CORS” in the server settings.' },
  { name: 'llama.cpp', url: 'http://localhost:8080/v1', how: 'llama-server -m my-model.Q4_K_M.gguf', cors: 'Allows browser requests by default.' },
]

function GgufTab({ onUseServer }: { onUseServer?: (baseUrl: string) => void }) {
  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-zinc-400">
        <strong className="text-zinc-200">GGUF</strong> files (llama.cpp quantizations like Q4_K_M) can’t run on WebGPU. Run them with a free app on your own computer, and the agent talks to it directly. No key and no
        cloud, and nothing leaves your machine.
      </p>
      <ul className="space-y-2">
        {SERVERS.map((s) => (
          <li key={s.name} className="space-y-1 rounded-md border border-zinc-800 p-3">
            <div className="flex items-center gap-2">
              <Server className="size-3.5 text-zinc-400" />
              <span className="font-medium text-zinc-100">{s.name}</span>
              <span className="font-mono text-[11px] text-zinc-500">{s.url}</span>
              {onUseServer && (
                <Button size="sm" className="ml-auto" onClick={() => onUseServer(s.url)}>
                  Use with this agent
                </Button>
              )}
            </div>
            <p className="font-mono text-[11px] text-zinc-300">{s.how}</p>
            <p className="text-[11px] text-zinc-500">{s.cors}</p>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-zinc-500">“Use with this agent” switches it to the OpenAI-compatible provider with that address. Then type your model’s name (as the server lists it) in the Model field.</p>
    </div>
  )
}

export function CustomModelModal({ onClose, onAdded, onUseServer }: { onClose: () => void; onAdded: (modelId: string) => void; onUseServer?: (baseUrl: string) => void }) {
  const [tab, setTab] = useState<Tab>('folder')
  const [prebuilt, setPrebuilt] = useState<Prebuilt[]>([])
  useEffect(() => {
    listPrebuiltLibs().then(setPrebuilt, () => setPrebuilt([]))
  }, [])
  return (
    <Modal title="Add your own model" onClose={onClose} wide>
      <div className="-mx-4 -mt-4 mb-4">
        <Tabs tabs={TABS} value={tab} onChange={setTab} />
      </div>
      {tab === 'folder' && <FolderTab prebuilt={prebuilt} onAdded={onAdded} />}
      {tab === 'url' && <UrlTab prebuilt={prebuilt} onAdded={onAdded} />}
      {tab === 'gguf' && <GgufTab onUseServer={onUseServer} />}
    </Modal>
  )
}
