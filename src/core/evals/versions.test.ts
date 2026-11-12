import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { newAgent } from '../agent/agents'
import { agentIdFromRef, agentRef, isAgentRef } from '../agent/subagent'
import { buildTemplate, installTemplate, TEMPLATES } from '../agent/templates'
import { BUILTIN_TOOL_NAMES } from '../tools/registry'
import { db } from '../memory/db'
import type { EvalResult } from './types'
import { agentFromSnapshot, caseChanges, diffSnapshots, lineDiff, previousFor, snapshotAgent } from './versions'

const result = (agentId: string, passes: boolean[], at: number): EvalResult => ({
  agentId,
  agentName: 'A',
  modelId: 'm',
  at,
  results: passes.map((pass, i) => ({ caseId: `c${i}`, pass, reason: '', runId: '', answer: '', ms: 0, outcome: 'completed' })),
})

describe('lineDiff', () => {
  it('marks kept, removed and added lines', () => {
    expect(lineDiff('a\nb\nc', 'a\nx\nc')).toEqual([
      { op: 'same', text: 'a' },
      { op: 'del', text: 'b' },
      { op: 'add', text: 'x' },
      { op: 'same', text: 'c' },
    ])
    expect(lineDiff('', 'new')).toEqual([
      { op: 'del', text: '' },
      { op: 'add', text: 'new' },
    ])
  })
})

describe('snapshots', () => {
  it('resolves agent tools to their ask_ names and diffs the fields that changed', () => {
    const helper = newAgent({ name: 'Math whiz' })
    const names = new Map([[helper.id, helper.name]])
    const v1 = snapshotAgent(newAgent({ systemPrompt: 'Be brief.', toolNames: ['calculator'], temperature: 0.2 }), names)
    const v2 = snapshotAgent(newAgent({ systemPrompt: 'Be brief.\nUse tools.', toolNames: [agentRef(helper.id)], temperature: 0.2 }), names)
    expect(v2.toolLabels).toEqual(['ask_math_whiz'])
    const changes = diffSnapshots(v1, v2)
    expect(changes.map((c) => c.field)).toEqual(['systemPrompt', 'tools'])
    expect(changes[1]).toEqual({ field: 'tools', added: ['ask_math_whiz'], removed: ['calculator'] })
  })

  it('restores a snapshot as a separate agent', () => {
    const original = newAgent({ name: 'Bot', systemPrompt: 'old', temperature: 0.7 })
    const copy = agentFromSnapshot(snapshotAgent(original, new Map()), Date.now(), newAgent)
    expect(copy.id).not.toBe(original.id)
    expect(copy).toMatchObject({ systemPrompt: 'old', temperature: 0.7 })
    expect(copy.name).toMatch(/^Bot \(version of /)
    expect('toolLabels' in copy).toBe(false)
  })
})

describe('result comparison', () => {
  it('finds fixed and broken cases, and the previous run of the same agent', () => {
    const history = [result('a', [true, false, true], 3), result('b', [false, false, false], 2), result('a', [false, true, true], 1)]
    const prev = previousFor(history, 0)
    expect(prev?.at).toBe(1)
    expect(caseChanges(prev!, history[0])).toEqual({ fixed: ['c0'], broke: ['c1'] })
    expect(previousFor(history, 2)).toBeUndefined()
  })
})

describe('templates', () => {
  it.each(TEMPLATES.map((t) => [t.id, t] as const))('%s wires real agents, tools and prompts', (_id, t) => {
    const built = buildTemplate(t, { provider: 'webllm', modelId: 'same-model', baseUrl: '' })
    const ids = new Set(built.agents.map((a) => a.id))
    expect(ids.has(built.entryId)).toBe(true)
    for (const a of built.agents) {
      expect(a.modelId).toBe('same-model')
      expect(a.systemPrompt).not.toContain('{{')
      for (const n of a.toolNames) {
        if (isAgentRef(n)) expect(ids.has(agentIdFromRef(n)!)).toBe(true)
        else expect(BUILTIN_TOOL_NAMES.has(n)).toBe(true)
      }
    }
    for (const c of built.evalSet?.cases ?? []) expect(c.check.value).not.toContain('{{')
  })

  it('installs agents, the test set and documents once', async () => {
    const t = TEMPLATES.find((x) => x.documents)!
    await installTemplate(t, { provider: 'webllm', modelId: 'm', baseUrl: '' })
    await installTemplate(t, { provider: 'webllm', modelId: 'm', baseUrl: '' })
    expect(await db.agents.count()).toBe(t.agents.length * 2)
    expect(await db.evalSets.count()).toBe(2)
    expect(await db.documents.where('title').equals(t.documents![0].title).count()).toBe(1)
  })
})
