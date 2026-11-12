import { describe, expect, it } from 'vitest'
import { z } from 'zod/v3'
import type { ChatMessage, ChatProvider } from '../engine/types'
import { defineTool } from '../tools/types'
import { calculatorTool } from '../tools/builtin'
import { newAgent } from './agents'
import { runAgent, type RunHooks } from './runner'
import type { AgentStatus, TraceStep } from './types'

function scripted(replies: string[]): ChatProvider & { seen: ChatMessage[][] } {
  const seen: ChatMessage[][] = []
  return {
    id: 'fake',
    seen,
    async chat(messages) {
      seen.push(structuredClone(messages))
      const next = replies.shift()
      if (next === undefined) throw new Error('script exhausted')
      return next
    },
    interrupt() {},
  }
}

function recorder(approve = true) {
  const statuses: AgentStatus[] = []
  const steps: Omit<TraceStep, 'id' | 'at'>[] = []
  const hooks: RunHooks = {
    setStatus: (s) => void statuses.push(s),
    addStep: (s) => void steps.push(s),
    requestApproval: async () => approve,
  }
  return { statuses, steps, hooks }
}

const agent = newAgent({ maxSteps: 4 })

describe('runAgent', () => {
  it('calls a tool, feeds the result back, then finishes', async () => {
    const provider = scripted([
      '{"tool":"calculator","args":{"expression":"6*7"}}',
      '{"final":"42"}',
    ])
    const r = recorder()
    const out = await runAgent(
      { agent, provider, tools: [calculatorTool], userMessage: 'what is 6*7', signal: new AbortController().signal },
      r.hooks,
    )
    expect(out).toEqual({ status: 'COMPLETED', answer: '42', raw: '{"final":"42"}' })
    expect(r.statuses).toEqual(['THINKING', 'EXECUTING_TOOL', 'THINKING', 'COMPLETED'])
    expect(r.steps.map((s) => s.kind)).toEqual(['system', 'user', 'tool_call', 'tool_result', 'assistant'])
    const lastPrompt = provider.seen[1].at(-1)!
    expect(lastPrompt.content).toBe('TOOL_RESULT calculator: {"ok":true,"output":{"result":42}}')
  })

  it('rejects invalid tool args via safeParse and reports them to the model', async () => {
    const provider = scripted(['{"tool":"calculator","args":{"expr":"1"}}', '{"final":"sorry"}'])
    const r = recorder()
    await runAgent({ agent, provider, tools: [calculatorTool], userMessage: 'x', signal: new AbortController().signal }, r.hooks)
    expect(provider.seen[1].at(-1)!.content).toContain('"stage":"input"')
  })

  it('pauses for approval and respects a denial', async () => {
    let ran = false
    const risky = defineTool({
      name: 'risky',
      description: 'needs approval',
      input: z.object({}),
      output: z.object({ done: z.boolean() }),
      requiresApproval: true,
      run: async () => {
        ran = true
        return { done: true }
      },
    })
    const provider = scripted(['{"tool":"risky"}', '{"final":"ok"}'])
    const r = recorder(false)
    await runAgent({ agent, provider, tools: [risky], userMessage: 'x', signal: new AbortController().signal }, r.hooks)
    expect(ran).toBe(false)
    expect(r.statuses).toContain('AWAITING_APPROVAL')
    expect(r.steps.find((s) => s.kind === 'approval')?.content).toBe('Denied')
    expect(provider.seen[1].at(-1)!.content).toContain('denied')
  })

  it('corrects format errors, then gives up after repeated ones', async () => {
    const provider = scripted(['{bad', '{bad', '{bad'])
    const r = recorder()
    const out = await runAgent({ agent, provider, tools: [calculatorTool], userMessage: 'x', signal: new AbortController().signal }, r.hooks)
    expect(out.status).toBe('ERROR')
    expect(provider.seen[1].at(-1)!.content).toMatch(/^FORMAT_ERROR/)
  })

  it('stops at maxSteps', async () => {
    const provider = scripted(Array(4).fill('{"tool":"calculator","args":{"expression":"1"}}'))
    const r = recorder()
    const out = await runAgent({ agent, provider, tools: [calculatorTool], userMessage: 'x', signal: new AbortController().signal }, r.hooks)
    expect(out).toEqual({ status: 'ERROR', error: 'Stopped after 4 steps without a final answer.' })
  })

  it('returns ABORTED when the signal fires', async () => {
    const ctrl = new AbortController()
    const provider: ChatProvider = {
      id: 'slow',
      chat: async () => {
        ctrl.abort()
        return '{"final":"late"}'
      },
      interrupt() {},
    }
    const out = await runAgent({ agent, provider, tools: [calculatorTool], userMessage: 'x', signal: ctrl.signal }, recorder().hooks)
    expect(out).toEqual({ status: 'ABORTED' })
  })

  it('skips the JSON protocol when no tools are enabled', async () => {
    const provider = scripted(['Hello there {not json'])
    const out = await runAgent({ agent, provider, tools: [], userMessage: 'hi', signal: new AbortController().signal }, recorder().hooks)
    expect(out).toMatchObject({ status: 'COMPLETED', answer: 'Hello there {not json' })
    expect(provider.seen[0][0].content).toBe(agent.systemPrompt)
  })
})

describe('runAgent chat + streaming', () => {
  it('replays history between the system prompt and the new message', async () => {
    const provider = scripted(['{"final":"Your name is Dan."}'])
    const history = [
      { role: 'user' as const, content: 'My name is Dan.' },
      { role: 'assistant' as const, content: '{"final":"Nice to meet you, Dan."}' },
    ]
    await runAgent(
      { agent, provider, tools: [calculatorTool], userMessage: 'What is my name?', signal: new AbortController().signal, history },
      recorder().hooks,
    )
    expect(provider.seen[0].map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user'])
    expect(provider.seen[0][3].content).toBe('What is my name?')
  })

  it('streams partial text and clears it when the reply finishes', async () => {
    const partials: (string | null)[] = []
    const provider: ChatProvider = {
      id: 'streamer',
      async chat(_m, opts) {
        opts?.onText?.('{"fin')
        opts?.onText?.('{"final":"ok"}')
        return '{"final":"ok"}'
      },
      interrupt() {},
    }
    const r = recorder()
    await runAgent(
      { agent, provider, tools: [calculatorTool], userMessage: 'x', signal: new AbortController().signal },
      { ...r.hooks, onPartial: (t) => void partials.push(t) },
    )
    expect(partials).toEqual(['{"fin', '{"final":"ok"}', null])
  })
})
