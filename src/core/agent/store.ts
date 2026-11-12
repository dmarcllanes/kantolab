import { create } from 'zustand'
import type { AgentStatus, RunRecord, TraceStep } from './types'

/** Allowed state transitions. Anything else is a bug and is rejected. */
const TRANSITIONS: Record<AgentStatus, readonly AgentStatus[]> = {
  IDLE: ['LOADING_MODEL', 'THINKING'],
  LOADING_MODEL: ['IDLE', 'ERROR'],
  THINKING: ['EXECUTING_TOOL', 'AWAITING_APPROVAL', 'COMPLETED', 'ERROR', 'IDLE'],
  EXECUTING_TOOL: ['THINKING', 'ERROR', 'IDLE'],
  AWAITING_APPROVAL: ['EXECUTING_TOOL', 'THINKING', 'ERROR', 'IDLE'],
  COMPLETED: ['IDLE', 'THINKING', 'LOADING_MODEL'],
  ERROR: ['IDLE', 'LOADING_MODEL', 'THINKING'],
}

export function canTransition(from: AgentStatus, to: AgentStatus): boolean {
  return from === to || TRANSITIONS[from].includes(to)
}

export const BUSY_STATES: readonly AgentStatus[] = ['LOADING_MODEL', 'THINKING', 'EXECUTING_TOOL', 'AWAITING_APPROVAL']

export function isBusy(status: AgentStatus): boolean {
  return BUSY_STATES.includes(status)
}

export interface ChatTurn {
  id: string
  user: string
  answer: string
  /** The model's raw final reply, replayed as history so it keeps the JSON format. */
  raw: string
}

export interface LiveStream {
  text: string
  chunks: number
  startedAt: number
  updatedAt: number
}

export interface PendingApproval {
  tool: string
  args: unknown
  /** Set when a sub-agent (called as a tool) is asking. */
  agent?: string
}

interface AgentState {
  status: AgentStatus
  error: string | null
  /** 0–1 while LOADING_MODEL. */
  loadProgress: number
  loadMessage: string
  loadedModelId: string | null
  trace: TraceStep[]
  pendingApproval: PendingApproval | null
  selectedAgentId: string | null
  /** A saved/sample run shown in the inspector instead of the live trace. */
  viewedRun: RunRecord | null
  /** The most recent live run, once saved. */
  lastRun: RunRecord | null
  /** The reply currently being generated, token by token. */
  stream: LiveStream | null
  /** Follow-up chat with the selected agent. */
  chat: ChatTurn[]
  chatAgentId: string | null
  /** A multi-run job (compare / tests) is in progress. */
  batch: 'compare' | 'tests' | null

  transition: (next: AgentStatus) => void
  fail: (error: string) => void
  setLoadProgress: (progress: number, message: string) => void
  setLoadedModel: (modelId: string | null) => void
  appendStep: (step: Omit<TraceStep, 'id' | 'at'>) => void
  resetRun: () => void
  setPendingApproval: (pending: PendingApproval | null) => void
  selectAgent: (id: string | null) => void
  viewRun: (run: RunRecord | null) => void
  setLastRun: (run: RunRecord | null) => void
  setStream: (text: string | null) => void
  pushChatTurn: (agentId: string, turn: Omit<ChatTurn, 'id'>) => void
  resetChat: () => void
  setBatch: (batch: 'compare' | 'tests' | null) => void
}

export const useAgentStore = create<AgentState>()((set, get) => ({
  status: 'IDLE',
  error: null,
  loadProgress: 0,
  loadMessage: '',
  loadedModelId: null,
  trace: [],
  pendingApproval: null,
  selectedAgentId: null,
  viewedRun: null,
  lastRun: null,
  stream: null,
  chat: [],
  chatAgentId: null,
  batch: null,

  transition: (next) => {
    const from = get().status
    if (from === next) return
    if (!canTransition(from, next)) throw new Error(`Illegal agent transition ${from} → ${next}`)
    set({ status: next, ...(next === 'ERROR' ? {} : { error: null }) })
  },

  fail: (error) => {
    set({ status: 'ERROR', error, pendingApproval: null, stream: null })
    get().appendStep({ kind: 'error', content: error })
  },

  setLoadProgress: (loadProgress, loadMessage) => set({ loadProgress, loadMessage }),
  setLoadedModel: (loadedModelId) => set({ loadedModelId }),

  appendStep: (step) =>
    set((s) => ({ trace: [...s.trace, { ...step, id: crypto.randomUUID(), at: Date.now() }] })),

  resetRun: () => set({ trace: [], error: null, lastRun: null }),
  setPendingApproval: (pendingApproval) => set({ pendingApproval }),
  selectAgent: (selectedAgentId) => set({ selectedAgentId }),
  viewRun: (viewedRun) => set({ viewedRun }),
  setLastRun: (lastRun) => set({ lastRun }),
  setStream: (text) =>
    set((s) => ({
      stream:
        text === null
          ? null
          : s.stream
            ? { ...s.stream, text, chunks: s.stream.chunks + 1, updatedAt: performance.now() }
            : { text, chunks: 1, startedAt: performance.now(), updatedAt: performance.now() },
    })),
  pushChatTurn: (agentId, turn) =>
    set((s) => {
      const t = { ...turn, id: crypto.randomUUID() }
      return { chatAgentId: agentId, chat: s.chatAgentId === agentId ? [...s.chat, t] : [t] }
    }),
  resetChat: () => set({ chat: [], chatAgentId: null }),
  setBatch: (batch) => set({ batch }),
}))
