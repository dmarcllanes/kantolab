import { z } from 'zod/v3'
import { zodToJsonSchema } from 'zod-to-json-schema'

export interface Tool<I extends z.ZodTypeAny = z.ZodTypeAny, O extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string
  description: string
  input: I
  output: O
  /** Pause in AWAITING_APPROVAL before running. */
  requiresApproval?: boolean
  run: (input: z.infer<I>) => Promise<z.infer<O>>
}

/**
 * Define a tool with full type checking of `run` against its schemas, then
 * erase the generics so tools can live in one list. invokeTool() re-validates
 * at runtime, so the erasure can't let unvalidated data through.
 */
export function defineTool<I extends z.ZodTypeAny, O extends z.ZodTypeAny>(tool: Tool<I, O>): Tool {
  return tool as unknown as Tool
}

/** JSON Schema for a tool's input, for inclusion in the model prompt. */
export function toolInputSchema(tool: Tool) {
  return zodToJsonSchema(tool.input, { target: 'jsonSchema7', $refStrategy: 'none' })
}

export type ToolResult =
  | { ok: true; output: unknown }
  | { ok: false; stage: 'input' | 'run' | 'output'; error: string }

/**
 * The only sanctioned way to call a tool: validates raw model-provided args,
 * runs the tool, then validates what it returned.
 */
export async function invokeTool(tool: Tool, rawArgs: unknown): Promise<ToolResult> {
  const input = tool.input.safeParse(rawArgs)
  if (!input.success) return { ok: false, stage: 'input', error: input.error.message }

  let raw: unknown
  try {
    raw = await tool.run(input.data)
  } catch (e) {
    return { ok: false, stage: 'run', error: e instanceof Error ? e.message : String(e) }
  }

  const output = tool.output.safeParse(raw)
  if (!output.success) return { ok: false, stage: 'output', error: output.error.message }
  return { ok: true, output: output.data }
}
