import { describe, expect, it } from 'vitest'
import type { RunRecord } from '../agent/types'
import { checkRun } from './checks'

function run(outcome: RunRecord['outcome'], answer: string, tools: string[] = []): RunRecord {
  return {
    id: 'r', agentId: 'a', agentName: 'A', modelId: 'm', userMessage: 'q', startedAt: 0, endedAt: 10, outcome,
    steps: [
      ...tools.map((t, i) => ({ id: `t${i}`, kind: 'tool_call' as const, at: 1, content: t, data: { tool: t } })),
      ...(outcome === 'completed' ? [{ id: 'f', kind: 'assistant' as const, at: 2, content: answer }] : []),
    ],
  }
}

describe('checkRun', () => {
  it('contains / equals are case- and whitespace-insensitive', () => {
    expect(checkRun(run('completed', 'The answer is  391.'), { kind: 'contains', value: '391' }).pass).toBe(true)
    expect(checkRun(run('completed', ' Manila '), { kind: 'equals', value: 'manila' }).pass).toBe(true)
    expect(checkRun(run('completed', 'Cebu'), { kind: 'equals', value: 'manila' }).pass).toBe(false)
  })
  it('regex matches and reports invalid patterns', () => {
    expect(checkRun(run('completed', 'Total ₱658.00'), { kind: 'regex', value: '658(\\.0+)?' }).pass).toBe(true)
    expect(checkRun(run('completed', 'x'), { kind: 'regex', value: '(' })).toEqual({ pass: false, reason: 'Invalid regex' })
  })
  it('tool_used looks at tool calls even when the run failed', () => {
    expect(checkRun(run('error', '', ['calculator']), { kind: 'tool_used', value: 'calculator' }).pass).toBe(true)
    expect(checkRun(run('completed', 'x'), { kind: 'tool_used', value: 'calculator' }).pass).toBe(false)
  })
  it('answer checks fail when the run did not complete', () => {
    expect(checkRun(run('stopped', ''), { kind: 'contains', value: 'x' })).toEqual({ pass: false, reason: 'Run was stopped' })
  })
})
