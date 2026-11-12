// BYOK providers. Requests go straight from the browser to the provider; the
// key never touches any KantoLab server (there isn't one).
import { z } from 'zod/v3'
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
]

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

export function createOpenAICompatibleProvider(cfg: { baseUrl: string; apiKey: string; model: string }): ChatProvider {
  let ctrl: AbortController | null = null
  return {
    id: `openai-compatible:${cfg.model}`,
    async chat(messages: ChatMessage[], options: ChatOptions = {}) {
      ctrl = new AbortController()
      const res = await fetch(`${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({
          model: cfg.model,
          messages,
          temperature: options.temperature,
          max_tokens: options.maxTokens,
          ...(options.onText ? { stream: true } : {}),
        }),
        signal: ctrl.signal,
      })
      if (!res.ok) throw new Error(`Provider returned ${res.status}: ${(await res.text()).slice(0, 300)}`)
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

export async function createAnthropicProvider(cfg: { apiKey: string; model: string }): Promise<ChatProvider> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey: cfg.apiKey, dangerouslyAllowBrowser: true })
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
        const params = {
          model: cfg.model,
          max_tokens: options.maxTokens ?? 16000,
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
        return res.content
          .filter((b) => b.type === 'text')
          .map((b) => b.text)
          .join('')
      } catch (e) {
        if (e instanceof Anthropic.AuthenticationError) throw new Error('Anthropic rejected the API key.', { cause: e })
        if (e instanceof Anthropic.RateLimitError) throw new Error('Anthropic rate limit hit — try again shortly.', { cause: e })
        if (e instanceof Anthropic.APIError) throw new Error(`Anthropic API error ${e.status ?? ''}: ${e.message}`, { cause: e })
        throw e
      }
    },
    interrupt() {
      ctrl?.abort()
    },
  }
}
