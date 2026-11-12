import { describe, expect, it } from 'vitest'
import { z } from 'zod/v3'
import { calculatorTool } from './builtin'
import { paramsToZod } from './custom'
import { defineTool, invokeTool, toolInputSchema } from './types'

describe('invokeTool', () => {
  it('validates input, runs, validates output', async () => {
    expect(await invokeTool(calculatorTool, { expression: '2+2' })).toEqual({ ok: true, output: { result: 4 } })
    expect(await invokeTool(calculatorTool, { expression: 2 })).toMatchObject({ ok: false, stage: 'input' })
    expect(await invokeTool(calculatorTool, { expression: '1/0' })).toMatchObject({ ok: false, stage: 'run' })
  })

  it('catches tools that return the wrong shape', async () => {
    const liar = defineTool({
      name: 'liar',
      description: '',
      input: z.object({}),
      output: z.object({ n: z.number() }),
      run: async () => ({ n: 'nope' }) as unknown as { n: number },
    })
    expect(await invokeTool(liar, {})).toMatchObject({ ok: false, stage: 'output' })
  })
})

describe('schemas', () => {
  it('emits JSON Schema for tool inputs', () => {
    expect(toolInputSchema(calculatorTool)).toMatchObject({
      type: 'object',
      properties: { expression: { type: 'string' } },
      required: ['expression'],
    })
  })

  it('builds zod objects from custom tool params', () => {
    const s = paramsToZod([
      { id: '1', name: 'q', type: 'string', description: '', required: true },
      { id: '2', name: 'n', type: 'number', description: '', required: false },
    ])
    expect(s.safeParse({ q: 'x' }).success).toBe(true)
    expect(s.safeParse({ n: 1 }).success).toBe(false)
    expect(s.safeParse({ q: 'x', n: '1' }).success).toBe(false)
  })
})
