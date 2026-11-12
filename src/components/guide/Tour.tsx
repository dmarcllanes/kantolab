import { X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '../ui/Button'
import { useGuide } from './useGuide'

/** Tour stops; each targets an element with a matching data-tour attribute. */
const STOPS = [
  {
    target: 'agents',
    title: '1. Your agents',
    body: 'An agent is an AI model plus your instructions and tools. You can keep many; click one to work on it. Templates add ready-made teams of agents.',
  },
  {
    target: 'editor',
    title: '2. Build it here',
    body: 'Pick where the model runs and which one, then write the system prompt: plain instructions for how it should behave. The Tools tab gives it abilities like a calculator.',
  },
  {
    target: 'run-box',
    title: '3. Ask it something',
    body: 'Local models need one download first (Load model). Then type a question and press Run. You’ll see the reply appear live.',
  },
  {
    target: 'inspector',
    title: '4. See how it thought',
    body: 'Every run becomes a trace: one card per step, from your question through each tool call to the answer. Compare, Tests and History help you improve the agent over time.',
  },
  {
    target: 'guide-toggle',
    title: '5. Guide mode',
    body: 'While Guide is on, every panel and every trace step explains itself in plain words. Turn it off when you’re comfortable; the ⓘ icons still explain each setting.',
  },
] as const

const GUTTER = 16
const PAD = 6

interface Box {
  top: number
  left: number
  width: number
  height: number
}

/** A spotlight tour of the main areas. Mounted fresh each time it starts. */
export function Tour() {
  const touring = useGuide((s) => s.touring)
  return touring ? <TourSteps /> : null
}

function TourSteps() {
  const endTour = useGuide((s) => s.endTour)
  const [i, setI] = useState(0)
  const [box, setBox] = useState<Box | null>(null)
  const [card, setCard] = useState<{ top: number; left: number; width: number } | null>(null)
  const next = useRef<HTMLButtonElement>(null)
  const stop = STOPS[i]

  const measure = useCallback(() => {
    const el = document.querySelector<HTMLElement>(`[data-tour="${stop.target}"]`)
    const width = Math.min(340, window.innerWidth - GUTTER * 2)
    if (!el) {
      setBox(null)
      setCard({ top: window.innerHeight / 2 - 90, left: (window.innerWidth - width) / 2, width })
      return
    }
    const r = el.getBoundingClientRect()
    const b = {
      top: Math.max(PAD, r.top - PAD),
      left: Math.max(PAD, r.left - PAD),
      width: Math.min(r.width + PAD * 2, window.innerWidth - PAD * 2),
      height: Math.min(r.height + PAD * 2, window.innerHeight - PAD * 2),
    }
    setBox(b)
    // Card goes beside the target if there's room, else below, else above, else over it.
    const left = Math.max(GUTTER, Math.min(r.left, window.innerWidth - GUTTER - width))
    const below = b.top + b.height + 10
    const rightRoom = window.innerWidth - (b.left + b.width) - GUTTER
    if (rightRoom >= width + 10 && b.height > 160) setCard({ top: Math.max(GUTTER, Math.min(r.top, window.innerHeight - 220)), left: b.left + b.width + 10, width })
    else if (window.innerHeight - below >= 200) setCard({ top: below, left, width })
    else if (b.top >= 210) setCard({ top: b.top - 200, left, width })
    else setCard({ top: Math.max(GUTTER, window.innerHeight - 220), left, width })
  }, [stop])

  useEffect(() => {
    document.querySelector(`[data-tour="${stop.target}"]`)?.scrollIntoView({ block: 'nearest' })
    // Measure after the scroll has been applied.
    const frame = requestAnimationFrame(() => {
      measure()
      next.current?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [stop, measure])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') endTour()
      if (e.key === 'ArrowRight') setI((n) => Math.min(n + 1, STOPS.length - 1))
      if (e.key === 'ArrowLeft') setI((n) => Math.max(n - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [measure, endTour])

  if (!card) return null
  const last = i === STOPS.length - 1
  return createPortal(
    <div className="fixed inset-0 z-[60]" aria-live="polite">
      {box ? (
        <div
          className="pointer-events-none absolute rounded-lg ring-2 ring-sky-400 transition-all duration-200 motion-reduce:transition-none"
          style={{ ...box, boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.62)' }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/60" />
      )}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        className="absolute rounded-lg border border-sky-500/40 bg-zinc-900 p-4 shadow-2xl"
        style={{ top: card.top, left: card.left, width: card.width }}
      >
        <div className="flex items-start gap-2">
          <h2 id="tour-title" className="font-semibold text-sky-100">
            {stop.title}
          </h2>
          <button type="button" aria-label="Close tour" onClick={endTour} className="ml-auto rounded p-0.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100">
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-1.5 text-sm text-zinc-300">{stop.body}</p>
        <div className="mt-3 flex items-center gap-2">
          <span className="font-mono text-[11px] text-zinc-500">
            {i + 1} / {STOPS.length}
          </span>
          <div className="ml-auto flex gap-2">
            {i > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setI(i - 1)}>
                Back
              </Button>
            )}
            <Button ref={next} size="sm" variant="primary" onClick={() => (last ? endTour() : setI(i + 1))}>
              {last ? 'Finish' : 'Next'}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
