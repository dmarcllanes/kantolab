// BYOK providers against a fake HTTP server (an injected fetch), through the
// real Anthropic SDK. No network, no key, no tokens.
import { describe, expect, it } from 'vitest'
import { createAnthropicProvider, createOpenAICompatibleProvider, testConnection } from './providers'

interface Seen {
  url: string
  method: string
  headers: Headers
  body: unknown
}

function fakeFetch(handler: (req: Seen) => Response | Promise<Response>) {
  const seen: Seen[] = []
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init)
    const text = init?.body ? String(init.body) : ''
    const s = { url: req.url, method: req.method, headers: req.headers, body: text ? JSON.parse(text) : undefined }
    seen.push(s)
    return handler(s)
  }) as typeof fetch
  return { fn, seen }
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const message = (text: string, stop_reason = 'end_turn', extra: Record<string, unknown> = {}) => ({
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: 'claude-opus-5-5',
  content: [{ type: 'text', text }],
  stop_reason,
  stop_sequence: null,
  usage: { input_tokens: 10, output_tokens: 5 },
  ...extra,
})

function sse(events: [string, unknown][]): Response {
  const body = events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('')
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

const MSGS = [
  { role: 'system' as const, content: 'Be brief.' },
  { role: 'user' as const, content: 'Hi' },
]

describe('Anthropic provider', () => {
  it('sends a valid request for the current models and returns the text', async () => {
    const { fn, seen } = fakeFetch(() => json(200, message('Hello!')))
    const p = await createAnthropicProvider({ apiKey: 'sk-ant-test', model: 'claude-opus-5-5', fetch: fn })
    expect(await p.chat(MSGS, { temperature: 0.7 })).toBe('Hello!')

    const [req] = seen
    expect(req.url).toContain('/v1/messages')
    expect(req.headers.get('authorization') ?? req.headers.get('x-api-key')).toMatch(/sk-ant-test/)
    expect(req.headers.get('anthropic-dangerous-direct-browser-access')).toBe('true')
    expect(req.headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01')
    expect(req.body).toMatchObject({
      model: 'claude-opus-5-5',
      system: 'Be brief.',
      messages: [{ role: 'user', content: 'Hi' }],
      output_config: { effort: 'medium' },
      fallbacks: 'default',
      max_tokens: 16000,
    })
    // Sampling parameters are rejected by current models.
    expect(req.body).not.toHaveProperty('temperature')
  })

  it('leaves out fallbacks and effort for models that don’t take them', async () => {
    const { fn, seen } = fakeFetch(() => json(200, message('ok')))
    const p = await createAnthropicProvider({ apiKey: 'k', model: 'claude-haiku-4-5', fetch: fn })
    await p.chat(MSGS)
    expect(seen[0].body).not.toHaveProperty('fallbacks')
    expect(seen[0].body).not.toHaveProperty('output_config')
    expect(seen[0].headers.get('anthropic-beta') ?? '').not.toContain('server-side-fallback')
  })

  it('streams text as it arrives', async () => {
    const { fn, seen } = fakeFetch(() =>
      sse([
        ['message_start', { type: 'message_start', message: { ...message(''), content: [], stop_reason: null } }],
        ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
        ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hel' } }],
        ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'lo' } }],
        ['content_block_stop', { type: 'content_block_stop', index: 0 }],
        ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 2 } }],
        ['message_stop', { type: 'message_stop' }],
      ]),
    )
    const p = await createAnthropicProvider({ apiKey: 'k', model: 'claude-sonnet-5-5', fetch: fn })
    const partial: string[] = []
    expect(await p.chat(MSGS, { onText: (t) => partial.push(t) })).toBe('Hello')
    expect(partial).toEqual(['Hel', 'Hello'])
    expect(seen[0].body).toMatchObject({ stream: true, max_tokens: 64000 })
  })

  it('explains refusals and cut-off replies', async () => {
    const refuse = fakeFetch(() => json(200, message('', 'refusal', { stop_details: { type: 'refusal', category: 'cyber', explanation: null } })))
    const p1 = await createAnthropicProvider({ apiKey: 'k', model: 'claude-opus-5-5', fetch: refuse.fn })
    await expect(p1.chat(MSGS)).rejects.toThrow('declined this request (cyber)')

    const cut = fakeFetch(() => json(200, message('partial…', 'max_tokens')))
    const p2 = await createAnthropicProvider({ apiKey: 'k', model: 'claude-opus-5-5', fetch: cut.fn })
    await expect(p2.chat(MSGS)).rejects.toThrow('length limit')
  })

  it('turns API errors into plain words', async () => {
    const err = (status: number, type: string) => () => json(status, { type: 'error', error: { type, message: 'nope' } })
    const cases: [number, string, RegExp][] = [
      [401, 'authentication_error', /rejected the API key/],
      [403, 'permission_error', /isn't allowed to use/],
      [404, 'not_found_error', /doesn't know the model "claude-opus-5-5"/],
      [400, 'invalid_request_error', /couldn't accept this request/],
    ]
    for (const [status, type, re] of cases) {
      const p = await createAnthropicProvider({ apiKey: 'k', model: 'claude-opus-5-5', fetch: fakeFetch(err(status, type)).fn })
      await expect(p.chat(MSGS)).rejects.toThrow(re)
    }
  })
})

describe('testConnection', () => {
  it('checks an Anthropic key by listing models (no tokens)', async () => {
    const page = { data: [{ type: 'model', id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5', created_at: '2026-01-01T00:00:00Z' }], has_more: false, first_id: 'a', last_id: 'a' }
    const { fn, seen } = fakeFetch(() => json(200, page))
    const r = await testConnection({ provider: 'anthropic', apiKey: 'k', model: 'claude-opus-5-5', fetch: fn })
    expect(r).toMatchObject({ ok: true, models: ['claude-opus-5-5'] })
    expect(seen[0].method).toBe('GET')
    expect(seen[0].url).toContain('/v1/models')
    const other = await testConnection({ provider: 'anthropic', apiKey: 'k', model: 'claude-nope', fetch: fn })
    expect(other.ok).toBe(false)
  })

  it('reports a bad Anthropic key', async () => {
    const { fn } = fakeFetch(() => json(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }))
    const r = await testConnection({ provider: 'anthropic', apiKey: 'bad', model: 'claude-opus-5-5', fetch: fn })
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/rejected the API key/)
  })

  it('lists models on an OpenAI-compatible server and checks the name', async () => {
    const { fn, seen } = fakeFetch(() => json(200, { data: [{ id: 'llama-3.3-70b' }, { id: 'qwen' }, { id: 'whisper-large-v3' }, { id: 'models/gemini-x' }] }))
    expect((await testConnection({ provider: 'openai-compatible', apiKey: 'k', model: 'qwen', baseUrl: 'https://x.test/v1/', fetch: fn })).ok).toBe(true)
    expect(seen[0].url).toBe('https://x.test/v1/models')
    expect(seen[0].headers.get('authorization')).toBe('Bearer k')
    const miss = await testConnection({ provider: 'openai-compatible', apiKey: 'k', model: 'gpt-x', baseUrl: 'https://x.test/v1', fetch: fn })
    expect(miss).toMatchObject({ ok: false, message: expect.stringContaining('isn\'t on this server'), models: ['gemini-x', 'llama-3.3-70b', 'qwen'] })
    // Gemini lists "models/…" ids but accepts the bare name.
    expect((await testConnection({ provider: 'openai-compatible', apiKey: 'k', model: 'gemini-x', baseUrl: 'https://x.test/v1', fetch: fn })).ok).toBe(true)
  })

  it('explains an unreachable server', async () => {
    const down = (() => Promise.reject(new TypeError('Failed to fetch'))) as typeof fetch
    const local = await testConnection({ provider: 'openai-compatible', apiKey: '', model: '', baseUrl: 'http://localhost:1234/v1', fetch: down })
    expect(local.message).toMatch(/Is the server running/)
    const remote = await testConnection({ provider: 'openai-compatible', apiKey: 'k', model: '', baseUrl: 'https://api.groq.com/openai/v1', fetch: down })
    expect(remote.message).toMatch(/CORS/)
  })
})

describe('OpenAI-compatible provider', () => {
  it('sends no Authorization header without a key and explains a 401', async () => {
    const { fn, seen } = fakeFetch(() => new Response('{"error":"bad key"}', { status: 401 }))
    const p = createOpenAICompatibleProvider({ baseUrl: 'https://x.test/v1', apiKey: '', model: 'm', fetch: fn })
    await expect(p.chat(MSGS)).rejects.toThrow(/rejected the API key/)
    expect(seen[0].headers.get('authorization')).toBeNull()
  })
})
