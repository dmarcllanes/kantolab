import { z } from 'zod/v3'
import type { ProviderKind } from '../engine/types'

export type AgentStatus =
  | 'IDLE'
  | 'LOADING_MODEL'
  | 'THINKING'
  | 'EXECUTING_TOOL'
  | 'AWAITING_APPROVAL'
  | 'COMPLETED'
  | 'ERROR'

/** A saved, user-assembled agent. */
export interface AgentConfig {
  id: string
  name: string
  provider: ProviderKind
  /** WebLLM model id, or the remote provider's model name. */
  modelId: string
  /** Only for openai-compatible providers. */
  baseUrl: string
  systemPrompt: string
  /** Names of enabled built-in or custom tools. */
  toolNames: string[]
  maxSteps: number
  temperature: number
  createdAt: number
  updatedAt: number
}

export const traceStepKindSchema = z.enum([
  'system',
  'user',
  'assistant',
  'tool_call',
  'tool_result',
  'approval',
  'error',
])
export type TraceStepKind = z.infer<typeof traceStepKindSchema>

/** One inspectable step of an agent run. */
export const traceStepSchema = z.object({
  id: z.string(),
  kind: traceStepKindSchema,
  at: z.number(),
  content: z.string(),
  /** Structured payload (parsed tool args, tool output, raw model reply, …). */
  data: z.unknown().optional(),
  /** Nesting level when an agent runs another agent as a tool (absent = top level). */
  depth: z.number().int().min(1).max(10).optional(),
  /** Name of the sub-agent that produced this step (only when nested). */
  agent: z.string().optional(),
  /** Copied from an earlier run when re-running from a step. */
  replayed: z.boolean().optional(),
  /** Changed by the user before re-running. */
  edited: z.boolean().optional(),
})
export type TraceStep = z.infer<typeof traceStepSchema>

export const runOutcomeSchema = z.enum(['completed', 'error', 'stopped'])
export type RunOutcomeKind = z.infer<typeof runOutcomeSchema>

/** A finished run, persisted (or bundled as a sample) for later inspection. */
export const runRecordSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  agentName: z.string(),
  modelId: z.string(),
  userMessage: z.string(),
  startedAt: z.number(),
  endedAt: z.number().optional(),
  outcome: runOutcomeSchema,
  steps: z.array(traceStepSchema),
  /** Earlier chat turns sent before userMessage (missing on older runs). */
  history: z.array(z.object({ role: z.enum(['system', 'user', 'assistant']), content: z.string() })).optional(),
  /** Set when this run was re-run from a step of another run. */
  rerunOf: z.string().optional(),
})
export type RunRecord = z.infer<typeof runRecordSchema>
