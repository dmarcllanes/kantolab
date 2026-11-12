// Reads the progress numbers out of IndexedDB. Read-only: progress is derived.
import { db } from '../memory/db'
import { dayNumber, emptyDay, emptyStats, type DayStats, type ProgressStats } from './progress'

export async function collectStats(): Promise<ProgressStats> {
  const s = emptyStats()
  const day = (ts: number): DayStats => (s.days[dayNumber(ts)] ??= emptyDay())
  const models = new Set<string>()

  await db.runs.each((run) => {
    const top = run.steps.filter((st) => !st.replayed)
    const usedTool = top.some((st) => st.kind === 'tool_call')
    const approved = top.some((st) => st.kind === 'approval')
    const nested = top.some((st) => (st.depth ?? 0) > 0)
    const d = day(run.startedAt)
    if (run.rerunOf) {
      s.reruns++
      d.reruns++
    }
    if (approved) {
      s.approvalRuns++
      d.approvals++
    }
    if (run.outcome !== 'completed') return
    s.completedRuns++
    d.completed++
    models.add(run.modelId)
    if (usedTool) {
      s.toolRuns++
      d.toolRuns++
    }
    if (nested) {
      s.nestedRuns++
      d.nested++
    }
  })
  s.models = models.size

  await db.evalSets.each((set) => {
    for (const r of set.history) {
      const d = day(r.at)
      s.testRuns++
      d.tests++
      if (r.results.length > 0 && r.results.every((c) => c.pass)) {
        s.perfectTests++
        d.perfectTests++
      }
      if (r.results.some((c) => c.grader)) s.gradedTests++
    }
  })

  ;[s.agents, s.customTools, s.documents, s.customModels] = await Promise.all([db.agents.count(), db.customTools.count(), db.documents.count(), db.customModels.count()])
  return s
}
