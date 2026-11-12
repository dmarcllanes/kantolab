// Bring-your-own quantized models for WebLLM, still with zero infrastructure:
//  - "url":    MLC-format weights hosted anywhere public (e.g. a free Hugging Face repo).
//  - "folder": MLC-format weights on this computer. The files are copied into the
//              same Cache Storage WebLLM reads from, under a made-up URL, so WebLLM
//              finds them "already downloaded" and never touches the network.
// The compiled model library (.wasm) can come from the folder, a URL, or a
// prebuilt WebLLM model with the same architecture (typical for fine-tunes).
import { z } from 'zod/v3'

export interface CustomModel {
  id: string
  /** The id agents use; must not clash with a prebuilt WebLLM model. */
  modelId: string
  source: 'url' | 'folder'
  /** Base URL of the MLC weights (for folders, the made-up local URL). */
  modelUrl: string
  /** URL of the compiled WebGPU library (.wasm). */
  modelLibUrl: string
  contextWindow?: number
  vramMB?: number
  /** For folder imports: what was copied into the browser. */
  files?: number
  bytes?: number
  createdAt: number
}

export const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{1,79}$/

/** Never resolves on the network; only used as Cache Storage keys. */
export const LOCAL_MODEL_ORIGIN = 'https://models.kantolab.invalid'

export const localModelUrl = (modelId: string) => `${LOCAL_MODEL_ORIGIN}/${encodeURIComponent(modelId)}/resolve/main/`
export const localLibUrl = (modelId: string) => `${LOCAL_MODEL_ORIGIN}/${encodeURIComponent(modelId)}/lib.wasm`

/** WebLLM's cache scopes (see @mlc-ai/web-llm: ArtifactCache usage in reload()). */
export const CACHE_SCOPES = { config: 'webllm/config', model: 'webllm/model', wasm: 'webllm/wasm' } as const
type Scope = (typeof CACHE_SCOPES)[keyof typeof CACHE_SCOPES]

/** The shape WebLLM's AppConfig.model_list expects. */
export function toModelRecord(m: CustomModel) {
  return {
    model: m.modelUrl,
    model_id: m.modelId,
    model_lib: m.modelLibUrl,
    ...(m.vramMB ? { vram_required_MB: m.vramMB } : {}),
    low_resource_required: false,
    ...(m.contextWindow ? { overrides: { context_window_size: m.contextWindow } } : {}),
  }
}

export const chatConfigSchema = z
  .object({
    tokenizer_files: z.array(z.string()).min(1),
    context_window_size: z.number().int().positive().optional(),
    quantization: z.string().optional(),
    model_type: z.string().optional(),
  })
  .passthrough()

export const tensorManifestSchema = z
  .object({
    records: z.array(z.object({ dataPath: z.string().min(1), nbytes: z.number().optional() }).passthrough()).min(1),
  })
  .passthrough()

export interface FolderFile {
  /** Path inside the chosen folder, e.g. "params_shard_0.bin". */
  path: string
  size: number
}

export interface CacheEntry {
  path: string
  scope: Scope
  url: string
}

export type FolderPlan =
  | {
      ok: true
      entries: CacheEntry[]
      /** A .wasm found in the folder, if any. */
      wasmPath: string | null
      quantization?: string
      contextWindow?: number
      bytes: number
    }
  | { ok: false; error: string }

/** Strip the chosen folder's own name from webkitRelativePath ("my-model/a.bin" → "a.bin"). */
export function relativePath(file: { name: string; webkitRelativePath?: string }): string {
  const rel = file.webkitRelativePath || file.name
  const slash = rel.indexOf('/')
  return slash === -1 ? rel : rel.slice(slash + 1)
}

/**
 * Work out which files go where, given the folder listing and the two JSON
 * files already read from it. Pure, so it can be tested without a browser.
 */
export function planFolderImport(modelId: string, files: FolderFile[], chatConfigJson: unknown, manifestJson: unknown, manifestPath: string): FolderPlan {
  const byPath = new Map(files.map((f) => [f.path, f]))
  const config = chatConfigSchema.safeParse(chatConfigJson)
  if (!config.success) return { ok: false, error: 'mlc-chat-config.json is missing "tokenizer_files". Is this an MLC-format model folder?' }
  const manifest = tensorManifestSchema.safeParse(manifestJson)
  if (!manifest.success) return { ok: false, error: `${manifestPath} has no weight records.` }

  const base = localModelUrl(modelId)
  const entries: CacheEntry[] = [
    { path: 'mlc-chat-config.json', scope: CACHE_SCOPES.config, url: `${base}mlc-chat-config.json` },
    // Older MLC exports call this ndarray-cache.json; WebLLM now asks for tensor-cache.json.
    { path: manifestPath, scope: CACHE_SCOPES.model, url: `${base}tensor-cache.json` },
  ]
  const missing: string[] = []
  for (const shard of new Set(manifest.data.records.map((r) => r.dataPath))) {
    if (!byPath.has(shard)) missing.push(shard)
    entries.push({ path: shard, scope: CACHE_SCOPES.model, url: new URL(shard, base).href })
  }
  const tokenizer = ['tokenizer.json', 'tokenizer.model'].find((t) => config.data.tokenizer_files.includes(t) && byPath.has(t))
  if (!tokenizer) missing.push('tokenizer.json')
  else entries.push({ path: tokenizer, scope: CACHE_SCOPES.model, url: `${base}${tokenizer}` })

  if (missing.length) {
    const list = missing.slice(0, 4).join(', ') + (missing.length > 4 ? ` and ${missing.length - 4} more` : '')
    return { ok: false, error: `Missing from the folder: ${list}.` }
  }
  const wasm = files.find((f) => f.path.toLowerCase().endsWith('.wasm'))
  return {
    ok: true,
    entries,
    wasmPath: wasm?.path ?? null,
    quantization: config.data.quantization,
    contextWindow: config.data.context_window_size,
    bytes: entries.reduce((n, e) => n + (byPath.get(e.path)?.size ?? 0), 0) + (wasm?.size ?? 0),
  }
}

/** A readable model id from a folder name, e.g. "my-qwen-q4f16_1-MLC". */
export function suggestModelId(folderName: string): string {
  const id = folderName.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-._]+|[-._]+$/g, '').slice(0, 80)
  return MODEL_ID_PATTERN.test(id) ? id : 'my-model'
}

/** Rough GPU memory need from the weights' size (weights + KV cache + overhead). */
export function estimateVramMB(weightBytes: number): number {
  return Math.round((weightBytes / 1024 / 1024) * 1.25 + 300)
}

/** Copy a planned folder into WebLLM's caches. `files` is keyed by relative path. */
export async function writeFolderToCache(
  plan: Extract<FolderPlan, { ok: true }>,
  files: Map<string, Blob>,
  wasm: { url: string; blob: Blob } | null,
  onProgress: (done: number, total: number, file: string) => void,
): Promise<void> {
  const all = [...plan.entries.map((e) => ({ ...e, blob: files.get(e.path)! })), ...(wasm ? [{ path: 'model library (.wasm)', scope: CACHE_SCOPES.wasm, url: wasm.url, blob: wasm.blob }] : [])]
  const total = all.reduce((n, e) => n + e.blob.size, 0)
  let done = 0
  const opened = new Map<string, Cache>()
  for (const e of all) {
    onProgress(done, total, e.path)
    let cache = opened.get(e.scope)
    if (!cache) {
      cache = await caches.open(e.scope)
      opened.set(e.scope, cache)
    }
    // Chrome's Cache.put rejects disk-backed File bodies ("network error"), so read
    // each file into memory first. MLC shards are small (~30–100 MB), one at a time.
    const body = await e.blob.arrayBuffer()
    await cache.put(new Request(e.url), new Response(body, { headers: { 'Content-Type': 'application/octet-stream' } }))
    done += e.blob.size
  }
  onProgress(total, total, '')
}

/** Remove everything a folder import put in Cache Storage. */
export async function deleteLocalModelFiles(modelId: string): Promise<void> {
  const prefix = `${LOCAL_MODEL_ORIGIN}/${encodeURIComponent(modelId)}/`
  for (const scope of Object.values(CACHE_SCOPES)) {
    const cache = await caches.open(scope)
    for (const req of await cache.keys()) if (req.url.startsWith(prefix)) await cache.delete(req)
  }
}
