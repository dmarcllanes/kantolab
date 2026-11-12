import type { RunRecord } from '../agent/types'
import type { Check, CheckKind, EvalSet } from './types'

export const CHECK_LABELS: Record<CheckKind, string> = {
  contains: 'Answer contains',
  equals: 'Answer equals',
  regex: 'Answer matches regex',
  tool_used: 'Uses tool',
}

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()

export function finalAnswer(run: RunRecord): string {
  return [...run.steps].reverse().find((s) => s.kind === 'assistant')?.content ?? ''
}

export function checkRun(run: RunRecord, check: Check): { pass: boolean; reason: string } {
  if (check.kind === 'tool_used') {
    const used = run.steps.some((s) => s.kind === 'tool_call' && (s.data as { tool?: unknown } | undefined)?.tool === check.value)
    return used ? { pass: true, reason: `Called ${check.value}` } : { pass: false, reason: `Never called ${check.value}` }
  }
  if (run.outcome !== 'completed') return { pass: false, reason: `Run ${run.outcome === 'error' ? 'failed' : 'was stopped'}` }
  const answer = finalAnswer(run)
  switch (check.kind) {
    case 'contains':
      return norm(answer).includes(norm(check.value))
        ? { pass: true, reason: `Found “${check.value}”` }
        : { pass: false, reason: `“${check.value}” not in answer` }
    case 'equals':
      return norm(answer) === norm(check.value) ? { pass: true, reason: 'Exact match' } : { pass: false, reason: 'Answer differs' }
    case 'regex': {
      let re: RegExp
      try {
        re = new RegExp(check.value, 'i')
      } catch {
        return { pass: false, reason: 'Invalid regex' }
      }
      return re.test(answer) ? { pass: true, reason: 'Regex matched' } : { pass: false, reason: 'Regex did not match' }
    }
  }
}

export function newEvalSet(name = 'New test set'): EvalSet {
  const now = Date.now()
  return { id: crypto.randomUUID(), name, cases: [], history: [], createdAt: now, updatedAt: now }
}

export function exampleEvalSet(): EvalSet {
  const set = newEvalSet('Starter checks')
  set.cases = [
    { id: crypto.randomUUID(), input: 'What is 17 * 23?', check: { kind: 'contains', value: '391' } },
    { id: crypto.randomUUID(), input: 'What is 12.5% of 2,340?', check: { kind: 'contains', value: '292.5' } },
    { id: crypto.randomUUID(), input: 'Use a tool: what is 1234 * 5678?', check: { kind: 'tool_used', value: 'calculator' } },
    { id: crypto.randomUUID(), input: 'What day of the week is it today?', check: { kind: 'tool_used', value: 'current_time' } },
  ]
  return set
}
