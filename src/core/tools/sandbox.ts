// Runs user-written tool code in a throwaway Worker created from a Blob.
// It keeps buggy or slow code (infinite loops included) off the UI thread and
// away from the app's state, and kills it after a timeout. Network, storage
// and nested workers are removed from the worker scope on a best-effort basis;
// this is isolation for code the user wrote, not a boundary against hostile code.

export const DEFAULT_SANDBOX_TIMEOUT_MS = 5000

const BLOCKED_GLOBALS = [
  'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts',
  'indexedDB', 'caches', 'Worker', 'SharedWorker', 'BroadcastChannel', 'navigator',
]

function workerSource(code: string): string {
  return `"use strict";
for (const name of ${JSON.stringify(BLOCKED_GLOBALS)}) {
  try { Object.defineProperty(self, name, { value: undefined, configurable: false, writable: false }); } catch (_) {}
}
const __run = async (input) => {
${code}
};
self.onmessage = async (event) => {
  try {
    const output = await __run(event.data);
    self.postMessage({ ok: true, output: output === undefined ? null : JSON.parse(JSON.stringify(output)) });
  } catch (err) {
    self.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};`
}

export function runInSandbox(code: string, input: unknown, timeoutMs = DEFAULT_SANDBOX_TIMEOUT_MS): Promise<unknown> {
  const url = URL.createObjectURL(new Blob([workerSource(code)], { type: 'text/javascript' }))
  const worker = new Worker(url)
  return new Promise<unknown>((resolve, reject) => {
    const done = () => {
      clearTimeout(timer)
      worker.terminate()
      URL.revokeObjectURL(url)
    }
    const timer = setTimeout(() => {
      done()
      reject(new Error(`Tool timed out after ${timeoutMs} ms`))
    }, timeoutMs)
    worker.onmessage = (e: MessageEvent<{ ok: boolean; output?: unknown; error?: string }>) => {
      done()
      if (e.data.ok) resolve(e.data.output)
      else reject(new Error(e.data.error ?? 'Tool failed'))
    }
    worker.onerror = (e) => {
      e.preventDefault()
      done()
      reject(new Error(e.message || 'Tool code has a syntax error'))
    }
    worker.postMessage(input)
  })
}
