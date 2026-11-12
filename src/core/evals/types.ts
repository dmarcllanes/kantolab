import type { AgentConfig, RunOutcomeKind } from '../agent/types'

export type CheckKind = 'contains' | 'equals' | 'regex' | 'tool_used' | 'judge'

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
  /** For AI-graded cases: who graded and what it replied. */
  grader?: { agentName: string; raw: string[] }
}

/** The agent's settings at the time of a test run. */
export type AgentSnapshot = Pick<AgentConfig, 'name' | 'provider' | 'modelId' | 'baseUrl' | 'systemPrompt' | 'toolNames' | 'maxSteps' | 'temperature'> & {
  /** Display names of the tools, with agent refs resolved to their ask_ tool names. */
  toolLabels: string[]
}

export interface EvalResult {
  agentId: string
  agentName: string
  modelId: string
  at: number
  results: EvalCaseResult[]
  /** Name of the grader agent, if any case was AI-graded. */
  graderName?: string
  /** Missing on results saved before versions were recorded. */
  snapshot?: AgentSnapshot
}

/** A saved set of test questions with automatic checks. */
export interface EvalSet {
  id: string
  name: string
  cases: EvalCase[]
  /** Agent that grades "AI grader" cases; unset = the agent being tested grades itself. */
  judgeAgentId?: string
  /** Most recent results, newest first. */
  history: EvalResult[]
  createdAt: number
  updatedAt: number
}
