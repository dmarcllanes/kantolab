// Agent versions for test runs: every result stores a snapshot of the agent's
// settings, so the history can show what changed between two pass rates.
import { agentIdFromRef, agentToolName } from '../agent/subagent'
import type { AgentConfig } from '../agent/types'
import type { AgentSnapshot, EvalResult } from './types'

/** Freeze the settings that affect answers. `agentNames` maps agent ids to names (for agent tools). */
export function snapshotAgent(agent: AgentConfig, agentNames: Map<string, string>): AgentSnapshot {
  return {
    name: agent.name,
    provider: agent.provider,
    modelId: agent.modelId,
    baseUrl: agent.baseUrl,
    systemPrompt: agent.systemPrompt,
    toolNames: [...agent.toolNames],
    toolLabels: agent.toolNames.map((n) => {
      const id = agentIdFromRef(n)
      if (!id) return n
      const name = agentNames.get(id)
      return name ? agentToolName(name) : 'deleted agent'
    }),
    maxSteps: agent.maxSteps,
    temperature: agent.temperature,
  }
}

export type SnapshotChange =
  | { field: 'model' | 'provider' | 'temperature' | 'maxSteps' | 'name'; before: string; after: string }
  | { field: 'tools'; added: string[]; removed: string[] }
  | { field: 'systemPrompt'; lines: DiffLine[] }

export interface DiffLine {
  op: 'same' | 'add' | 'del'
  text: string
}

/** Line diff via longest common subsequence. Prompts are short, so O(n·m) is fine. */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.split('\n')
  const b = after.split('\n')
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }
  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ op: 'same', text: a[i] })
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) out.push({ op: 'del', text: a[i++] })
    else out.push({ op: 'add', text: b[j++] })
  }
  while (i < a.length) out.push({ op: 'del', text: a[i++] })
  while (j < b.length) out.push({ op: 'add', text: b[j++] })
  return out
}

/** What changed from `before` to `after`, in the order a person would care about. */
export function diffSnapshots(before: AgentSnapshot, after: AgentSnapshot): SnapshotChange[] {
  const changes: SnapshotChange[] = []
  if (before.provider !== after.provider) changes.push({ field: 'provider', before: before.provider, after: after.provider })
  if (before.modelId !== after.modelId) changes.push({ field: 'model', before: before.modelId, after: after.modelId })
  if (before.systemPrompt !== after.systemPrompt) changes.push({ field: 'systemPrompt', lines: lineDiff(before.systemPrompt, after.systemPrompt) })
  const added = after.toolLabels.filter((t) => !before.toolLabels.includes(t))
  const removed = before.toolLabels.filter((t) => !after.toolLabels.includes(t))
  if (added.length || removed.length) changes.push({ field: 'tools', added, removed })
  if (before.temperature !== after.temperature) changes.push({ field: 'temperature', before: String(before.temperature), after: String(after.temperature) })
  if (before.maxSteps !== after.maxSteps) changes.push({ field: 'maxSteps', before: String(before.maxSteps), after: String(after.maxSteps) })
  if (before.name !== after.name) changes.push({ field: 'name', before: before.name, after: after.name })
  return changes
}

export const passRate = (r: EvalResult) => (r.results.length ? r.results.filter((x) => x.pass).length / r.results.length : 0)

/** Cases that flipped between two results (matched by case id). */
export function caseChanges(before: EvalResult, after: EvalResult): { fixed: string[]; broke: string[] } {
  const prev = new Map(before.results.map((r) => [r.caseId, r.pass]))
  const fixed: string[] = []
  const broke: string[] = []
  for (const r of after.results) {
    const was = prev.get(r.caseId)
    if (was === false && r.pass) fixed.push(r.caseId)
    if (was === true && !r.pass) broke.push(r.caseId)
  }
  return { fixed, broke }
}

/** The previous result for the same agent (history is newest first), to compare against. */
export function previousFor(history: EvalResult[], index: number): EvalResult | undefined {
  const current = history[index]
  return history.slice(index + 1).find((h) => h.agentId === current.agentId)
}

/** A new agent built from a snapshot, so an older version can be tried again without losing the current one. */
export function agentFromSnapshot(snap: AgentSnapshot, at: number, base: (o: Partial<AgentConfig>) => AgentConfig): AgentConfig {
  const { toolLabels: _labels, ...settings } = snap
  return base({ ...settings, name: `${snap.name} (version of ${new Date(at).toLocaleDateString()})` })
}
