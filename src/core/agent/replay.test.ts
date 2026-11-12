import { describe, expect, it } from 'vitest'
import type { ChatMessage, ChatProvider } from '../engine/types'
import { calculatorTool } from '../tools/builtin'
import { newAgent } from './agents'
import { editKind, editText, messagesBefore, planResume } from './replay'
import { runAgent, type RunHooks } from './runner'
import type { RunRecord, TraceStep } from './types'

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

function collect(prefix: Omit<TraceStep, 'id' | 'at'>[] = []) {
  const steps: TraceStep[] = prefix.map((s, i) => ({ ...s, id: `p${i}`, at: i }))
  const hooks: RunHooks = {
    setStatus: () => {},
    addStep: (s) => void steps.push({ ...s, id: `s${steps.length}`, at: steps.length }),
    requestApproval: async () => true,
  }
  return { steps, hooks }
}

const agent = newAgent({ maxSteps: 5 })
const signal = () => new AbortController().signal

/** A finished run: calculator(6*7) → 42 → final. */
async function originalRun(): Promise<{ run: RunRecord; provider: ReturnType<typeof scripted> }> {
  const provider = scripted(['{"tool":"calculator","args":{"expression":"6*7"}}', '{"final":"42"}'])
  const c = collect()
  await runAgent({ agent, provider, tools: [calculatorTool], userMessage: 'what is 6*7', signal: signal() }, c.hooks)
  const run: RunRecord = { id: 'r1', agentId: agent.id, agentName: 'A', modelId: 'm', userMessage: 'what is 6*7', startedAt: 0, outcome: 'completed', steps: c.steps }
  return { run, provider }
}

describe('replay', () => {
  it('knows which steps can be edited and what to show', async () => {
    const { run } = await originalRun()
    expect(run.steps.map(editKind)).toEqual([null, null, 'reply', 'result', 'reply'])
    expect(editText(run.steps[2])).toBe('{"tool":"calculator","args":{"expression":"6*7"}}')
    expect(JSON.parse(editText(run.steps[3]))).toEqual({ ok: true, output: { result: 42 } })
  })

  it('rebuilds exactly the messages the model saw', async () => {
    const { run, provider } = await originalRun()
    const { messages, stepsUsed } = messagesBefore(run.steps, 4)
    // The second model call saw: system, user, then these.
    expect(messages).toEqual(provider.seen[1].slice(2))
    expect(stepsUsed).toBe(1)
  })

  it('re-runs with an edited tool result: the model sees the new result', async () => {
    const { run } = await originalRun()
    const planned = planResume(run, 3, '{"ok": true, "output": {"result": 43}}')
    if (!planned.ok) throw new Error(planned.error)
    const provider = scripted(['{"final":"43"}'])
    const c = collect(planned.plan.prefix)
    const out = await runAgent(
      { agent, provider, tools: [calculatorTool], userMessage: run.userMessage, signal: signal(), resume: planned.plan },
      c.hooks,
    )
    expect(out).toMatchObject({ status: 'COMPLETED', answer: '43' })
    expect(provider.seen).toHaveLength(1)
    expect(provider.seen[0][0].content).toBe(run.steps[0].content)
    expect(provider.seen[0].at(-1)!.content).toBe('TOOL_RESULT calculator: {"ok":true,"output":{"result":43}}')
    expect(c.steps.map((s) => `${s.kind}${s.replayed ? ':replayed' : ''}${s.edited ? ':edited' : ''}`)).toEqual([
      'system:replayed',
      'user:replayed',
      'tool_call:replayed',
      'tool_result:edited',
      'assistant',
    ])
  })

  it('re-runs with an edited model reply used in place of the model call', async () => {
    const { run } = await originalRun()
    const planned = planResume(run, 2, '{"tool":"calculator","args":{"expression":"2+2"}}')
    if (!planned.ok) throw new Error(planned.error)
    const provider = scripted(['{"final":"4"}'])
    const c = collect(planned.plan.prefix)
    await runAgent({ agent, provider, tools: [calculatorTool], userMessage: run.userMessage, signal: signal(), resume: planned.plan }, c.hooks)
    expect(c.steps[2]).toMatchObject({ kind: 'tool_call', edited: true, data: { args: { expression: '2+2' } } })
    expect(c.steps[3].data).toMatchObject({ ok: true, output: { result: 4 } })
    expect(provider.seen).toHaveLength(1)
  })

  it('rejects malformed edited results and non-editable steps', async () => {
    const { run } = await originalRun()
    expect(planResume(run, 3, '{"output": 1}').ok).toBe(false)
    expect(planResume(run, 3, 'nope').ok).toBe(false)
    expect(planResume(run, 1, 'x').ok).toBe(false)
    expect(planResume(run, 2, '   ').ok).toBe(false)
  })
})
