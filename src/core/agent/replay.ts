// Edit a step of a finished run and continue from there. The conversation the
// model saw is rebuilt from the trace (top-level steps only), so the re-run
// sends exactly the same messages up to the edited point.
import { z } from 'zod/v3'
import type { ChatMessage } from '../engine/types'
import { correctionMessage, toolResultMessage } from './protocol'
import type { RunRecord, TraceStep } from './types'

export type EditKind = 'reply' | 'result'

const dataOf = (s: TraceStep) => (s.data ?? {}) as Record<string, unknown>

/** What can be edited at a step: the model's reply, or a tool's result. Nested steps are read-only. */
export function editKind(step: TraceStep): EditKind | null {
  if (step.depth) return null
  if (step.kind === 'tool_call') return 'reply'
  if (step.kind === 'assistant') return 'reply'
  if (step.kind === 'error' && typeof dataOf(step).raw === 'string') return 'reply'
  if (step.kind === 'tool_result') return 'result'
  return null
}

/** The text shown in the editor for a step. */
export function editText(step: TraceStep): string {
  const data = dataOf(step)
  if (editKind(step) === 'reply') return typeof data.raw === 'string' ? data.raw : step.content
  const { ms: _ms, ...result } = data
  return JSON.stringify(result, null, 2)
}

const toolResultSchema = z.union([
  z.object({ ok: z.literal(true), output: z.unknown() }),
  z.object({ ok: z.literal(false), stage: z.enum(['input', 'run', 'output']), error: z.string() }),
])

/** Validate an edited tool result: same shape the loop sends back to the model. */
export function parseEditedResult(text: string): { ok: true; result: z.infer<typeof toolResultSchema> } | { ok: false; error: string } {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch (e) {
    return { ok: false, error: `Not valid JSON: ${e instanceof Error ? e.message : String(e)}` }
  }
  const parsed = toolResultSchema.safeParse(json)
  if (!parsed.success) return { ok: false, error: 'Use {"ok": true, "output": …} or {"ok": false, "stage": "run", "error": "…"}.' }
  return { ok: true, result: parsed.data }
}

/**
 * Messages the loop added after the user message, for the top-level steps
 * before `index`, plus how many model replies they used (counts toward max steps).
 */
export function messagesBefore(steps: TraceStep[], index: number): { messages: ChatMessage[]; stepsUsed: number } {
  const messages: ChatMessage[] = []
  let stepsUsed = 0
  let lastTool = ''
  const start = steps.findIndex((s) => s.kind === 'user' && !s.depth) + 1
  for (let i = start; i < index; i++) {
    const s = steps[i]
    if (s.depth) continue
    const data = dataOf(s)
    if (s.kind === 'tool_call') {
      stepsUsed++
      lastTool = typeof data.tool === 'string' ? data.tool : ''
      messages.push({ role: 'assistant', content: String(data.raw ?? '') })
    } else if (s.kind === 'tool_result') {
      const { ms: _ms, ...result } = data
      messages.push({ role: 'user', content: toolResultMessage(lastTool, result) })
    } else if (s.kind === 'approval' && data.approved === false) {
      messages.push({ role: 'user', content: toolResultMessage(lastTool, { ok: false, stage: 'run', error: 'The user denied this tool call.' }) })
    } else if (s.kind === 'error' && typeof data.raw === 'string') {
      stepsUsed++
      messages.push({ role: 'assistant', content: data.raw }, { role: 'user', content: correctionMessage(s.content) })
    }
  }
  return { messages, stepsUsed }
}

export interface ResumePlan {
  system: string
  userMessage: string
  history: ChatMessage[]
  messages: ChatMessage[]
  nextReply?: string
  stepsUsed: number
  /** Steps to show before the new ones: copies of the earlier steps (and the edited result). */
  prefix: Omit<TraceStep, 'id' | 'at'>[]
  /** Earlier chat turns existed but weren't saved, so the re-run won't include them. */
  missingHistory: boolean
}

/** Plan a re-run of `run` from step `index` with the edited text. */
export function planResume(run: RunRecord, index: number, text: string): { ok: true; plan: ResumePlan } | { ok: false; error: string } {
  const step = run.steps[index]
  const kind = step && editKind(step)
  if (!kind) return { ok: false, error: 'This step can’t be edited.' }
  const systemStep = run.steps.find((s) => s.kind === 'system' && !s.depth)
  if (!systemStep) return { ok: false, error: 'This run has no system prompt step.' }

  const copy = ({ id: _id, at: _at, ...s }: TraceStep): Omit<TraceStep, 'id' | 'at'> => ({ ...s, replayed: true })
  const prefix = run.steps.slice(0, index).map(copy)
  const { messages, stepsUsed } = messagesBefore(run.steps, index)
  const earlierTurns = Number(dataOf(systemStep).earlierTurns ?? 0)
  const base = {
    system: systemStep.content,
    userMessage: run.userMessage,
    history: run.history ?? [],
    stepsUsed,
    missingHistory: earlierTurns > 0 && !run.history?.length,
  }

  if (kind === 'reply') {
    if (!text.trim()) return { ok: false, error: 'The reply can’t be empty.' }
    return { ok: true, plan: { ...base, messages, nextReply: text, prefix } }
  }

  const parsed = parseEditedResult(text)
  if (!parsed.ok) return parsed
  const call = [...run.steps.slice(0, index)].reverse().find((s) => s.kind === 'tool_call' && !s.depth)
  const tool = call ? String(dataOf(call).tool ?? '') : ''
  return {
    ok: true,
    plan: {
      ...base,
      messages: [...messages, { role: 'user', content: toolResultMessage(tool, parsed.result) }],
      prefix: [
        ...prefix,
        { kind: 'tool_result', content: `${tool} ${parsed.result.ok ? '✓' : `failed at ${parsed.result.stage}`} (edited)`, data: parsed.result, edited: true },
      ],
    },
  }
}
