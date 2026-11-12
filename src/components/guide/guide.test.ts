import { describe, expect, it } from 'vitest'
import type { TraceStep } from '../../core/agent/types'
import { explainStep } from './explain'
import { nextStep, type RunPanelState } from './nextStep'

const step = (s: Partial<TraceStep> & Pick<TraceStep, 'kind'>): TraceStep => ({ id: 'x', at: 0, content: '', ...s })

describe('explainStep', () => {
  it('explains a tool call with its inputs and the model’s reasoning', () => {
    const e = explainStep(step({ kind: 'tool_call', content: 'calculator({…})', data: { tool: 'calculator', args: { expression: '6*7' }, thought: 'need exact maths' } }))
    expect(e.text).toContain('run calculator with expression = “6*7”')
    expect(e.text).toContain('Its reasoning: “need exact maths”')
  })

  it('distinguishes tool results by outcome', () => {
    expect(explainStep(step({ kind: 'tool_result', content: 'calculator ✓', data: { ok: true, output: { result: 42 }, ms: 3 } })).text).toContain('calculator ran in 3 ms and returned result = 42')
    expect(explainStep(step({ kind: 'tool_result', content: 'calculator failed at input', data: { ok: false, stage: 'input', error: 'x' } })).text).toContain('did not run')
    expect(explainStep(step({ kind: 'tool_result', content: 'fetch_url failed at run', data: { ok: false, stage: 'run', error: 'CORS blocked' } })).text).toContain('CORS blocked')
  })

  it('gives actionable hints for common errors', () => {
    expect(explainStep(step({ kind: 'error', content: 'No API key saved for this provider. Add one in Settings.' })).hint).toContain('Settings')
    expect(explainStep(step({ kind: 'error', content: 'Stopped after 8 steps without a final answer.' })).hint).toContain('Max steps')
    expect(explainStep(step({ kind: 'error', content: 'Reply is not valid JSON', data: { raw: '{oops' } })).text).toContain('JSON format')
  })

  it('mentions delegation, nesting and edits', () => {
    expect(explainStep(step({ kind: 'tool_call', content: 'ask_math(…)', data: { tool: 'ask_math', args: { task: 'x' } } })).text).toContain('another agent')
    expect(explainStep(step({ kind: 'assistant', content: '42', depth: 1, agent: 'Math' })).text).toMatch(/^Inside the “Math” sub-agent: The sub-agent’s final answer/)
    expect(explainStep(step({ kind: 'assistant', content: '42', edited: true })).text).toContain('You edited this step.')
  })
})

describe('nextStep', () => {
  const base: RunPanelState = {
    hasAgent: true, isLocal: true, needsLoad: false, noGpu: false, status: 'IDLE', hasMessage: false,
    hasSteps: false, awaitingApproval: false, viewingSaved: false, batch: false, inChat: false,
  }

  it('walks a beginner through load → ask → run → read', () => {
    expect(nextStep({ ...base, needsLoad: true })).toMatchObject({ label: 'Step 1 of 3', tone: 'action' })
    expect(nextStep(base)).toMatchObject({ label: 'Step 2 of 3' })
    expect(nextStep({ ...base, hasMessage: true })).toMatchObject({ label: 'Step 3 of 3' })
    expect(nextStep({ ...base, status: 'COMPLETED', hasSteps: true })).toMatchObject({ tone: 'done' })
  })

  it('prioritises what needs attention now', () => {
    expect(nextStep({ ...base, status: 'AWAITING_APPROVAL', needsLoad: true }).text).toContain('Approve or Deny')
    expect(nextStep({ ...base, noGpu: true }).tone).toBe('problem')
    expect(nextStep({ ...base, status: 'ERROR' }).tone).toBe('problem')
    expect(nextStep({ ...base, hasAgent: false }).text).toContain('Pick an agent')
  })
})
