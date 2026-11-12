import Dexie, { type EntityTable } from 'dexie'
import type { AgentConfig, RunRecord } from '../agent/types'
import type { EvalSet } from '../evals/types'
import type { CustomToolDef } from '../tools/custom'

/** Key/value settings, including BYOK API keys. Never leaves the browser. */
export interface SettingRecord {
  key: string
  value: unknown
}

export interface DocumentRecord {
  id: string
  title: string
  text: string
  createdAt: number
}

export const db = new Dexie('kantolab') as Dexie & {
  agents: EntityTable<AgentConfig, 'id'>
  runs: EntityTable<RunRecord, 'id'>
  settings: EntityTable<SettingRecord, 'key'>
  documents: EntityTable<DocumentRecord, 'id'>
  customTools: EntityTable<CustomToolDef, 'id'>
  evalSets: EntityTable<EvalSet, 'id'>
}

db.version(1).stores({
  agents: 'id, name, updatedAt',
  runs: 'id, agentId, startedAt',
  settings: 'key',
  documents: 'id, title, createdAt',
  customTools: 'id, &name, updatedAt',
})
db.version(2).stores({
  evalSets: 'id, name, updatedAt',
})

export async function getSetting<T>(key: string): Promise<T | undefined> {
  return (await db.settings.get(key))?.value as T | undefined
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value })
}

export async function deleteSetting(key: string): Promise<void> {
  await db.settings.delete(key)
}

/** Wipe every agent, run, document, tool and key stored by KantoLab. */
export async function deleteAllData(): Promise<void> {
  await db.delete()
}
