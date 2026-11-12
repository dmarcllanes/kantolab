import { DEFAULT_ANTHROPIC_MODEL } from '../engine/providers'
import type { ProviderKind } from '../engine/types'
import { db } from '../memory/db'
import { agentRef } from './subagent'
import type { AgentConfig } from './types'

export const DEFAULT_WEBLLM_MODEL = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC'

export function defaultModelFor(provider: ProviderKind): string {
  if (provider === 'webllm') return DEFAULT_WEBLLM_MODEL
  if (provider === 'anthropic') return DEFAULT_ANTHROPIC_MODEL
  return ''
}

export function newAgent(overrides: Partial<AgentConfig> = {}): AgentConfig {
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    name: 'New agent',
    provider: 'webllm',
    modelId: DEFAULT_WEBLLM_MODEL,
    baseUrl: '',
    systemPrompt: 'You are a helpful, precise assistant.',
    toolNames: [],
    maxSteps: 8,
    temperature: 0.2,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

/** Create a starter agent on first launch. Returns the id of an agent to select. */
export async function seedAgentsIfEmpty(): Promise<string> {
  return db.transaction('rw', db.agents, async () => {
    const existing = await db.agents.orderBy('updatedAt').reverse().first()
    if (existing) return existing.id
    const starter = newAgent({
      name: 'Starter agent',
      systemPrompt:
        'You are a careful assistant. Use the calculator for any arithmetic and current_time for anything about dates or times. Keep final answers short.',
      toolNames: ['calculator', 'current_time'],
    })
    await db.agents.add(starter)
    return starter.id
  })
}

export async function duplicateAgent(agent: AgentConfig): Promise<AgentConfig> {
  const now = Date.now()
  const copy = { ...agent, id: crypto.randomUUID(), name: `${agent.name} (copy)`, createdAt: now, updatedAt: now }
  await db.agents.add(copy)
  return copy
}

/** Delete an agent and remove it from every agent that used it as a tool. */
export async function deleteAgent(id: string): Promise<void> {
  const ref = agentRef(id)
  await db.transaction('rw', db.agents, async () => {
    await db.agents.delete(id)
    await db.agents
      .filter((a) => a.toolNames.includes(ref))
      .modify((a) => {
        a.toolNames = a.toolNames.filter((n) => n !== ref)
      })
  })
}
