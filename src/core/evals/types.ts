import type { RunOutcomeKind } from '../agent/types'

export type CheckKind = 'contains' | 'equals' | 'regex' | 'tool_used'

export interface Check {
  kind: CheckKind
  value: string
}

export interface EvalCase {
  id: string
  input: string
  check: Check
}

export interface EvalCaseResult {
  caseId: string
  pass: boolean
  reason: string
  runId: string
  answer: string
  ms: number
  outcome: RunOutcomeKind
}

export interface EvalResult {
  agentId: string
  agentName: string
  modelId: string
  at: number
  results: EvalCaseResult[]
}

/** A saved set of test questions with automatic checks. */
export interface EvalSet {
  id: string
  name: string
  cases: EvalCase[]
  /** Most recent results, newest first. */
  history: EvalResult[]
  createdAt: number
  updatedAt: number
}
