// The agent loop. Deliberately plain: one while-loop, every step recorded.
// It holds no global state — callers pass hooks for status, trace and approval.
import type { ChatMessage, ChatProvider } from '../engine/types'
import { invokeTool, type Tool, type ToolResult } from '../tools/types'
import { buildSystemPrompt, correctionMessage, parseReply, splitThinking, toolResultMessage } from './protocol'
import type { AgentConfig, AgentStatus, TraceStep } from './types'

export interface RunHooks {
  setStatus(status: AgentStatus): void
  addStep(step: Omit<TraceStep, 'id' | 'at'>): void
  requestApproval(call: { tool: string; args: unknown; agent?: string }): Promise<boolean>
  /** Live text of the reply being generated; null when it finishes. */
  onPartial?(text: string | null): void
}

export interface RunOptions {
  agent: AgentConfig
  provider: ChatProvider
  tools: Tool[]
  userMessage: string
  signal: AbortSignal
  /** Earlier turns of the same chat (user messages and the model's raw final replies). */
  history?: ChatMessage[]
  /** Set when this run was started by another agent's tool call. */
  nesting?: { depth: number; ancestors: string[] }
  /**
   * Continue an earlier conversation instead of starting fresh: the original
   * system prompt, the messages after the user message, and optionally a reply
   * to use in place of the first model call (an edited model reply).
   */
  resume?: { system: string; messages: ChatMessage[]; nextReply?: string; stepsUsed: number }
}

export type RunOutcome =
  | { status: 'COMPLETED'; answer: string; raw: string }
  | { status: 'ERROR'; error: string }
  | { status: 'ABORTED' }

const MAX_CONSECUTIVE_FORMAT_ERRORS = 2

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s)

export async function runAgent(opts: RunOptions, parentHooks: RunHooks): Promise<RunOutcome> {
  const { agent, provider, tools, userMessage, signal, history = [], nesting = { depth: 0, ancestors: [] } } = opts
  const { depth } = nesting
  // Nested runs tag their steps and approval requests with the sub-agent's name.
  const hooks: RunHooks =
    depth === 0
      ? parentHooks
      : {
          ...parentHooks,
          addStep: (step) => parentHooks.addStep({ ...step, depth, agent: agent.name }),
          requestApproval: (call) => parentHooks.requestApproval({ ...call, agent: agent.name }),
        }
  const toolContext = { signal, hooks: parentHooks, depth, ancestors: [...nesting.ancestors, agent.id] }
  const toolsByName = new Map(tools.map((t) => [t.name, t]))
  const { resume } = opts
  const system = resume?.system ?? buildSystemPrompt(agent.systemPrompt, tools)
  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    ...history,
    { role: 'user', content: userMessage },
    ...(resume?.messages ?? []),
  ]

  // A resumed run's caller has already copied the earlier steps into the trace.
  if (!resume) {
    hooks.addStep({
      kind: 'system',
      content: system,
      data: { tools: tools.map((t) => t.name), provider: provider.id, earlierTurns: history.length / 2 },
    })
    hooks.addStep({ kind: 'user', content: userMessage })
  }

  let forcedReply = resume?.nextReply
  let formatErrors = 0
  try {
    // An edited reply always gets its turn, even if the edit was at the last allowed step.
    const lastStep = Math.max(agent.maxSteps, (resume?.stepsUsed ?? 0) + (resume?.nextReply !== undefined ? 1 : 0))
    for (let step = (resume?.stepsUsed ?? 0) + 1; step <= lastStep; step++) {
      signal.throwIfAborted()
      hooks.setStatus('THINKING')

      const started = performance.now()
      const onPartial = hooks.onPartial
      const edited = forcedReply !== undefined
      const raw =
        forcedReply ??
        (await provider.chat(messages, {
          temperature: agent.temperature,
          ...(onPartial ? { onText: (text: string) => onPartial(text) } : {}),
        }))
      forcedReply = undefined
      onPartial?.(null)
      const ms = Math.round(performance.now() - started)
      // An edited reply is recorded like a model reply, flagged so the trace shows it.
      const mark = edited ? { edited: true } : {}
      signal.throwIfAborted()
      messages.push({ role: 'assistant', content: raw })

      if (tools.length === 0) {
        const { text, reasoning } = splitThinking(raw)
        hooks.addStep({ kind: 'assistant', content: text, data: { step, ms, ...(reasoning ? { reasoning, raw } : {}) }, ...mark })
        hooks.setStatus('COMPLETED')
        return { status: 'COMPLETED', answer: text, raw }
      }

      const reply = parseReply(raw)

      if (reply.kind === 'invalid') {
        formatErrors++
        hooks.addStep({ kind: 'error', content: reply.error, data: { step, ms, raw, reasoning: reply.reasoning }, ...mark })
        if (formatErrors > MAX_CONSECUTIVE_FORMAT_ERRORS) {
          return { status: 'ERROR', error: `Model broke the JSON protocol ${formatErrors} times in a row.` }
        }
        messages.push({ role: 'user', content: correctionMessage(reply.error) })
        continue
      }
      formatErrors = 0

      if (reply.kind === 'final') {
        hooks.addStep({ kind: 'assistant', content: reply.answer, data: { step, ms, thought: reply.thought, reasoning: reply.reasoning, raw }, ...mark })
        hooks.setStatus('COMPLETED')
        return { status: 'COMPLETED', answer: reply.answer, raw }
      }

      hooks.addStep({
        kind: 'tool_call',
        content: `${reply.tool}(${truncate(JSON.stringify(reply.args) ?? '', 200)})`,
        data: { step, ms, tool: reply.tool, args: reply.args, thought: reply.thought, reasoning: reply.reasoning, raw },
        ...mark,
      })

      const tool = toolsByName.get(reply.tool)
      let result: ToolResult
      if (!tool) {
        result = { ok: false, stage: 'input', error: `Unknown tool "${reply.tool}". Available: ${[...toolsByName.keys()].join(', ')}` }
      } else {
        let approved = true
        if (tool.requiresApproval) {
          hooks.setStatus('AWAITING_APPROVAL')
          approved = await hooks.requestApproval({ tool: tool.name, args: reply.args })
          signal.throwIfAborted()
          hooks.addStep({ kind: 'approval', content: approved ? 'Approved' : 'Denied', data: { tool: tool.name, approved } })
        }
        if (approved) {
          hooks.setStatus('EXECUTING_TOOL')
          const t0 = performance.now()
          result = await invokeTool(tool, reply.args, toolContext)
          hooks.addStep({
            kind: 'tool_result',
            content: result.ok ? `${tool.name} ✓` : `${tool.name} failed at ${result.stage}`,
            data: { ...result, ms: Math.round(performance.now() - t0) },
          })
        } else {
          result = { ok: false, stage: 'run', error: 'The user denied this tool call.' }
        }
      }
      if (!tool) hooks.addStep({ kind: 'tool_result', content: `${reply.tool} failed at input`, data: result })
      messages.push({ role: 'user', content: toolResultMessage(reply.tool, result) })
    }
    return { status: 'ERROR', error: `Stopped after ${agent.maxSteps} steps without a final answer.` }
  } catch (e) {
    hooks.onPartial?.(null)
    if (signal.aborted) return { status: 'ABORTED' }
    return { status: 'ERROR', error: e instanceof Error ? e.message : String(e) }
  }
}
