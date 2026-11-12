import { Sparkles, X } from 'lucide-react'
import { useEffect, useRef, type CSSProperties } from 'react'
import { ACHIEVEMENTS, LEVEL_TITLES, QUEST_POOL, QUEST_XP } from '../../core/progress/progress'
import { KeyIcon } from './icons'
import { readSeen, useGamify, useProgress, writeSeen, type Toast } from './useProgress'

const BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]))
const QUEST_BY_ID = new Map(QUEST_POOL.map((q) => [q.id, q]))
const levelTitle = (n: number) => LEVEL_TITLES[Math.min(n - 1, LEVEL_TITLES.length - 1)]

/**
 * Turns newly earned achievements, quests and levels into toasts. Ids already
 * celebrated are remembered in localStorage; on the first visit everything
 * earned so far is marked as seen silently (also while it's switched off),
 * so nobody gets a flood of toasts.
 */
export function ProgressWatcher() {
  const on = useGamify((s) => s.on)
  const push = useGamify((s) => s.push)
  const setGain = useGamify((s) => s.setGain)
  const toasts = useGamify((s) => s.toasts)
  const progress = useProgress()
  const lastXp = useRef<number | null>(null)

  useEffect(() => {
    if (!progress) return
    const levels = Array.from({ length: progress.level.level - 1 }, (_, i) => `level:${i + 2}`)
    const earned = [...progress.earnedIds, ...levels]
    const seen = readSeen()
    if (on && lastXp.current !== null && progress.xp > lastXp.current) setGain(progress.xp - lastXp.current)
    lastXp.current = progress.xp
    // First visit, or gamification is off: remember silently so turning it on later doesn't flood.
    if (!seen || !on) {
      writeSeen(new Set([...(seen ?? []), ...earned]))
      return
    }
    const fresh = earned.filter((id) => !seen.has(id))
    if (!fresh.length) return
    const out: Toast[] = []
    // Several levels at once (e.g. a big test run): celebrate only the highest.
    const topLevel = Math.max(0, ...fresh.filter((id) => id.startsWith('level:')).map((id) => Number(id.slice(6))))
    for (const id of fresh) {
      if (id.startsWith('level:')) {
        continue
      } else if (id.startsWith('quest:')) {
        const q = QUEST_BY_ID.get(id.split(':')[2])
        if (q) out.push({ key: id, kind: 'quest', title: q.title, icon: q.icon, xp: QUEST_XP })
      } else {
        const a = BY_ID.get(id)
        if (a) out.push({ key: id, kind: 'achievement', title: a.title, description: a.description, icon: a.icon, xp: a.xp })
      }
    }
    if (topLevel) out.push({ key: `level:${topLevel}`, kind: 'level', level: topLevel, title: levelTitle(topLevel) })
    // Only 3 fit on screen and the newest stay: order quests < achievements < level.
    const rank = { quest: 0, achievement: 1, level: 2 } as const
    out.sort((a, b) => rank[a.kind] - rank[b.kind])
    writeSeen(new Set([...seen, ...earned]))
    push(out)
  }, [progress, on, push, setGain])

  if (!on || !toasts.length) return null
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[70] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <ToastCard key={t.key} toast={t} />
      ))}
    </div>
  )
}

function ToastCard({ toast }: { toast: Toast }) {
  const dismiss = useGamify((s) => s.dismiss)
  const openPanel = useGamify((s) => s.openPanel)
  useEffect(() => {
    const t = setTimeout(() => dismiss(toast.key), toast.kind === 'quest' ? 4000 : 6000)
    return () => clearTimeout(t)
  }, [toast, dismiss])

  const big = toast.kind !== 'quest'
  const heading = toast.kind === 'level' ? 'Level up!' : toast.kind === 'achievement' ? 'Achievement unlocked' : 'Daily quest complete'
  const title = toast.kind === 'level' ? `Level ${toast.level} · ${toast.title}` : toast.title
  return (
    <div className="animate-toast-in pointer-events-auto relative overflow-hidden rounded-2xl bg-zinc-900 p-3 shadow-2xl ring-1 ring-zinc-800 motion-reduce:animate-none">
      {big && <Confetti />}
      <div className="absolute inset-y-0 left-0 w-1 bg-linear-to-b from-emerald-500 to-violet-500" />
      <div className="relative flex items-start gap-3 pl-1.5">
        <span className={`flex shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-emerald-500 to-violet-500 text-zinc-950 shadow ${big ? 'size-11' : 'size-8'}`}>
          {toast.kind === 'level' ? <Sparkles className="size-5" /> : <KeyIcon name={toast.icon} className={big ? 'size-5' : 'size-4'} />}
        </span>
        <button type="button" onClick={openPanel} className="min-w-0 flex-1 text-left">
          <span className="block text-[11px] font-medium tracking-wide text-emerald-300 uppercase">{heading}</span>
          <span className="block truncate font-medium text-zinc-100">{title}</span>
          {toast.kind === 'achievement' && <span className="block text-xs text-zinc-400">{toast.description}</span>}
        </button>
        {toast.kind !== 'level' && <span className="shrink-0 self-center rounded-full bg-emerald-500/12 px-2 py-0.5 font-mono text-xs text-emerald-300">+{toast.xp} XP</span>}
        <button type="button" aria-label="Dismiss" onClick={() => dismiss(toast.key)} className="shrink-0 rounded-full p-1 text-zinc-500 hover:bg-zinc-500/10 hover:text-zinc-100">
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  )
}

const PIECES = Array.from({ length: 18 }, (_, i) => {
  const angle = (i / 18) * Math.PI * 2
  const dist = 60 + ((i * 37) % 50)
  return { id: i, x: Math.cos(angle) * dist, y: Math.sin(angle) * dist * 0.6 - 20, rot: (i * 83) % 360, hue: ['emerald', 'violet', 'sky', 'amber'][i % 4], delay: (i % 5) * 25 }
})

/** A small CSS confetti burst behind the toast icon. Hidden with reduced motion. */
function Confetti() {
  return (
    <div className="pointer-events-none absolute top-8 left-9 motion-reduce:hidden" aria-hidden>
      {PIECES.map((p) => (
        <span
          key={p.id}
          className="confetti absolute block h-2 w-1 rounded-[1px]"
          style={
            {
              background: `var(--color-${p.hue}-500)`,
              '--x': `${p.x}px`,
              '--y': `${p.y}px`,
              '--r': `${p.rot}deg`,
              animationDelay: `${p.delay}ms`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  )
}
