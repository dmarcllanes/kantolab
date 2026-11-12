import type { ReactNode } from 'react'
import type { AgentStatus } from '../../core/agent/types'

const TONES = {
  neutral: 'bg-zinc-800 text-zinc-300',
  green: 'bg-emerald-500/15 text-emerald-300',
  amber: 'bg-amber-500/15 text-amber-300',
  blue: 'bg-sky-500/15 text-sky-300',
  red: 'bg-red-500/15 text-red-300',
  violet: 'bg-violet-500/15 text-violet-300',
}

export function Badge({ tone = 'neutral', children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[11px] ${TONES[tone]}`}>{children}</span>
}

const STATUS_TONE: Record<AgentStatus, keyof typeof TONES> = {
  IDLE: 'neutral',
  LOADING_MODEL: 'blue',
  THINKING: 'violet',
  EXECUTING_TOOL: 'blue',
  AWAITING_APPROVAL: 'amber',
  COMPLETED: 'green',
  ERROR: 'red',
}

export function StatusBadge({ status }: { status: AgentStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{status}</Badge>
}
