// BYOK providers. Requests go straight from the browser to the provider; the
// key never touches any KantoLab server (there isn't one).
import { z } from 'zod/v3'
import { chatModelIds } from './cloudProviders'
import type { ChatMessage, ChatOptions, ChatProvider } from './types'

export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5-5'
export const ANTHROPIC_MODEL_SUGGESTIONS = [
  'claude-opus-5-5',
  'claude-sonnet-5-5',
  'claude-haiku-5-5',
  'claude-fable-5-2',
]
// Models that accept server-side refusal fallbacks (`fallbacks: "default"`).
const FALLBACK_MODELS = new Set(['claude-fable-5-2', 'claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5'])
// Models that accept output_config.effort.
const EFFORT_MODELS = new Set([...FALLBACK_MODELS, 'claude-haiku-5-5', 'claude-sonnet-5', 'claude-opus-4-8', 'claude-opus-4-7'])

export const OPENAI_BASE_URL_EXAMPLES = [
  'https://api.openai.com/v1',
  'https://api.groq.com/openai/v1',
  'https://openrouter.ai/api/v1',
  'http://localhost:11434/v1',
  'http://localhost:1234/v1',
  'http://localhost:8080/v1',
]

/** A model server on this computer (Ollama, LM Studio, llama.cpp): no API key needed. */
export function isLocalServer(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost')
  } catch {
    return false
  }
}

export function apiKeySetting(kind: 'openai-compatible' | 'anthropic'): string {
  return `apiKey:${kind}`
}

const openAIResponseSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1),
})
const openAIChunkSchema = z.object({
  choices: z.array(z.object({ delta: z.object({ content: z.string().nullable().optional() }).optional() })),
})

/** Read an OpenAI-style server-sent-event stream, calling onText with the text so far. */
export async function readOpenAIStream(body: ReadableStream<Uint8Array>, onText: (text: string) => void): Promise<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let text = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (data === '[DONE]') continue
      let json: unknown
      try {
        json = JSON.parse(data)
      } catch {
        continue
      }
      const chunk = openAIChunkSchema.safeParse(json)
      const delta = chunk.success ? chunk.data.choices[0]?.delta?.content : undefined
      if (delta) {
        text += delta
        onText(text)
      }
    }
  }
  return text
}

/** Turn a failed fetch (offline, DNS, or a server that blocks browser requests) into plain words. */
function networkProblem(baseUrl: string, e: unknown): Error {
  const local = isLocalServer(baseUrl)
  return new Error(
    local
      ? `Couldn't reach ${baseUrl}. Is the server running, and does it allow browser requests (CORS)? See "Use my own quantized model" → GGUF for the setting.`
      : `Couldn't reach ${baseUrl}. Check your internet connection and the base URL. The provider must also allow browser (CORS) requests.`,
    { cause: e },
  )
}

/** Plain-language message for an HTTP error from an OpenAI-compatible server. */
export function openAIStatusProblem(status: number, body: string): string {
  const detail = body.slice(0, 300)
  if (status === 401) return `The provider rejected the API key (401). Check the key in Settings. ${detail}`.trim()
  if (status === 403) return `The key isn't allowed to do this (403). ${detail}`.trim()
  if (status === 404) return `Not found (404): check the base URL and the model name. ${detail}`.trim()
  if (status === 429) return `Rate limit or quota hit (429). Wait a moment, or check your plan. ${detail}`.trim()
  return `Provider returned ${status}: ${detail}`
}

export function createOpenAICompatibleProvider(cfg: { baseUrl: string; apiKey: string; model: string; fetch?: typeof fetch }): ChatProvider {
  const doFetch = cfg.fetch ?? fetch
  let ctrl: AbortController | null = null
  return {
    id: `openai-compatible:${cfg.model}`,
    async chat(messages: ChatMessage[], options: ChatOptions = {}) {
      ctrl = new AbortController()
      let res: Response
      try {
        res = await doFetch(`${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}) },
          body: JSON.stringify({
            model: cfg.model,
            messages,
            temperature: options.temperature,
            max_tokens: options.maxTokens,
            ...(options.onText ? { stream: true } : {}),
          }),
          signal: ctrl.signal,
        })
      } catch (e) {
        if (ctrl.signal.aborted) throw e
        throw networkProblem(cfg.baseUrl, e)
      }
      if (!res.ok) throw new Error(openAIStatusProblem(res.status, await res.text()))
      if (options.onText && res.body && res.headers.get('content-type')?.includes('text/event-stream')) {
        return readOpenAIStream(res.body, options.onText)
      }
      const parsed = openAIResponseSchema.safeParse(await res.json())
      if (!parsed.success) throw new Error(`Unexpected provider response: ${parsed.error.message}`)
      return parsed.data.choices[0].message.content ?? ''
    },
    interrupt() {
      ctrl?.abort()
    },
  }
}

type AnthropicModule = typeof import('@anthropic-ai/sdk')

/** Plain-language message for an Anthropic SDK error (most specific first). */
function anthropicProblem(A: AnthropicModule['default'], e: unknown, model: string): Error {
  const wrap = (msg: string) => new Error(msg, { cause: e })
  if (e instanceof A.APIUserAbortError) return e
  if (e instanceof A.AuthenticationError) return wrap('Anthropic rejected the API key. Check it in Settings (it starts with sk-ant-).')
  if (e instanceof A.PermissionDeniedError) return wrap(`This API key isn't allowed to use ${model}.`)
  if (e instanceof A.NotFoundError) return wrap(`Anthropic doesn't know the model "${model}". Pick one from the list.`)
  if (e instanceof A.RateLimitError) return wrap('Anthropic rate limit hit, or your credit balance is used up. Wait a moment and try again.')
  if (e instanceof A.BadRequestError) return wrap(`Anthropic couldn't accept this request: ${e.message}`)
  if (e instanceof A.InternalServerError) return wrap(`Anthropic is busy or having trouble (${e.status}). Try again shortly.`)
  if (e instanceof A.APIConnectionError) return wrap('Couldn\'t reach Anthropic. Check your internet connection (or a browser extension blocking api.anthropic.com).')
  if (e instanceof A.APIError) return wrap(`Anthropic API error${e.status ? ` ${e.status}` : ''}: ${e.message}`)
  return e instanceof Error ? e : new Error(String(e))
}

export interface AnthropicConfig {
  apiKey: string
  model: string
  /** For tests. */
  fetch?: typeof fetch
  baseURL?: string
}

async function anthropicClient(cfg: AnthropicConfig) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey: cfg.apiKey, dangerouslyAllowBrowser: true, ...(cfg.fetch ? { fetch: cfg.fetch } : {}), ...(cfg.baseURL ? { baseURL: cfg.baseURL } : {}) })
  return { Anthropic, client }
}

export async function createAnthropicProvider(cfg: AnthropicConfig): Promise<ChatProvider> {
  const { Anthropic, client } = await anthropicClient(cfg)
  let ctrl: AbortController | null = null

  return {
    id: `anthropic:${cfg.model}`,
    async chat(messages: ChatMessage[], options: ChatOptions = {}) {
      ctrl = new AbortController()
      const system = messages
        .filter((m) => m.role === 'system')
        .map((m) => m.content)
        .join('\n\n')
      const turns = messages
        .filter((m): m is ChatMessage & { role: 'user' | 'assistant' } => m.role !== 'system')
        .map((m) => ({ role: m.role, content: m.content }))
      try {
        // No temperature: current Claude models reject sampling parameters.
        const params = {
          model: cfg.model,
          max_tokens: options.maxTokens ?? (options.onText ? 64000 : 16000),
          ...(system ? { system } : {}),
          messages: turns,
          ...(EFFORT_MODELS.has(cfg.model) ? { output_config: { effort: 'medium' as const } } : {}),
          ...(FALLBACK_MODELS.has(cfg.model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
        }
        let res
        if (options.onText) {
          const onText = options.onText
          const stream = client.beta.messages.stream(params, { signal: ctrl.signal })
          let text = ''
          stream.on('text', (delta) => {
            text += delta
            onText(text)
          })
          res = await stream.finalMessage()
        } else {
          res = await client.beta.messages.create(params, { signal: ctrl.signal })
        }
        if (res.stop_reason === 'refusal') {
          const category = res.stop_details?.category
          throw new Error(`The model declined this request${category ? ` (${category})` : ''}.`)
        }
        const text = res.content
          .filter((b) => b.type === 'text')
          .map((b) => b.text)
          .join('')
        if (res.stop_reason === 'max_tokens') throw new Error('The reply hit the length limit and was cut off. Ask for a shorter answer.')
        return text
      } catch (e) {
        throw anthropicProblem(Anthropic, e, cfg.model)
      }
    },
    interrupt() {
      ctrl?.abort()
    },
  }
}

export interface ConnectionCheck {
  ok: boolean
  message: string
  /** Chat models the server offers, when it lists them (for the model picker). */
  models?: string[]
}

const preview = (ids: string[]) => `${ids.slice(0, 6).join(', ')}${ids.length > 6 ? `, … (${ids.length} in all)` : ''}`

/**
 * Check a key + model without generating anything (no tokens billed) by
 * listing the provider's models, and return that list for the model picker.
 */
export async function testConnection(
  cfg: { provider: 'anthropic'; apiKey: string; model: string; fetch?: typeof fetch; baseURL?: string } | { provider: 'openai-compatible'; apiKey: string; model: string; baseUrl: string; fetch?: typeof fetch },
): Promise<ConnectionCheck> {
  const model = cfg.model.trim()
  if (cfg.provider === 'anthropic') {
    const { Anthropic, client } = await anthropicClient(cfg)
    try {
      const models: string[] = []
      for await (const m of client.models.list({ limit: 100 })) models.push(m.id)
      if (!model) return { ok: true, message: 'Connected. Your key works. Pick a model.', models }
      if (!models.includes(model)) return { ok: false, message: `Your key works, but "${model}" isn't one of your models. Pick one from the list.`, models }
      return { ok: true, message: `Connected. Your key works and can use ${model}.`, models }
    } catch (e) {
      return { ok: false, message: anthropicProblem(Anthropic, e, model).message }
    }
  }
  const doFetch = cfg.fetch ?? fetch
  const base = cfg.baseUrl.replace(/\/+$/, '')
  let res: Response
  try {
    res = await doFetch(`${base}/models`, { headers: cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {} })
  } catch (e) {
    return { ok: false, message: networkProblem(cfg.baseUrl, e).message }
  }
  if (!res.ok) return { ok: false, message: openAIStatusProblem(res.status, await res.text()) }
  const list = z.object({ data: z.array(z.object({ id: z.string() })) }).safeParse(await res.json().catch(() => null))
  if (!list.success) return { ok: true, message: 'Connected. (The server didn\'t list its models, so the model name wasn\'t checked.)' }
  const models = chatModelIds(list.data.data.map((m) => m.id))
  if (!model) return { ok: true, message: `Connected. Pick a model: ${preview(models)}`, models }
  // Some routers (e.g. "openrouter/free") accept names they don't list.
  if (models.includes(model.replace(/^models\//, '')) || model.includes('/free') || model.endsWith('/auto')) return { ok: true, message: `Connected, and "${model}" is ready.`, models }
  return { ok: false, message: `Connected, but "${model}" isn't on this server. Pick one: ${preview(models)}`, models }
}
