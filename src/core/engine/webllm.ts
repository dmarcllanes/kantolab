import type { InitProgressReport, WebWorkerMLCEngine } from '@mlc-ai/web-llm'
import { db } from '../memory/db'
import { deleteLocalModelFiles, toModelRecord, type CustomModel } from './customModels'
import type { ChatMessage, ChatOptions, ChatProvider } from './types'

let worker: Worker | null = null
let engine: WebWorkerMLCEngine | null = null

export interface ModelInfo {
  id: string
  vramMB?: number
  lowResource?: boolean
  /** Added by the user (from a URL or a local folder). */
  custom?: CustomModel
}

/** Chat-capable models from WebLLM's prebuilt config, smallest first. */
export async function listModels(): Promise<ModelInfo[]> {
  const { prebuiltAppConfig, ModelType } = await import('@mlc-ai/web-llm')
  return prebuiltAppConfig.model_list
    .filter((m) => m.model_type === undefined || m.model_type === ModelType.LLM)
    .map((m) => ({ id: m.model_id, vramMB: m.vram_required_MB, lowResource: m.low_resource_required }))
    .sort((a, b) => (a.vramMB ?? Infinity) - (b.vramMB ?? Infinity))
}

/** Prebuilt model libraries, for reusing one with a fine-tune of the same architecture. */
export async function listPrebuiltLibs(): Promise<{ modelId: string; lib: string; contextWindow?: number; vramMB?: number }[]> {
  const { prebuiltAppConfig, ModelType } = await import('@mlc-ai/web-llm')
  return prebuiltAppConfig.model_list
    .filter((m) => m.model_type === undefined || m.model_type === ModelType.LLM)
    .map((m) => ({ modelId: m.model_id, lib: m.model_lib, contextWindow: m.overrides?.context_window_size, vramMB: m.vram_required_MB }))
    .sort((a, b) => a.modelId.localeCompare(b.modelId))
}

export async function isPrebuiltModel(modelId: string): Promise<boolean> {
  const { prebuiltAppConfig } = await import('@mlc-ai/web-llm')
  return prebuiltAppConfig.model_list.some((m) => m.model_id === modelId)
}

export async function removeCustomModel(m: CustomModel): Promise<void> {
  if (m.source === 'folder') await deleteLocalModelFiles(m.modelId)
  await db.customModels.delete(m.id)
}

/**
 * Load a model inside the LLM worker (src/worker/llm.worker.ts). Any previously
 * loaded engine is torn down first. web-llm is imported lazily so it stays out
 * of the initial bundle.
 */
export async function loadModel(
  modelId: string,
  onProgress?: (report: InitProgressReport) => void,
): Promise<ChatProvider> {
  await unloadModel()
  const { CreateWebWorkerMLCEngine, prebuiltAppConfig } = await import('@mlc-ai/web-llm')
  // The user's own models are appended to WebLLM's list; the config travels to the worker.
  const custom = await db.customModels.toArray()
  const appConfig = { ...prebuiltAppConfig, model_list: [...prebuiltAppConfig.model_list, ...custom.map(toModelRecord)] }
  worker = new Worker(new URL('../../worker/llm.worker.ts', import.meta.url), { type: 'module' })
  engine = await CreateWebWorkerMLCEngine(worker, modelId, { appConfig, initProgressCallback: onProgress })
  return webLLMProvider(engine, modelId)
}

export async function unloadModel(): Promise<void> {
  try {
    if (engine) await engine.unload()
  } finally {
    worker?.terminate()
    engine = null
    worker = null
  }
}

/** Delete WebLLM's downloaded weights/wasm from Cache Storage (including imported folders). */
export async function clearModelCache(): Promise<number> {
  const keys = (await caches.keys()).filter((k) => k.startsWith('webllm'))
  await Promise.all(keys.map((k) => caches.delete(k)))
  // Models imported from a folder lived only in that cache; forget them too.
  await db.customModels.filter((m) => m.source === 'folder').delete()
  return keys.length
}

function webLLMProvider(eng: WebWorkerMLCEngine, modelId: string): ChatProvider {
  return {
    id: `webllm:${modelId}`,
    async chat(messages: ChatMessage[], options: ChatOptions = {}) {
      const base = { messages, temperature: options.temperature, max_tokens: options.maxTokens }
      if (!options.onText) {
        const res = await eng.chat.completions.create({ ...base, stream: false })
        return res.choices[0]?.message.content ?? ''
      }
      const stream = await eng.chat.completions.create({ ...base, stream: true })
      let text = ''
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content
        if (delta) {
          text += delta
          options.onText(text)
        }
      }
      return text
    },
    interrupt() {
      eng.interruptGenerate()
    },
  }
}
