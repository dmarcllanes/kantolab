import { describe, expect, it } from 'vitest'
import { CACHE_SCOPES, localLibUrl, localModelUrl, planFolderImport, relativePath, suggestModelId, toModelRecord } from './customModels'
import { isLocalServer } from './providers'

const config = { tokenizer_files: ['tokenizer.json', 'vocab.json'], context_window_size: 4096, quantization: 'q4f16_1' }
const manifest = { metadata: {}, records: [{ dataPath: 'params_shard_0.bin', nbytes: 10 }, { dataPath: 'params_shard_1.bin', nbytes: 10 }] }
const listing = ['mlc-chat-config.json', 'ndarray-cache.json', 'params_shard_0.bin', 'params_shard_1.bin', 'tokenizer.json', 'Qwen-q4f16_1-webgpu.wasm'].map((path) => ({ path, size: 100 }))

describe('custom models', () => {
  it('maps a folder onto the exact cache URLs WebLLM will request', () => {
    const plan = planFolderImport('my-qwen', listing, config, manifest, 'ndarray-cache.json')
    if (!plan.ok) throw new Error(plan.error)
    const base = 'https://models.kantolab.invalid/my-qwen/resolve/main/'
    expect(localModelUrl('my-qwen')).toBe(base)
    expect(plan.entries).toEqual([
      { path: 'mlc-chat-config.json', scope: CACHE_SCOPES.config, url: `${base}mlc-chat-config.json` },
      { path: 'ndarray-cache.json', scope: CACHE_SCOPES.model, url: `${base}tensor-cache.json` },
      { path: 'params_shard_0.bin', scope: CACHE_SCOPES.model, url: `${base}params_shard_0.bin` },
      { path: 'params_shard_1.bin', scope: CACHE_SCOPES.model, url: `${base}params_shard_1.bin` },
      { path: 'tokenizer.json', scope: CACHE_SCOPES.model, url: `${base}tokenizer.json` },
    ])
    expect(plan).toMatchObject({ wasmPath: 'Qwen-q4f16_1-webgpu.wasm', quantization: 'q4f16_1', contextWindow: 4096, bytes: 600 })
  })

  it('reports missing shards and tokenizer, and non-MLC folders', () => {
    const partial = listing.filter((f) => f.path !== 'params_shard_1.bin' && f.path !== 'tokenizer.json')
    const plan = planFolderImport('m', partial, config, manifest, 'tensor-cache.json')
    expect(plan).toEqual({ ok: false, error: 'Missing from the folder: params_shard_1.bin, tokenizer.json.' })
    expect(planFolderImport('m', listing, { foo: 1 }, manifest, 'tensor-cache.json').ok).toBe(false)
    expect(planFolderImport('m', listing, config, { records: [] }, 'tensor-cache.json').ok).toBe(false)
  })

  it('builds a WebLLM model record whose URL WebLLM keeps as-is', () => {
    const rec = toModelRecord({ id: '1', modelId: 'my-qwen', source: 'folder', modelUrl: localModelUrl('my-qwen'), modelLibUrl: localLibUrl('my-qwen'), contextWindow: 2048, vramMB: 1200, createdAt: 0 })
    expect(rec).toEqual({
      model: 'https://models.kantolab.invalid/my-qwen/resolve/main/',
      model_id: 'my-qwen',
      model_lib: 'https://models.kantolab.invalid/my-qwen/lib.wasm',
      vram_required_MB: 1200,
      low_resource_required: false,
      overrides: { context_window_size: 2048 },
    })
    // WebLLM fetches libraries containing "localhost" without its cache; ours must not.
    expect(rec.model_lib.includes('localhost')).toBe(false)
  })

  it('cleans up names and paths', () => {
    expect(relativePath({ name: 'a.bin', webkitRelativePath: 'My Model/a.bin' })).toBe('a.bin')
    expect(relativePath({ name: 'a.bin', webkitRelativePath: '' })).toBe('a.bin')
    expect(suggestModelId('My Qwen (q4f16_1)')).toBe('My-Qwen-q4f16_1')
    expect(suggestModelId('!!')).toBe('my-model')
  })

  it('treats only this computer as a keyless server', () => {
    expect(isLocalServer('http://localhost:11434/v1')).toBe(true)
    expect(isLocalServer('http://127.0.0.1:1234/v1')).toBe(true)
    expect(isLocalServer('https://api.groq.com/openai/v1')).toBe(false)
    expect(isLocalServer('not a url')).toBe(false)
  })
})
