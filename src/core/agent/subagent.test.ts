import { describe, expect, it } from 'vitest'
import type { ChatMessage, ChatProvider } from '../engine/types'
import { calculatorTool } from '../tools/builtin'
import type { Tool } from '../tools/types'
import { newAgent } from './agents'
import { runAgent, type RunHooks } from './runner'
import { canTransition } from './store'
import { agentRef, agentToolName, MAX_AGENT_DEPTH, resolveAgentTools, type ResolveDeps } from './subagent'
import type { AgentConfig, AgentStatus, TraceStep } from './types'

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
  const approvals: { tool: string; agent?: string }[] = []
  const hooks: RunHooks = {
    setStatus: (s) => void statuses.push(s),
    addStep: (s) => void steps.push(s),
    requestApproval: async (call) => {
      approvals.push({ tool: call.tool, agent: call.agent })
      return approve
    },
  }
  return { statuses, steps, approvals, hooks }
}

/** Deps backed by an in-memory agent map, with one scripted provider per agent id. */
function memoryDeps(agents: AgentConfig[], providers: Record<string, ChatProvider>, plain: Tool[] = [calculatorTool]): ResolveDeps {
  const byId = new Map(agents.map((a) => [a.id, a]))
  const deps: ResolveDeps = {
    providerFor: async (a) => providers[a.id],
    toolsFor: (a, ancestors) => resolveAgentTools(a, ancestors, deps),
    resolvePlain: async (names) => plain.filter((t) => names.includes(t.name)),
    loadAgent: async (id) => byId.get(id),
  }
  return deps
}

const signal = () => new AbortController().signal

describe('agentToolName', () => {
  it('slugs agent names into valid tool names', () => {
    expect(agentToolName('Research Helper!')).toBe('ask_research_helper')
    expect(agentToolName('Café bot')).toBe('ask_cafe_bot')
    expect(agentToolName('???')).toBe('ask_agent')
  })
})

describe('resolveAgentTools', () => {
  it('turns refs into tools, skipping self, ancestors, missing agents and name clashes', async () => {
    const a = newAgent({ name: 'Boss' })
    const b = newAgent({ name: 'Helper' })
    const c = newAgent({ name: 'Helper' })
    a.toolNames = ['calculator', agentRef(a.id), agentRef(b.id), agentRef(c.id), agentRef('gone')]
    const tools = await resolveAgentTools(a, [a.id], memoryDeps([a, b, c], {}))
    expect(tools.map((t) => t.name)).toEqual(['calculator', 'ask_helper', 'ask_helper_2'])
  })

  it('drops agent tools at the depth limit', async () => {
    const a = newAgent()
    const b = newAgent()
    a.toolNames = [agentRef(b.id)]
    const ancestors = Array.from({ length: MAX_AGENT_DEPTH + 1 }, (_, i) => `x${i}`)
    expect(await resolveAgentTools(a, ancestors, memoryDeps([a, b], {}))).toEqual([])
  })
})

describe('agent as a tool', () => {
  it('runs the child loop, nests its steps and returns its answer to the parent', async () => {
    const boss = newAgent({ name: 'Boss', maxSteps: 4 })
    const math = newAgent({ name: 'Math whiz', maxSteps: 4, toolNames: ['calculator'] })
    boss.toolNames = [agentRef(math.id)]
    const bossLlm = scripted(['{"tool":"ask_math_whiz","args":{"task":"6*7"}}', '{"final":"The answer is 42"}'])
    const mathLlm = scripted(['{"tool":"calculator","args":{"expression":"6*7"}}', '{"final":"42"}'])
    const deps = memoryDeps([boss, math], { [boss.id]: bossLlm, [math.id]: mathLlm })
    const tools = await resolveAgentTools(boss, [boss.id], deps)

    const r = recorder()
    const out = await runAgent({ agent: boss, provider: bossLlm, tools, userMessage: 'what is 6*7', signal: signal() }, r.hooks)

    expect(out).toMatchObject({ status: 'COMPLETED', answer: 'The answer is 42' })
    expect(r.steps.map((s) => `${s.depth ?? 0}:${s.kind}`)).toEqual([
      '0:system',
      '0:user',
      '0:tool_call',
      '1:system',
      '1:user',
      '1:tool_call',
      '1:tool_result',
      '1:assistant',
      '0:tool_result',
      '0:assistant',
    ])
    expect(r.steps.filter((s) => s.depth).every((s) => s.agent === 'Math whiz')).toBe(true)
    expect(mathLlm.seen[0].at(-1)).toEqual({ role: 'user', content: '6*7' })
    expect(bossLlm.seen[1].at(-1)!.content).toBe('TOOL_RESULT ask_math_whiz: {"ok":true,"output":{"agent":"Math whiz","answer":"42"}}')
    // The child never reports COMPLETED to the shared state machine, and every move is legal.
    expect(r.statuses.filter((s) => s === 'COMPLETED')).toHaveLength(1)
    let from: AgentStatus = 'IDLE'
    for (const to of r.statuses) {
      expect(canTransition(from, to), `${from} → ${to}`).toBe(true)
      from = to
    }
  })

  it('reports a failing child to the parent as a tool error', async () => {
    const boss = newAgent({ name: 'Boss', maxSteps: 4 })
    const flaky = newAgent({ name: 'Flaky', maxSteps: 1, toolNames: ['calculator'] })
    boss.toolNames = [agentRef(flaky.id)]
    const bossLlm = scripted(['{"tool":"ask_flaky","args":{"task":"go"}}', '{"final":"it failed"}'])
    const flakyLlm = scripted(['{"tool":"calculator","args":{"expression":"1"}}'])
    const deps = memoryDeps([boss, flaky], { [boss.id]: bossLlm, [flaky.id]: flakyLlm })
    const r = recorder()
    const out = await runAgent(
      { agent: boss, provider: bossLlm, tools: await resolveAgentTools(boss, [boss.id], deps), userMessage: 'x', signal: signal() },
      r.hooks,
    )
    expect(out.status).toBe('COMPLETED')
    expect(bossLlm.seen[1].at(-1)!.content).toContain('"Flaky\\" failed: Stopped after 1 steps')
  })

  it('tags approval requests from a sub-agent with its name', async () => {
    const asker: Tool = { ...calculatorTool, name: 'risky', requiresApproval: true }
    const boss = newAgent({ name: 'Boss', maxSteps: 4 })
    const child = newAgent({ name: 'Child', maxSteps: 4, toolNames: ['risky'] })
    boss.toolNames = [agentRef(child.id)]
    const bossLlm = scripted(['{"tool":"ask_child","args":{"task":"go"}}', '{"final":"done"}'])
    const childLlm = scripted(['{"tool":"risky","args":{"expression":"1"}}', '{"final":"denied"}'])
    const deps = memoryDeps([boss, child], { [boss.id]: bossLlm, [child.id]: childLlm }, [asker])
    const r = recorder(false)
    await runAgent({ agent: boss, provider: bossLlm, tools: await resolveAgentTools(boss, [boss.id], deps), userMessage: 'x', signal: signal() }, r.hooks)
    expect(r.approvals).toEqual([{ tool: 'risky', agent: 'Child' }])
  })
})
