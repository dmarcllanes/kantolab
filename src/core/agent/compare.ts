// Run the same message through two agents, one after the other (only one local
// model fits in GPU memory at a time), and keep both runs for side-by-side review.
import { create } from 'zustand'
import { startRun, stopRun } from './session'
import { useAgentStore } from './store'
import type { AgentConfig, RunRecord } from './types'

interface CompareState {
  message: string
  a: RunRecord | null
  b: RunRecord | null
  running: 'a' | 'b' | null
  stopRequested: boolean
  setMessage: (m: string) => void
}

export const useCompareStore = create<CompareState>()((set) => ({
  message: '',
  a: null,
  b: null,
  running: null,
  stopRequested: false,
  setMessage: (message) => set({ message }),
}))

export async function runComparison(agentA: AgentConfig, agentB: AgentConfig, message: string): Promise<void> {
  const store = useCompareStore
  const agents = useAgentStore.getState()
  if (store.getState().running || agents.batch) return
  agents.setBatch('compare')
  store.setState({ a: null, b: null, running: 'a', stopRequested: false })
  try {
    const a = await startRun(agentA, message)
    store.setState({ a: a?.record ?? null })
    if (!a || a.record.outcome === 'stopped' || store.getState().stopRequested) return
    store.setState({ running: 'b' })
    const b = await startRun(agentB, message)
    store.setState({ b: b?.record ?? null })
  } finally {
    store.setState({ running: null })
    useAgentStore.getState().setBatch(null)
  }
}

export function stopComparison(): void {
  useCompareStore.setState({ stopRequested: true })
  stopRun()
}

export interface RunSummary {
  answer: string
  totalMs: number
  modelCalls: number
  toolCalls: number
  formatErrors: number
}

export function summarize(run: RunRecord): RunSummary {
  const answer = [...run.steps].reverse().find((s) => s.kind === 'assistant')?.content ?? ''
  return {
    answer,
    totalMs: (run.endedAt ?? run.startedAt) - run.startedAt,
    modelCalls: run.steps.filter((s) => s.kind === 'assistant' || s.kind === 'tool_call' || (s.kind === 'error' && s.data !== undefined)).length,
    toolCalls: run.steps.filter((s) => s.kind === 'tool_result').length,
    formatErrors: run.steps.filter((s) => s.kind === 'error' && (s.data as { raw?: unknown } | undefined)?.raw !== undefined).length,
  }
}
