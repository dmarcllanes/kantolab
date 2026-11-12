// Gamified progress: XP, levels, streaks, achievements and daily quests.
// Everything is DERIVED from the data KantoLab already keeps (runs, agents,
// tools, tests) by pure functions, so there's no event tracking, nothing new
// leaves the device, and deleting your data resets progress with it.

/** What happened on one local calendar day. */
export interface DayStats {
  completed: number
  toolRuns: number
  approvals: number
  nested: number
  reruns: number
  tests: number
  perfectTests: number
}

export interface ProgressStats {
  completedRuns: number
  /** Completed runs where the model called at least one tool. */
  toolRuns: number
  approvalRuns: number
  /** Runs where an agent delegated to another agent. */
  nestedRuns: number
  reruns: number
  /** Distinct models with at least one completed run. */
  models: number
  agents: number
  customTools: number
  documents: number
  customModels: number
  testRuns: number
  perfectTests: number
  gradedTests: number
  /** Keyed by local day number (see dayNumber). */
  days: Record<number, DayStats>
}

export const emptyDay = (): DayStats => ({ completed: 0, toolRuns: 0, approvals: 0, nested: 0, reruns: 0, tests: 0, perfectTests: 0 })

export const emptyStats = (): ProgressStats => ({
  completedRuns: 0,
  toolRuns: 0,
  approvalRuns: 0,
  nestedRuns: 0,
  reruns: 0,
  models: 0,
  agents: 0,
  customTools: 0,
  documents: 0,
  customModels: 0,
  testRuns: 0,
  perfectTests: 0,
  gradedTests: 0,
  days: {},
})

/** Days since the epoch in the user's local time zone. */
export function dayNumber(ts: number): number {
  return Math.floor((ts - new Date(ts).getTimezoneOffset() * 60_000) / 86_400_000)
}

export type AchievementGroup = 'Getting started' | 'Builder' | 'Power user' | 'Dedication'

export interface Achievement {
  id: string
  title: string
  description: string
  group: AchievementGroup
  xp: number
  /** Icon key; the UI maps it to an icon. */
  icon: string
  /** Current value and goal; unlocked when value >= goal. */
  measure: (s: ProgressStats, streak: Streak) => number
  goal: number
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-run', title: 'Hello, agent', description: 'Finish your first run.', group: 'Getting started', xp: 50, icon: 'play', goal: 1, measure: (s) => s.completedRuns },
  { id: 'first-tool', title: 'Handy', description: 'Finish a run where the agent used a tool.', group: 'Getting started', xp: 50, icon: 'wrench', goal: 1, measure: (s) => s.toolRuns },
  { id: 'second-agent', title: 'Growing team', description: 'Have two or more agents.', group: 'Getting started', xp: 50, icon: 'users', goal: 2, measure: (s) => s.agents },
  { id: 'gatekeeper', title: 'Gatekeeper', description: 'Approve or deny a tool that asks first.', group: 'Getting started', xp: 50, icon: 'shield', goal: 1, measure: (s) => s.approvalRuns },
  { id: 'librarian', title: 'Librarian', description: 'Add a document for agents to search.', group: 'Getting started', xp: 50, icon: 'book', goal: 1, measure: (s) => s.documents },
  { id: 'toolmaker', title: 'Toolmaker', description: 'Write your own JavaScript tool.', group: 'Builder', xp: 100, icon: 'code', goal: 1, measure: (s) => s.customTools },
  { id: 'delegator', title: 'Delegator', description: 'Have an agent hand work to another agent.', group: 'Builder', xp: 150, icon: 'network', goal: 1, measure: (s) => s.nestedRuns },
  { id: 'time-traveller', title: 'Time traveller', description: 'Edit a step and re-run from it.', group: 'Builder', xp: 100, icon: 'rewind', goal: 1, measure: (s) => s.reruns },
  { id: 'quality', title: 'Quality control', description: 'Run a test set.', group: 'Builder', xp: 100, icon: 'flask', goal: 1, measure: (s) => s.testRuns },
  { id: 'perfect', title: 'Perfect score', description: 'Pass every case in a test set.', group: 'Power user', xp: 150, icon: 'trophy', goal: 1, measure: (s) => s.perfectTests },
  { id: 'second-opinion', title: 'Second opinion', description: 'Grade a test with the AI grader.', group: 'Power user', xp: 100, icon: 'gavel', goal: 1, measure: (s) => s.gradedTests },
  { id: 'own-brain', title: 'Bring your own brain', description: 'Add your own quantized model.', group: 'Power user', xp: 150, icon: 'cpu', goal: 1, measure: (s) => s.customModels },
  { id: 'taster', title: 'Model taster', description: 'Finish runs with 3 different models.', group: 'Power user', xp: 100, icon: 'layers', goal: 3, measure: (s) => s.models },
  { id: 'marathon', title: 'Marathon', description: 'Finish 25 runs.', group: 'Dedication', xp: 150, icon: 'zap', goal: 25, measure: (s) => s.completedRuns },
  { id: 'centurion', title: 'Centurion', description: 'Finish 100 runs.', group: 'Dedication', xp: 300, icon: 'crown', goal: 100, measure: (s) => s.completedRuns },
  { id: 'on-a-roll', title: 'On a roll', description: 'Run agents 3 days in a row.', group: 'Dedication', xp: 100, icon: 'flame', goal: 3, measure: (_, k) => k.best },
  { id: 'habit', title: 'Habit formed', description: 'Run agents 7 days in a row.', group: 'Dedication', xp: 250, icon: 'calendar', goal: 7, measure: (_, k) => k.best },
]

export interface Quest {
  id: string
  title: string
  icon: string
  goal: number
  measure: (d: DayStats) => number
}

/** Pool of daily quests; three are picked per day, the same for everyone on that day. */
export const QUEST_POOL: Quest[] = [
  { id: 'runs-3', title: 'Finish 3 runs', icon: 'play', goal: 3, measure: (d) => d.completed },
  { id: 'tool-2', title: 'Finish 2 runs that use a tool', icon: 'wrench', goal: 2, measure: (d) => d.toolRuns },
  { id: 'test-1', title: 'Run a test set', icon: 'flask', goal: 1, measure: (d) => d.tests },
  { id: 'rerun-1', title: 'Edit a step and re-run', icon: 'rewind', goal: 1, measure: (d) => d.reruns },
  { id: 'nested-1', title: 'Let an agent ask another agent', icon: 'network', goal: 1, measure: (d) => d.nested },
  { id: 'approve-1', title: 'Review a tool request', icon: 'shield', goal: 1, measure: (d) => d.approvals },
  { id: 'perfect-1', title: 'Get a perfect test score', icon: 'trophy', goal: 1, measure: (d) => d.perfectTests },
  { id: 'runs-1', title: 'Finish a run', icon: 'play', goal: 1, measure: (d) => d.completed },
]

export const QUEST_XP = 20
export const RUN_XP = 5
/** Completed runs that still earn XP (so spamming runs doesn't dominate). */
export const RUN_XP_CAP = 100

/** The day's quests: "Finish a run" always, plus two picked from the day number. */
export function questsFor(day: number): Quest[] {
  const always = QUEST_POOL.find((q) => q.id === 'runs-1')!
  const rest = QUEST_POOL.filter((q) => q !== always)
  const mod = (x: number, m: number) => ((x % m) + m) % m
  const a = mod(day, rest.length)
  // Offset 1..length-1, so the second pick never repeats the first.
  const b = mod(a + 1 + mod(day * 3, rest.length - 1), rest.length)
  return [always, rest[a], rest[b]]
}

export interface Streak {
  /** Consecutive days with a finished run, ending today (or yesterday, if today has none yet). */
  current: number
  best: number
  activeToday: boolean
}

export function streakOf(days: Record<number, DayStats>, today: number): Streak {
  const active = Object.keys(days)
    .map(Number)
    .filter((d) => days[d].completed > 0)
    .sort((x, y) => x - y)
  let best = 0
  let run = 0
  for (let i = 0; i < active.length; i++) {
    run = i > 0 && active[i] === active[i - 1] + 1 ? run + 1 : 1
    best = Math.max(best, run)
  }
  const set = new Set(active)
  const activeToday = set.has(today)
  let current = 0
  for (let d = activeToday ? today : today - 1; set.has(d); d--) current++
  return { current, best, activeToday }
}

export const LEVEL_TITLES = ['Curious', 'Tinkerer', 'Builder', 'Engineer', 'Architect', 'Orchestrator', 'Agent whisperer', 'Lab legend']

/** XP needed to reach `level` (level 1 = 0, then 100, 250, 450, 700, …). */
export function xpForLevel(level: number): number {
  const n = level - 1
  return 50 * n * n + 50 * n
}

export function levelFor(xp: number): { level: number; title: string; into: number; span: number } {
  let level = 1
  while (xpForLevel(level + 1) <= xp) level++
  const base = xpForLevel(level)
  return { level, title: LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)], into: xp - base, span: xpForLevel(level + 1) - base }
}

export interface AchievementState {
  achievement: Achievement
  value: number
  unlocked: boolean
}

export interface QuestState {
  quest: Quest
  value: number
  done: boolean
}

export interface Progress {
  xp: number
  level: ReturnType<typeof levelFor>
  streak: Streak
  achievements: AchievementState[]
  unlockedCount: number
  quests: QuestState[]
  /** Locked achievements closest to unlocking. */
  nextUp: AchievementState[]
  /** Ids of everything earned so far, for "new unlock" notifications. */
  earnedIds: string[]
}

export function computeProgress(s: ProgressStats, today: number): Progress {
  const streak = streakOf(s.days, today)
  const achievements = ACHIEVEMENTS.map((a) => {
    const value = a.measure(s, streak)
    return { achievement: a, value: Math.min(value, a.goal), unlocked: value >= a.goal }
  })
  const unlocked = achievements.filter((a) => a.unlocked)

  // Daily quests count for every past day too, so XP stays a pure function of history.
  let questXp = 0
  const earnedIds = unlocked.map((a) => a.achievement.id)
  for (const [key, d] of Object.entries(s.days)) {
    const day = Number(key)
    for (const q of questsFor(day))
      if (q.measure(d) >= q.goal) {
        questXp += QUEST_XP
        earnedIds.push(`quest:${day}:${q.id}`)
      }
  }
  const quests = questsFor(today).map((quest) => {
    const value = quest.measure(s.days[today] ?? emptyDay())
    return { quest, value: Math.min(value, quest.goal), done: value >= quest.goal }
  })

  const xp = unlocked.reduce((sum, a) => sum + a.achievement.xp, 0) + Math.min(s.completedRuns, RUN_XP_CAP) * RUN_XP + questXp
  const nextUp = achievements
    .filter((a) => !a.unlocked)
    .sort((x, y) => y.value / y.achievement.goal - x.value / x.achievement.goal || x.achievement.xp - y.achievement.xp)
    .slice(0, 3)
  return { xp, level: levelFor(xp), streak, achievements, unlockedCount: unlocked.length, quests, nextUp, earnedIds }
}
