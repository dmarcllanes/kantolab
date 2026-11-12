import { z } from 'zod/v3'
import { db } from '../memory/db'
import { runInSandbox } from './sandbox'
import type { Tool } from './types'

export type ParamType = 'string' | 'number' | 'boolean'

export interface ParamDef {
  id: string
  name: string
  type: ParamType
  description: string
  required: boolean
}

/** A user-written JS tool, stored in IndexedDB. */
export interface CustomToolDef {
  id: string
  name: string
  description: string
  params: ParamDef[]
  /** Body of `async (input) => { ... }`. Must return JSON-serialisable data. */
  code: string
  requiresApproval: boolean
  timeoutMs: number
  createdAt: number
  updatedAt: number
}

export const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]{1,39}$/

type Json = string | number | boolean | null | Json[] | { [key: string]: Json }
const jsonSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonSchema), z.record(jsonSchema)]),
)

export function paramsToZod(params: ParamDef[]) {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const p of params) {
    let s: z.ZodTypeAny = p.type === 'number' ? z.number() : p.type === 'boolean' ? z.boolean() : z.string()
    if (p.description) s = s.describe(p.description)
    if (!p.required) s = s.optional()
    shape[p.name] = s
  }
  return z.object(shape)
}

export function customToolToTool(def: CustomToolDef): Tool {
  return {
    name: def.name,
    description: def.description,
    input: paramsToZod(def.params),
    output: jsonSchema,
    requiresApproval: def.requiresApproval,
    run: (input) => runInSandbox(def.code, input, def.timeoutMs),
  }
}

export function newCustomTool(): CustomToolDef {
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    name: 'my_tool',
    description: 'Describe what this tool does so the model knows when to call it.',
    params: [{ id: crypto.randomUUID(), name: 'text', type: 'string', description: 'Input text', required: true }],
    code: '// `input` is already validated against the parameters above.\nreturn { length: input.text.length, upper: input.text.toUpperCase() }',
    requiresApproval: false,
    timeoutMs: 5000,
    createdAt: now,
    updatedAt: now,
  }
}

/** Save a custom tool; if it was renamed, update agents that referenced the old name. */
export async function saveCustomTool(def: CustomToolDef, previousName?: string): Promise<void> {
  await db.transaction('rw', db.customTools, db.agents, async () => {
    await db.customTools.put({ ...def, updatedAt: Date.now() })
    if (previousName && previousName !== def.name) {
      await db.agents
        .filter((a) => a.toolNames.includes(previousName))
        .modify((a) => {
          a.toolNames = a.toolNames.map((n) => (n === previousName ? def.name : n))
        })
    }
  })
}
