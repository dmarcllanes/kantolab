import { Lightbulb } from 'lucide-react'
import type { TraceStep } from '../../core/agent/types'
import { explainStep } from './explain'
import { GUIDE_NOTES, type GuideNoteId } from './notes'
import { useGuide } from './useGuide'

/** A beginner note for a panel. Renders nothing unless Guide mode is on. */
export function GuideNote({ id, className = '' }: { id: GuideNoteId; className?: string }) {
  const on = useGuide((s) => s.on)
  if (!on) return null
  const note = GUIDE_NOTES[id]
  return (
    <aside aria-label={`Guide: ${note.title}`} className={`flex gap-2 rounded-md border border-sky-500/25 bg-sky-500/[0.07] p-2.5 text-xs ${className}`}>
      <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-sky-300" aria-hidden />
      <p className="text-zinc-300">
        <span className="font-medium text-sky-200">{note.title}. </span>
        {note.body}
      </p>
    </aside>
  )
}

/** The plain-language line under a trace step. */
export function StepGuide({ step }: { step: TraceStep }) {
  const on = useGuide((s) => s.on)
  if (!on) return null
  const { text, hint } = explainStep(step)
  return (
    <div className="mt-2 flex gap-1.5 rounded bg-sky-500/[0.07] px-2 py-1.5 text-xs text-zinc-300">
      <Lightbulb className="mt-0.5 size-3 shrink-0 text-sky-300" aria-hidden />
      <p>
        {text}
        {hint && <span className="block pt-0.5 text-sky-200">→ {hint}</span>}
      </p>
    </div>
  )
}
