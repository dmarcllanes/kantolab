// Agents as tools: a saved agent can be enabled as a tool on another agent.
// The parent model calls `ask_<name>({ task })`; the child runs its own loop
// (same runner, same JSON protocol) and its final answer becomes the tool output.
// Child steps are written into the parent's trace with `depth` and `agent` set.
import { z } from 'zod/v3'
import type { ChatProvider } from '../engine/types'
import { defineTool, type Tool } from '../tools/types'
import { runAgent, type RunHooks } from './runner'
import type { AgentConfig } from './types'

/** Prefix for agent references stored in `AgentConfig.toolNames`. */
export const AGENT_REF_PREFIX = 'agent:'
/** How many levels of agents-calling-agents are allowed below the top-level agent. */
export const MAX_AGENT_DEPTH = 3

export const agentRef = (id: string) => `${AGENT_REF_PREFIX}${id}`
export const isAgentRef = (name: string) => name.startsWith(AGENT_REF_PREFIX)
export const agentIdFromRef = (name: string): string | null => (isAgentRef(name) ? name.slice(AGENT_REF_PREFIX.length) : null)

/** Model-facing tool name for an agent, e.g. "Research helper" → "ask_research_helper". */
export function agentToolName(agentName: string): string {
  const slug = agentName
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30)
  return `ask_${slug || 'agent'}`
}

function summarize(prompt: string, max = 240): string {
  const flat = prompt.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}

export const agentToolInput = z.object({
  task: z
    .string()
    .min(1)
    .max(4000)
    .describe('The full task or question. The other agent does not see this conversation, so include everything it needs.'),
})
export const agentToolOutput = z.object({ agent: z.string(), answer: z.string() })

export interface SubagentDeps {
  /** A ready provider for the child agent (must not change the UI state machine). */
  providerFor(agent: AgentConfig): Promise<ChatProvider>
  /** Runnable tools for the child; `ancestors` ends with the child's own id. */
  toolsFor(agent: AgentConfig, ancestors: string[]): Promise<Tool[]>
}

/** Wrap a saved agent as a tool another agent can call. */
export function agentAsTool(child: AgentConfig, deps: SubagentDeps, name = agentToolName(child.name)): Tool {
  return defineTool({
    name,
    description: `Hand a task to the "${child.name}" agent and get back its final answer. Its instructions: ${summarize(child.systemPrompt)}`,
    input: agentToolInput,
    output: agentToolOutput,
    run: async ({ task }, ctx) => {
      if (!ctx) throw new Error('Agent tools can only run inside an agent loop.')
      if (ctx.ancestors.includes(child.id)) throw new Error(`"${child.name}" is already part of this call chain; agents can't call themselves.`)
      if (ctx.depth >= MAX_AGENT_DEPTH) throw new Error(`Agents can only be nested ${MAX_AGENT_DEPTH} levels deep.`)

      const provider = await deps.providerFor(child)
      const tools = await deps.toolsFor(child, [...ctx.ancestors, child.id])
      const parent = ctx.hooks
      const hooks: RunHooks = {
        ...parent,
        // The child finishing is not the run finishing: keep the parent busy.
        setStatus: (status) => {
          if (status !== 'COMPLETED') parent.setStatus(status)
        },
      }
      try {
        const outcome = await runAgent(
          { agent: child, provider, tools, userMessage: task, signal: ctx.signal, nesting: { depth: ctx.depth + 1, ancestors: ctx.ancestors } },
          hooks,
        )
        if (outcome.status === 'ABORTED') throw new Error('Run stopped.')
        if (outcome.status === 'ERROR') throw new Error(`"${child.name}" failed: ${outcome.error}`)
        return { agent: child.name, answer: outcome.answer }
      } finally {
        parent.setStatus('EXECUTING_TOOL')
      }
    },
  })
}

export interface ResolveDeps extends SubagentDeps {
  /** Built-in and custom tools by name (agent refs are handled here). */
  resolvePlain(names: string[]): Promise<Tool[]>
  loadAgent(id: string): Promise<AgentConfig | undefined>
}

/**
 * Resolve an agent's tool list, turning `agent:<id>` refs into agent tools.
 * Refs to agents already in the call chain, to deleted agents, or past the
 * depth limit are left out, so the model never sees a tool it can't use.
 */
export async function resolveAgentTools(agent: AgentConfig, ancestors: string[], deps: ResolveDeps): Promise<Tool[]> {
  const plain = await deps.resolvePlain(agent.toolNames.filter((n) => !isAgentRef(n)))
  const depth = ancestors.length - 1
  if (depth >= MAX_AGENT_DEPTH) return plain

  const taken = new Set(plain.map((t) => t.name))
  const out = [...plain]
  for (const ref of agent.toolNames) {
    const id = agentIdFromRef(ref)
    if (!id || ancestors.includes(id)) continue
    const child = await deps.loadAgent(id)
    if (!child) continue
    const base = agentToolName(child.name)
    let name = base
    for (let n = 2; taken.has(name); n++) name = `${base}_${n}`
    taken.add(name)
    out.push(agentAsTool(child, deps, name))
  }
  return out
}
