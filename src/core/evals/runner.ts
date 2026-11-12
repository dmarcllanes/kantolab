import { create } from 'zustand'
import { chatOnce, startRun, stopRun } from '../agent/session'
import { useAgentStore } from '../agent/store'
import type { AgentConfig } from '../agent/types'
import { db } from '../memory/db'
import { checkRun, finalAnswer } from './checks'
import { gradeAnswer } from './judge'
import type { EvalCaseResult, EvalResult, EvalSet } from './types'
import { snapshotAgent } from './versions'

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
  // Freeze the version being tested (read before the busy check so nothing awaits in between).
  const agentNames = new Map((await db.agents.toArray()).map((a) => [a.id, a.name]))
  const snapshot = snapshotAgent(agent, agentNames)
  const agents = useAgentStore.getState()
  if (useEvalStore.getState().setId || agents.batch || set.cases.length === 0) return null
  agents.setBatch('tests')
  useEvalStore.setState({ setId: set.id, done: 0, total: set.cases.length, results: [], stopRequested: false })
  const results: EvalCaseResult[] = []
  let grader: AgentConfig | null = null
  try {
    // Unset or deleted grader: the tested agent grades itself.
    if (set.cases.some((c) => c.check.kind === 'judge')) grader = (set.judgeAgentId && (await db.agents.get(set.judgeAgentId))) || agent
    for (const c of set.cases) {
      if (useEvalStore.getState().stopRequested) break
      const res = await startRun(agent, c.input, { approval: 'deny' })
      if (!res) break
      let verdict: Pick<EvalCaseResult, 'pass' | 'reason' | 'grader'> = checkRun(res.record, c.check)
      const judge = grader
      if (c.check.kind === 'judge' && judge && res.record.outcome === 'completed') {
        if (useEvalStore.getState().stopRequested) break
        try {
          const grade = await gradeAnswer((m) => chatOnce(judge, m), c.input, finalAnswer(res.record), c.check.value)
          verdict = { pass: grade.pass, reason: `Grader: ${grade.reason}`, grader: { agentName: judge.name, raw: grade.raw } }
        } catch (e) {
          verdict = { pass: false, reason: `Grader failed: ${e instanceof Error ? e.message : String(e)}` }
        }
      }
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
  const result: EvalResult = { agentId: agent.id, agentName: agent.name, modelId: agent.modelId, at: Date.now(), results, snapshot, ...(grader ? { graderName: grader.name } : {}) }
  const fresh = await db.evalSets.get(set.id)
  if (fresh) await db.evalSets.put({ ...fresh, history: [result, ...fresh.history].slice(0, MAX_HISTORY), updatedAt: Date.now() })
  return result
}

export function stopEvalRun(): void {
  useEvalStore.setState({ stopRequested: true })
  stopRun()
}
