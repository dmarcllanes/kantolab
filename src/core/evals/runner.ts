import { create } from 'zustand'
import { startRun, stopRun } from '../agent/session'
import { useAgentStore } from '../agent/store'
import type { AgentConfig } from '../agent/types'
import { db } from '../memory/db'
import { checkRun, finalAnswer } from './checks'
import type { EvalCaseResult, EvalResult, EvalSet } from './types'

interface EvalRunState {
  setId: string | null
  done: number
  total: number
  results: EvalCaseResult[]
  stopRequested: boolean
}

export const useEvalStore = create<EvalRunState>()(() => ({ setId: null, done: 0, total: 0, results: [], stopRequested: false }))

const MAX_HISTORY = 10

/** Run every case through the agent, one at a time. Tools that ask first are auto-denied. */
export async function runEvalSet(set: EvalSet, agent: AgentConfig): Promise<EvalResult | null> {
  const agents = useAgentStore.getState()
  if (useEvalStore.getState().setId || agents.batch || set.cases.length === 0) return null
  agents.setBatch('tests')
  useEvalStore.setState({ setId: set.id, done: 0, total: set.cases.length, results: [], stopRequested: false })
  const results: EvalCaseResult[] = []
  try {
    for (const c of set.cases) {
      if (useEvalStore.getState().stopRequested) break
      const res = await startRun(agent, c.input, { approval: 'deny' })
      if (!res) break
      const verdict = checkRun(res.record, c.check)
      results.push({
        caseId: c.id,
        ...verdict,
        runId: res.record.id,
        answer: finalAnswer(res.record),
        ms: (res.record.endedAt ?? res.record.startedAt) - res.record.startedAt,
        outcome: res.record.outcome,
      })
      useEvalStore.setState({ done: results.length, results: [...results] })
    }
  } finally {
    useEvalStore.setState({ setId: null })
    useAgentStore.getState().setBatch(null)
  }
  if (results.length === 0) return null
  const result: EvalResult = { agentId: agent.id, agentName: agent.name, modelId: agent.modelId, at: Date.now(), results }
  const fresh = await db.evalSets.get(set.id)
  if (fresh) await db.evalSets.put({ ...fresh, history: [result, ...fresh.history].slice(0, MAX_HISTORY), updatedAt: Date.now() })
  return result
}

export function stopEvalRun(): void {
  useEvalStore.setState({ stopRequested: true })
  stopRun()
}
