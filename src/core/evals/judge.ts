// AI grader for test cases: another agent (or the same one) reads the question,
// the answer and a rubric, and replies with a JSON verdict. The verdict is
// zod-validated like any other model output; one malformed reply gets a retry.
import { z } from 'zod/v3'
import { extractJsonObject } from '../agent/protocol'
import type { ChatMessage } from '../engine/types'

const YES = new Set(['yes', 'true', 'pass', 'passed'])
const NO = new Set(['no', 'false', 'fail', 'failed'])

const verdictSchema = z.object({
  pass: z.union([
    z.boolean(),
    z
      .string()
      .transform((s) => s.trim().toLowerCase())
      .refine((s) => YES.has(s) || NO.has(s), 'pass must be true or false')
      .transform((s) => YES.has(s)),
  ]),
  reason: z.string().max(2000).optional(),
})

export type Verdict = { ok: true; pass: boolean; reason: string } | { ok: false; error: string }

export const GRADER_SYSTEM = `You are a strict grader for an AI assistant's answers.
You get a QUESTION, the assistant's ANSWER and a RUBRIC. Decide if the ANSWER meets every point of the RUBRIC.
Judge only against the rubric, not your own preferences. If the answer is empty, off-topic or wrong, it fails.
Reply with exactly one JSON object and nothing else: {"reason": "<one short sentence>", "pass": true or false}`

export function graderMessages(question: string, answer: string, rubric: string): ChatMessage[] {
  return [
    { role: 'system', content: GRADER_SYSTEM },
    { role: 'user', content: `QUESTION:\n${question}\n\nANSWER:\n${answer || '(empty)'}\n\nRUBRIC:\n${rubric}` },
  ]
}

export function parseVerdict(raw: string): Verdict {
  const candidate = extractJsonObject(raw)
  if (!candidate) return { ok: false, error: 'No JSON object in the grader reply.' }
  let json: unknown
  try {
    json = JSON.parse(candidate)
  } catch (e) {
    return { ok: false, error: `Grader reply is not valid JSON: ${e instanceof Error ? e.message : String(e)}` }
  }
  const parsed = verdictSchema.safeParse(json)
  if (!parsed.success) return { ok: false, error: 'Grader JSON needs "pass": true or false.' }
  return { ok: true, pass: parsed.data.pass, reason: parsed.data.reason?.trim() || (parsed.data.pass ? 'Meets the rubric' : 'Does not meet the rubric') }
}

export interface Grade {
  pass: boolean
  reason: string
  /** The grader's raw replies, for inspection. */
  raw: string[]
}

/** Ask the grader; retry once on a malformed reply, then count it as a fail. */
export async function gradeAnswer(chat: (messages: ChatMessage[]) => Promise<string>, question: string, answer: string, rubric: string): Promise<Grade> {
  const messages = graderMessages(question, answer, rubric)
  const raw: string[] = []
  for (let attempt = 0; attempt < 2; attempt++) {
    const reply = await chat(messages)
    raw.push(reply)
    const verdict = parseVerdict(reply)
    if (verdict.ok) return { pass: verdict.pass, reason: verdict.reason, raw }
    messages.push(
      { role: 'assistant', content: reply },
      { role: 'user', content: `${verdict.error} Reply again with only: {"reason": "...", "pass": true or false}` },
    )
  }
  return { pass: false, reason: 'Grader did not return a valid verdict', raw }
}
