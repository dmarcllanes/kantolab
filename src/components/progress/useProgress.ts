// UI state for the gamified layer: the on/off preference (localStorage,
// guarded), the progress panel, and the queue of "you unlocked…" toasts.
import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { create } from 'zustand'
import { computeProgress, dayNumber, type Progress } from '../../core/progress/progress'
import { collectStats } from '../../core/progress/stats'

const KEY = 'kantolab.gamify'
const SEEN = 'kantolab.progress.seen'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Blocked storage: the preference lasts for this visit only.
  }
}

/** Ids already celebrated, or null on the very first visit with gamification. */
export function readSeen(): Set<string> | null {
  const raw = read(SEEN)
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? new Set(parsed.filter((x): x is string => typeof x === 'string')) : null
  } catch {
    return null
  }
}

export function writeSeen(ids: Iterable<string>): void {
  write(SEEN, JSON.stringify([...ids]))
}

export type Toast =
  | { key: string; kind: 'achievement'; title: string; description: string; icon: string; xp: number }
  | { key: string; kind: 'quest'; title: string; icon: string; xp: number }
  | { key: string; kind: 'level'; level: number; title: string }

interface GamifyState {
  on: boolean
  panelOpen: boolean
  toasts: Toast[]
  /** Last XP gain, for the "+N XP" pop on the level chip. */
  gain: { amount: number; key: number } | null
  setOn: (on: boolean) => void
  openPanel: () => void
  closePanel: () => void
  push: (t: Toast[]) => void
  dismiss: (key: string) => void
  setGain: (amount: number) => void
}

export const useGamify = create<GamifyState>()((set) => ({
  on: read(KEY) !== 'off',
  panelOpen: false,
  toasts: [],
  gain: null,
  setOn: (on) => {
    write(KEY, on ? 'on' : 'off')
    set({ on, ...(on ? {} : { toasts: [], panelOpen: false }) })
  },
  openPanel: () => set({ panelOpen: true, toasts: [] }),
  closePanel: () => set({ panelOpen: false }),
  // Keep at most 3 on screen; the oldest go first.
  push: (t) => set((s) => ({ toasts: [...s.toasts, ...t].slice(-3) })),
  dismiss: (key) => set((s) => ({ toasts: s.toasts.filter((t) => t.key !== key) })),
  setGain: (amount) => set({ gain: { amount, key: Date.now() } }),
}))

/** Live progress, re-computed whenever runs, agents, tools or tests change. Undefined until first read. */
export function useProgress(): Progress | undefined {
  const live = useLiveQuery(async () => ({ stats: await collectStats(), today: dayNumber(Date.now()) }), [])
  return useMemo(() => live && computeProgress(live.stats, live.today), [live])
}
