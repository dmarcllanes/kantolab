import { CheckCircle2, Circle, Flame, Lock, Target, Trophy } from 'lucide-react'
import { RUN_XP, RUN_XP_CAP, QUEST_XP, type AchievementGroup, type AchievementState } from '../../core/progress/progress'
import { Modal } from '../ui/Modal'
import { KeyIcon } from './icons'
import { LevelRing, XpBar } from './LevelRing'
import { useGamify, useProgress } from './useProgress'

const GROUPS: AchievementGroup[] = ['Getting started', 'Builder', 'Power user', 'Dedication']

function Stat({ label, value, accent = 'text-zinc-100' }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="rounded-xl bg-zinc-950/60 px-3 py-2 ring-1 ring-zinc-800">
      <div className={`text-lg font-semibold ${accent}`}>{value}</div>
      <div className="text-[11px] text-zinc-500">{label}</div>
    </div>
  )
}

function AchievementTile({ a }: { a: AchievementState }) {
  const { goal } = a.achievement
  return (
    <li
      className={`group relative flex gap-3 rounded-xl p-3 ring-1 transition-[transform,box-shadow] duration-200 ${
        a.unlocked ? 'bg-emerald-500/8 ring-emerald-500/25 hover:-translate-y-0.5 hover:shadow-lg' : 'bg-zinc-950/40 ring-zinc-800'
      }`}
    >
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
          a.unlocked ? 'bg-linear-to-br from-emerald-500 to-violet-500 text-zinc-950 shadow' : 'bg-zinc-800 text-zinc-500'
        }`}
      >
        {a.unlocked ? <KeyIcon name={a.achievement.icon} className="size-5" /> : <Lock className="size-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={`truncate text-sm font-medium ${a.unlocked ? 'text-zinc-100' : 'text-zinc-300'}`}>{a.achievement.title}</span>
          <span className={`ml-auto shrink-0 font-mono text-[11px] ${a.unlocked ? 'text-emerald-300' : 'text-zinc-500'}`}>+{a.achievement.xp}</span>
        </div>
        <p className="text-xs text-zinc-500">{a.achievement.description}</p>
        {!a.unlocked && goal > 1 && (
          <div className="mt-1.5 flex items-center gap-2">
            <XpBar fraction={a.value / goal} className="h-1.5 flex-1" />
            <span className="font-mono text-[10px] text-zinc-500">
              {a.value}/{goal}
            </span>
          </div>
        )}
      </div>
    </li>
  )
}

/** The progress screen: level, streak, today's quests, next goals and all achievements. */
export function ProgressModal() {
  const open = useGamify((s) => s.panelOpen)
  const close = useGamify((s) => s.closePanel)
  const p = useProgress()
  if (!open || !p) return null
  const { level, streak } = p
  const questsDone = p.quests.filter((q) => q.done).length

  return (
    <Modal title="Your progress" onClose={close} wide>
      <div className="space-y-5">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-2xl bg-linear-to-br from-emerald-500/15 via-zinc-900 to-violet-500/15 p-4 ring-1 ring-zinc-800">
          <div className="flex flex-wrap items-center gap-4">
            <LevelRing level={level.level} fraction={level.into / level.span} size={72} stroke={6} />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium tracking-wide text-emerald-300 uppercase">Level {level.level}</div>
              <div className="text-2xl font-semibold text-zinc-100">{level.title}</div>
              <XpBar fraction={level.into / level.span} className="mt-2" />
              <div className="mt-1 font-mono text-[11px] text-zinc-500">
                {level.into} / {level.span} XP · {level.span - level.into} to level {level.level + 1}
              </div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Total XP" value={p.xp.toLocaleString()} accent="text-emerald-300" />
            <Stat
              label={streak.activeToday || !streak.current ? 'Day streak' : 'Day streak · run today!'}
              value={streak.current}
              accent={streak.activeToday ? 'text-amber-400' : 'text-zinc-100'}
            />
            <Stat label="Best streak" value={streak.best} />
            <Stat label="Achievements" value={`${p.unlockedCount}/${p.achievements.length}`} accent="text-violet-300" />
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Daily quests */}
          <section className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-medium text-zinc-100">
              <Flame className="size-4 text-amber-400" /> Today’s quests
              <span className="ml-auto font-mono text-[11px] text-zinc-500">
                {questsDone}/{p.quests.length} · +{QUEST_XP} XP each
              </span>
            </h3>
            <ul className="space-y-1.5">
              {p.quests.map(({ quest, value, done }) => {
                return (
                  <li key={quest.id} className={`flex items-center gap-3 rounded-xl px-3 py-2 ring-1 ${done ? 'bg-amber-500/8 ring-amber-500/25' : 'bg-zinc-950/40 ring-zinc-800'}`}>
                    {done ? <CheckCircle2 className="size-5 shrink-0 text-amber-400" /> : <Circle className="size-5 shrink-0 text-zinc-600" />}
                    <KeyIcon name={quest.icon} className="size-4 shrink-0 text-zinc-500" />
                    <span className={`flex-1 text-sm ${done ? 'text-zinc-400 line-through' : 'text-zinc-200'}`}>{quest.title}</span>
                    {quest.goal > 1 && (
                      <span className="font-mono text-[11px] text-zinc-500">
                        {value}/{quest.goal}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
            <p className="text-[11px] text-zinc-500">New quests every day. Finish at least one run a day to grow your streak.</p>
          </section>

          {/* Next up */}
          <section className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-medium text-zinc-100">
              <Target className="size-4 text-sky-400" /> Next up
            </h3>
            {p.nextUp.length ? (
              <ul className="space-y-1.5">
                {p.nextUp.map((a) => (
                  <AchievementTile key={a.achievement.id} a={a} />
                ))}
              </ul>
            ) : (
              <p className="rounded-2xl bg-emerald-500/8 p-3 text-sm text-emerald-200">Every achievement unlocked. You’re a lab legend!</p>
            )}
          </section>
        </div>

        {/* All achievements */}
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-medium text-zinc-100">
            <Trophy className="size-4 text-violet-400" /> Achievements
          </h3>
          {GROUPS.map((g) => (
            <div key={g}>
              <div className="mb-1.5 text-[11px] font-medium tracking-wide text-zinc-500 uppercase">{g}</div>
              <ul className="grid gap-2 sm:grid-cols-2">
                {p.achievements
                  .filter((a) => a.achievement.group === g)
                  .map((a) => (
                    <AchievementTile key={a.achievement.id} a={a} />
                  ))}
              </ul>
            </div>
          ))}
        </section>

        <p className="border-t border-zinc-800 pt-3 text-[11px] text-zinc-500">
          XP comes from achievements, daily quests and finished runs (+{RUN_XP} each, up to {RUN_XP_CAP} runs). It’s worked out from the runs, agents and tests already saved in this
          browser, so nothing is tracked or sent anywhere. Turn it off in Settings.
        </p>
      </div>
    </Modal>
  )
}
