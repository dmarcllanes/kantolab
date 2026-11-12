import { Flame } from 'lucide-react'
import { LevelRing } from './LevelRing'
import { useGamify, useProgress } from './useProgress'

/** Header button: level ring, title, streak and a "+N XP" pop on gains. */
export function LevelChip() {
  const on = useGamify((s) => s.on)
  const gain = useGamify((s) => s.gain)
  const openPanel = useGamify((s) => s.openPanel)
  const p = useProgress()
  if (!on || !p) return null
  const { level, streak } = p
  return (
    <button
      type="button"
      data-tour="progress"
      onClick={openPanel}
      title={`${p.xp} XP · ${level.span - level.into} XP to level ${level.level + 1}`}
      aria-label={`Level ${level.level}, ${level.title}. Open progress`}
      className="relative flex items-center gap-2 rounded-full py-1 pr-3 pl-1 transition-colors hover:bg-zinc-500/10"
    >
      <LevelRing level={level.level} fraction={level.into / level.span} size={32} stroke={3} />
      <span className="hidden flex-col items-start leading-tight lg:flex">
        <span className="text-xs font-medium text-zinc-100">{level.title}</span>
        <span className="font-mono text-[10px] text-zinc-500">{p.xp} XP</span>
      </span>
      {streak.current > 0 && (
        <span
          className={`hidden items-center gap-0.5 font-mono text-xs sm:flex ${streak.activeToday ? 'text-amber-400' : 'text-zinc-500'}`}
          title={streak.activeToday ? `${streak.current}-day streak` : `${streak.current}-day streak — finish a run today to keep it`}
        >
          <Flame className={`size-3.5 ${streak.activeToday ? 'fill-amber-500/30' : ''}`} />
          {streak.current}
        </span>
      )}
      {gain && (
        <span key={gain.key} className="animate-xp-pop pointer-events-none absolute -top-1 left-6 font-mono text-xs font-semibold text-emerald-300 motion-reduce:hidden" aria-hidden>
          +{gain.amount} XP
        </span>
      )}
    </button>
  )
}
