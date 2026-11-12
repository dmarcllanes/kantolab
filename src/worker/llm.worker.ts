// All WebLLM model loading and inference runs here, off the main thread.
// The main thread talks to this worker through CreateWebWorkerMLCEngine
// (see src/core/engine/webllm.ts).
import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm'

const handler = new WebWorkerMLCEngineHandler()

self.onmessage = (msg: MessageEvent) => {
  handler.onmessage(msg)
}
