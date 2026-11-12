// The text protocol between the loop and the model. Small local models don't
// reliably support native function calling, so every model gets the same
// explicit JSON contract, and every reply is validated before it is acted on.
import { z } from 'zod/v3'
import { toolInputSchema, type Tool } from '../tools/types'

const toolCallSchema = z.object({
  thought: z.string().optional(),
  tool: z.string().min(1),
  args: z.unknown().optional(),
})
const finalSchema = z.object({
  thought: z.string().optional(),
  final: z.string(),
})

export type ParsedReply =
  | { kind: 'tool'; tool: string; args: unknown; thought?: string }
  | { kind: 'final'; answer: string; thought?: string }
  | { kind: 'invalid'; error: string }

export function buildSystemPrompt(basePrompt: string, tools: Tool[]): string {
  if (tools.length === 0) return basePrompt
  const toolDocs = tools
    .map((t) => `### ${t.name}\n${t.description}\nInput JSON Schema: ${JSON.stringify(toolInputSchema(t))}`)
    .join('\n\n')
  return `${basePrompt.trim()}

## How to respond
Reply with exactly ONE JSON object and nothing else.
- To call a tool: {"thought": "<why>", "tool": "<tool name>", "args": { ... }}
- To answer the user: {"thought": "<why>", "final": "<your answer>"}
After a tool call you will get a message starting with TOOL_RESULT. Use it, then call another tool or give the final answer.

## Tools
${toolDocs}`
}

/** Find the first balanced {...} object in text, ignoring braces inside strings. */
export function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

export function parseReply(raw: string): ParsedReply {
  const text = raw.trim()
  if (!text.includes('{')) return { kind: 'final', answer: text }

  const candidate = extractJsonObject(text)
  if (!candidate) return { kind: 'invalid', error: 'Reply contains an unterminated JSON object.' }

  let json: unknown
  try {
    json = JSON.parse(candidate)
  } catch (e) {
    return { kind: 'invalid', error: `Reply is not valid JSON: ${e instanceof Error ? e.message : String(e)}` }
  }

  const call = toolCallSchema.safeParse(json)
  if (call.success) return { kind: 'tool', tool: call.data.tool, args: call.data.args ?? {}, thought: call.data.thought }
  const final = finalSchema.safeParse(json)
  if (final.success) return { kind: 'final', answer: final.data.final, thought: final.data.thought }
  return { kind: 'invalid', error: 'JSON must have either a "tool" field or a "final" field.' }
}

export function correctionMessage(error: string): string {
  return `FORMAT_ERROR: ${error} Reply again with exactly one JSON object: {"tool": ..., "args": ...} or {"final": ...}.`
}

export function toolResultMessage(tool: string, result: unknown): string {
  return `TOOL_RESULT ${tool}: ${JSON.stringify(result)}`
}
