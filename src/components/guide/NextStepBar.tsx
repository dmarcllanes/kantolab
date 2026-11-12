import { ArrowRight, CircleAlert, CircleCheck, Info } from 'lucide-react'
import { nextStep, type RunPanelState } from './nextStep'
import { useGuide } from './useGuide'

const TONE = {
  info: { icon: Info, cls: 'border-sky-500/25 bg-sky-500/[0.07] text-zinc-200', iconCls: 'text-sky-300' },
  action: { icon: ArrowRight, cls: 'border-sky-400/50 bg-sky-500/[0.12] text-zinc-100', iconCls: 'text-sky-200' },
  done: { icon: CircleCheck, cls: 'border-emerald-500/30 bg-emerald-500/[0.08] text-zinc-200', iconCls: 'text-emerald-300' },
  problem: { icon: CircleAlert, cls: 'border-amber-500/40 bg-amber-500/[0.08] text-zinc-200', iconCls: 'text-amber-300' },
} as const

/** "What to do next" in Guide mode; updates as the run moves along. */
export function NextStepBar(state: RunPanelState) {
  const on = useGuide((s) => s.on)
  if (!on) return null
  const step = nextStep(state)
  const t = TONE[step.tone]
  const Icon = t.icon
  return (
    <div role="status" aria-live="polite" className={`flex items-start gap-2 rounded-md border px-2.5 py-2 text-xs ${t.cls}`}>
      <Icon className={`mt-0.5 size-3.5 shrink-0 ${t.iconCls}`} aria-hidden />
      <p>
        {step.label && <span className="mr-1.5 font-mono text-[10px] tracking-wide text-sky-300 uppercase">{step.label}</span>}
        {step.text}
      </p>
    </div>
  )
}
