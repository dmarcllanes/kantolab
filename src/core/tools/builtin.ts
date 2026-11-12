import { z } from 'zod/v3'
import { ensureDocumentIndex } from '../memory/documents'
import { documentIndex } from '../memory/search'
import { evaluate } from './math'
import { defineTool, type Tool } from './types'

export const calculatorTool = defineTool({
  name: 'calculator',
  description:
    'Evaluate an arithmetic expression. Supports + - * / % ^, parentheses, pi, e and sqrt, abs, round, floor, ceil, ln, log, exp, sin, cos, tan, min, max.',
  input: z.object({ expression: z.string().min(1).max(500).describe('e.g. "(12.5 * 4) / sqrt(16)"') }),
  output: z.object({ result: z.number() }),
  run: async ({ expression }) => ({ result: evaluate(expression) }),
})

export const currentTimeTool = defineTool({
  name: 'current_time',
  description: "Get the current date and time, optionally in an IANA time zone like 'Asia/Manila'.",
  input: z.object({ timeZone: z.string().max(64).optional() }),
  output: z.object({ iso: z.string(), local: z.string(), timeZone: z.string(), weekday: z.string() }),
  run: async ({ timeZone }) => {
    const now = new Date()
    const tz = timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
    return {
      iso: now.toISOString(),
      local: now.toLocaleString('en-US', { timeZone: tz, dateStyle: 'full', timeStyle: 'long' }),
      timeZone: tz,
      weekday: now.toLocaleDateString('en-US', { timeZone: tz, weekday: 'long' }),
    }
  },
})

export const searchDocumentsTool = defineTool({
  name: 'search_documents',
  description: "Keyword-search the user's uploaded documents. Returns the best matching passages.",
  input: z.object({
    query: z.string().min(1).max(300),
    limit: z.number().int().min(1).max(10).optional(),
  }),
  output: z.object({
    results: z.array(z.object({ title: z.string(), text: z.string(), score: z.number() })),
  }),
  run: async ({ query, limit }) => {
    await ensureDocumentIndex()
    return { results: documentIndex.search(query, limit ?? 4).map(({ title, text, score }) => ({ title, text, score })) }
  },
})

const MAX_FETCH_CHARS = 4000

export const fetchUrlTool = defineTool({
  name: 'fetch_url',
  description:
    'HTTP GET a public URL from the browser and return the start of the response body. Many sites block cross-origin requests (CORS). Requires user approval.',
  input: z.object({ url: z.string().url().refine((u) => /^https?:\/\//i.test(u), 'Only http(s) URLs') }),
  output: z.object({ status: z.number(), contentType: z.string(), text: z.string(), truncated: z.boolean() }),
  requiresApproval: true,
  run: async ({ url }) => {
    const res = await fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(15000) })
    const body = await res.text()
    return {
      status: res.status,
      contentType: res.headers.get('content-type') ?? '',
      text: body.slice(0, MAX_FETCH_CHARS),
      truncated: body.length > MAX_FETCH_CHARS,
    }
  },
})

export const BUILTIN_TOOLS: Tool[] = [calculatorTool, currentTimeTool, searchDocumentsTool, fetchUrlTool]
