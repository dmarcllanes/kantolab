import { describe, expect, it } from 'vitest'
import { ACHIEVEMENTS, computeProgress, emptyDay, emptyStats, levelFor, questsFor, QUEST_POOL, RUN_XP, RUN_XP_CAP, streakOf, xpForLevel } from './progress'

const day = (completed: number) => ({ ...emptyDay(), completed })

describe('levels', () => {
  it('starts at level 1 and climbs at the thresholds', () => {
    expect(levelFor(0)).toMatchObject({ level: 1, into: 0, span: 100 })
    expect(levelFor(99).level).toBe(1)
    expect(levelFor(100)).toMatchObject({ level: 2, into: 0, span: 200 })
    expect(levelFor(xpForLevel(5) + 3)).toMatchObject({ level: 5, into: 3 })
  })
  it('caps the title at the last one', () => {
    expect(levelFor(1e7).title).toBe('Lab legend')
  })
})

describe('streaks', () => {
  it('counts consecutive days ending today', () => {
    expect(streakOf({ 10: day(1), 11: day(2), 12: day(1) }, 12)).toEqual({ current: 3, best: 3, activeToday: true })
  })
  it('keeps yesterday’s streak alive until today ends', () => {
    expect(streakOf({ 10: day(1), 11: day(1) }, 12)).toEqual({ current: 2, best: 2, activeToday: false })
  })
  it('restarts after a gap and ignores days without finished runs', () => {
    expect(streakOf({ 1: day(1), 2: day(1), 3: day(1), 5: day(1), 6: day(0) }, 6)).toEqual({ current: 1, best: 3, activeToday: false })
  })
})

describe('daily quests', () => {
  it('picks three distinct quests, always including "Finish a run"', () => {
    for (let d = -20; d < 60; d++) {
      const q = questsFor(d)
      expect(q).toHaveLength(3)
      expect(new Set(q.map((x) => x.id)).size).toBe(3)
      expect(q[0].id).toBe('runs-1')
    }
  })
  it('rotates over the whole pool', () => {
    const seen = new Set<string>()
    for (let d = 0; d < 30; d++) questsFor(d).forEach((q) => seen.add(q.id))
    expect(seen.size).toBe(QUEST_POOL.length)
  })
})

describe('computeProgress', () => {
  it('has nothing for a fresh install', () => {
    const p = computeProgress(emptyStats(), 100)
    expect(p.xp).toBe(0)
    expect(p.unlockedCount).toBe(0)
    expect(p.nextUp).toHaveLength(3)
    expect(p.quests.every((q) => !q.done)).toBe(true)
  })

  it('adds achievement, run and quest XP', () => {
    const s = { ...emptyStats(), completedRuns: 1, agents: 1, days: { 100: day(1) } }
    const p = computeProgress(s, 100)
    // first-run (50) + 1 run (5) + "Finish a run" quest (20)
    expect(p.xp).toBe(50 + RUN_XP + 20)
    expect(p.earnedIds).toContain('first-run')
    expect(p.earnedIds).toContain('quest:100:runs-1')
    expect(p.quests[0].done).toBe(true)
  })

  it('caps run XP', () => {
    const many = computeProgress({ ...emptyStats(), completedRuns: 1000 }, 0)
    const cap = computeProgress({ ...emptyStats(), completedRuns: RUN_XP_CAP }, 0)
    expect(many.xp).toBe(cap.xp)
  })

  it('clamps progress values to the goal and ranks nearly-done achievements first', () => {
    const p = computeProgress({ ...emptyStats(), completedRuns: 20, agents: 1 }, 0)
    const marathon = p.achievements.find((a) => a.achievement.id === 'marathon')!
    expect(marathon).toMatchObject({ value: 20, unlocked: false })
    expect(p.nextUp[0].achievement.id).toBe('marathon')
    expect(p.achievements.find((a) => a.achievement.id === 'first-run')!.value).toBe(1)
  })

  it('every achievement has a unique id and a positive goal', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length)
    expect(ACHIEVEMENTS.every((a) => a.goal > 0 && a.xp > 0)).toBe(true)
  })
})
