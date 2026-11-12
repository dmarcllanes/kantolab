import type { InitProgressReport, WebWorkerMLCEngine } from '@mlc-ai/web-llm'
import type { ChatMessage, ChatOptions, ChatProvider } from './types'

let worker: Worker | null = null
let engine: WebWorkerMLCEngine | null = null

export interface ModelInfo {
  id: string
  vramMB?: number
  lowResource?: boolean
}

/** Chat-capable models from WebLLM's prebuilt config, smallest first. */
export async function listModels(): Promise<ModelInfo[]> {
  const { prebuiltAppConfig, ModelType } = await import('@mlc-ai/web-llm')
  return prebuiltAppConfig.model_list
    .filter((m) => m.model_type === undefined || m.model_type === ModelType.LLM)
    .map((m) => ({ id: m.model_id, vramMB: m.vram_required_MB, lowResource: m.low_resource_required }))
    .sort((a, b) => (a.vramMB ?? Infinity) - (b.vramMB ?? Infinity))
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
  const { CreateWebWorkerMLCEngine } = await import('@mlc-ai/web-llm')
  worker = new Worker(new URL('../../worker/llm.worker.ts', import.meta.url), { type: 'module' })
  engine = await CreateWebWorkerMLCEngine(worker, modelId, { initProgressCallback: onProgress })
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

/** Delete WebLLM's downloaded weights/wasm from Cache Storage. */
export async function clearModelCache(): Promise<number> {
  const keys = (await caches.keys()).filter((k) => k.startsWith('webllm'))
  await Promise.all(keys.map((k) => caches.delete(k)))
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
