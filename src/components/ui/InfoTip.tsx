import { Info } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { TIPS, type TipId } from '../tips/tips'
import { TipVisual } from '../tips/TipVisual'

const GUTTER = 16

/** A small ⓘ button that opens a plain-language explanation. Tap/click to toggle; Esc closes. */
export function InfoTip({ id }: { id: TipId }) {
  const tip = TIPS[id]
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const popId = useId()

  useLayoutEffect(() => {
    if (!open || !btn.current) return
    const r = btn.current.getBoundingClientRect()
    const width = Math.min('visual' in tip ? 360 : 300, window.innerWidth - GUTTER * 2)
    const left = Math.max(GUTTER, Math.min(r.left + r.width / 2 - width / 2, window.innerWidth - GUTTER - width))
    const spaceBelow = window.innerHeight - r.bottom - GUTTER
    const spaceAbove = r.top - GUTTER
    if (spaceBelow >= 260 || spaceBelow >= spaceAbove) setPos({ left, width, top: r.bottom + 6, maxHeight: spaceBelow - 6 })
    else setPos({ left, width, bottom: window.innerHeight - r.top + 6, maxHeight: spaceAbove - 6 })
  }, [open, tip])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!pop.current?.contains(t) && !btn.current?.contains(t)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
        btn.current?.focus()
      }
    }
    const onResize = () => setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={`About ${tip.title}`}
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full transition-colors ${
          open ? 'bg-emerald-500/20 text-emerald-300' : 'text-zinc-500 hover:bg-zinc-800 hover:text-emerald-300'
        }`}
      >
        <Info className="size-3.5" />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={pop}
            id={popId}
            role="dialog"
            aria-label={tip.title}
            style={{ position: 'fixed', left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}
            className="z-[60] space-y-2 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-xs leading-relaxed text-zinc-300 shadow-2xl shadow-black/60 motion-safe:animate-step-in"
          >
            <p className="text-sm font-semibold text-zinc-100">{tip.title}</p>
            {tip.body.map((p) => (
              <p key={p}>{p}</p>
            ))}
            {'visual' in tip && tip.visual && (
              <div className="rounded-md border border-zinc-800 bg-zinc-950/60 p-2.5">
                <TipVisual kind={tip.visual} />
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}
