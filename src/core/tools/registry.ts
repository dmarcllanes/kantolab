import { db } from '../memory/db'
import { BUILTIN_TOOLS } from './builtin'
import { customToolToTool } from './custom'
import type { Tool } from './types'

export const BUILTIN_TOOL_NAMES = new Set(BUILTIN_TOOLS.map((t) => t.name))

/** Resolve an agent's enabled tool names to runnable tools (missing ones are skipped). */
export async function resolveTools(names: string[]): Promise<Tool[]> {
  const custom = await db.customTools.toArray()
  const byName = new Map<string, Tool>([
    ...BUILTIN_TOOLS.map((t) => [t.name, t] as const),
    ...custom.map((d) => [d.name, customToolToTool(d)] as const),
  ])
  return names.map((n) => byName.get(n)).filter((t): t is Tool => t !== undefined)
}
