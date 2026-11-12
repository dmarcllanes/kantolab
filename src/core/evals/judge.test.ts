import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '../engine/types'
import { gradeAnswer, graderMessages, parseVerdict } from './judge'

describe('parseVerdict', () => {
  it('accepts booleans and yes/no words, inside surrounding text', () => {
    expect(parseVerdict('{"reason":"ok","pass":true}')).toEqual({ ok: true, pass: true, reason: 'ok' })
    expect(parseVerdict('Sure! {"pass": "No", "reason": "too long"} done')).toEqual({ ok: true, pass: false, reason: 'too long' })
    expect(parseVerdict('{"pass": false}')).toMatchObject({ ok: true, pass: false })
  })

  it('rejects replies without a usable verdict', () => {
    expect(parseVerdict('looks good to me').ok).toBe(false)
    expect(parseVerdict('{"pass": "maybe"}').ok).toBe(false)
    expect(parseVerdict('{"score": 5}').ok).toBe(false)
  })
})

describe('gradeAnswer', () => {
  it('puts question, answer and rubric in the prompt', () => {
    const m = graderMessages('Q?', '', 'be short')
    expect(m[1].content).toContain('QUESTION:\nQ?')
    expect(m[1].content).toContain('(empty)')
    expect(m[1].content).toContain('RUBRIC:\nbe short')
  })

  it('retries once after a malformed reply', async () => {
    const replies = ['I think it passes', '{"pass":true,"reason":"fine"}']
    const seen: ChatMessage[][] = []
    const grade = await gradeAnswer(async (m) => (seen.push(structuredClone(m)), replies.shift()!), 'q', 'a', 'r')
    expect(grade).toEqual({ pass: true, reason: 'fine', raw: ['I think it passes', '{"pass":true,"reason":"fine"}'] })
    expect(seen[1].at(-1)!.content).toContain('No JSON object')
  })

  it('fails the case when the grader never gives a verdict', async () => {
    const grade = await gradeAnswer(async () => 'no idea', 'q', 'a', 'r')
    expect(grade.pass).toBe(false)
    expect(grade.raw).toHaveLength(2)
  })
})
