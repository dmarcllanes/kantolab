// Share an agent (and the custom tools it uses) as a file or a URL fragment.
// Everything is encoded client-side; nothing is uploaded. API keys are never included.
import { z } from 'zod/v3'
import { db } from '../memory/db'
import { TOOL_NAME_PATTERN, type CustomToolDef } from '../tools/custom'
import { BUILTIN_TOOL_NAMES } from '../tools/registry'
import { newAgent } from './agents'
import type { AgentConfig } from './types'

const sharedToolSchema = z.object({
  name: z.string().regex(TOOL_NAME_PATTERN),
  description: z.string().max(2000),
  params: z
    .array(
      z.object({
        name: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/).max(60),
        type: z.enum(['string', 'number', 'boolean']),
        description: z.string().max(500),
        required: z.boolean(),
      }),
    )
    .max(20),
  code: z.string().max(20000),
  requiresApproval: z.boolean(),
  timeoutMs: z.number().int().min(100).max(60000),
})

export const agentBundleSchema = z.object({
  kantolab: z.literal(1),
  agent: z.object({
    name: z.string().min(1).max(200),
    provider: z.enum(['webllm', 'openai-compatible', 'anthropic']),
    modelId: z.string().max(200),
    baseUrl: z.string().max(500),
    systemPrompt: z.string().max(20000),
    toolNames: z.array(z.string().max(60)).max(50),
    maxSteps: z.number().int().min(1).max(50),
    temperature: z.number().min(0).max(2),
  }),
  customTools: z.array(sharedToolSchema).max(20),
})
export type AgentBundle = z.infer<typeof agentBundleSchema>

export async function bundleAgent(agent: AgentConfig): Promise<AgentBundle> {
  const custom = await db.customTools.where('name').anyOf(agent.toolNames).toArray()
  return {
    kantolab: 1,
    agent: {
      name: agent.name,
      provider: agent.provider,
      modelId: agent.modelId,
      baseUrl: agent.baseUrl,
      systemPrompt: agent.systemPrompt,
      toolNames: agent.toolNames,
      maxSteps: agent.maxSteps,
      temperature: agent.temperature,
    },
    customTools: custom.map(({ name, description, params, code, requiresApproval, timeoutMs }) => ({
      name,
      description,
      params: params.map(({ name: n, type, description: d, required }) => ({ name: n, type, description: d, required })),
      code,
      requiresApproval,
      timeoutMs,
    })),
  }
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

async function pipe(bytes: Uint8Array, transform: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(transform)
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Compress a bundle into a URL-safe string. */
export async function encodeBundle(bundle: AgentBundle): Promise<string> {
  return toBase64Url(await pipe(new TextEncoder().encode(JSON.stringify(bundle)), new CompressionStream('deflate-raw')))
}

const MAX_ENCODED = 200_000

export async function decodeBundle(encoded: string): Promise<AgentBundle> {
  if (encoded.length > MAX_ENCODED) throw new Error('Shared agent is too large.')
  let json: unknown
  try {
    const bytes = await pipe(fromBase64Url(encoded), new DecompressionStream('deflate-raw'))
    json = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new Error('This share link is damaged or incomplete.')
  }
  return parseBundle(json)
}

export function parseBundle(json: unknown): AgentBundle {
  const parsed = agentBundleSchema.safeParse(json)
  if (!parsed.success) throw new Error('This is not a valid KantoLab agent.')
  return parsed.data
}

export function shareUrl(encoded: string, base = `${location.origin}${location.pathname}`): string {
  return `${base}#agent=${encoded}`
}

const sameTool = (a: CustomToolDef, b: AgentBundle['customTools'][number]) =>
  a.code === b.code && a.description === b.description && JSON.stringify(a.params.map(({ id: _id, ...p }) => p)) === JSON.stringify(b.params)

/** Create a new agent from a bundle. Custom tools are reused if identical, otherwise added (renamed on clash). */
export async function importBundle(bundle: AgentBundle): Promise<AgentConfig> {
  return db.transaction('rw', db.agents, db.customTools, async () => {
    const rename = new Map<string, string>()
    for (const tool of bundle.customTools) {
      const existing = await db.customTools.where('name').equals(tool.name).first()
      if (existing && sameTool(existing, tool)) continue
      let name = tool.name
      for (let n = 2; BUILTIN_TOOL_NAMES.has(name) || (await db.customTools.where('name').equals(name).count()) > 0; n++) {
        name = `${tool.name.slice(0, 36)}_${n}`
      }
      if (name !== tool.name) rename.set(tool.name, name)
      const now = Date.now()
      await db.customTools.add({
        ...tool,
        name,
        id: crypto.randomUUID(),
        params: tool.params.map((p) => Object.assign({ id: crypto.randomUUID() }, p)),
        createdAt: now,
        updatedAt: now,
      })
    }
    const agent = newAgent({ ...bundle.agent, toolNames: bundle.agent.toolNames.map((n) => rename.get(n) ?? n) })
    await db.agents.add(agent)
    return agent
  })
}
