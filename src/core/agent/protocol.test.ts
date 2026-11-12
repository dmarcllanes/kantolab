import { describe, expect, it } from 'vitest'
import { extractJsonObject, parseReply, splitThinking } from './protocol'

describe('extractJsonObject', () => {
  it('finds an object inside prose and code fences', () => {
    expect(extractJsonObject('Sure!\n```json\n{"final": "hi"}\n```')).toBe('{"final": "hi"}')
  })
  it('ignores braces inside strings', () => {
    expect(extractJsonObject('{"final": "a } b { c"} trailing')).toBe('{"final": "a } b { c"}')
  })
  it('returns null for unterminated objects', () => {
    expect(extractJsonObject('{"final": "x"')).toBeNull()
  })
})

describe('parseReply', () => {
  it('parses tool calls', () => {
    expect(parseReply('{"thought":"math","tool":"calculator","args":{"expression":"2+2"}}')).toEqual({
      kind: 'tool', tool: 'calculator', args: { expression: '2+2' }, thought: 'math',
    })
  })
  it('defaults missing args to {}', () => {
    expect(parseReply('{"tool":"current_time"}')).toMatchObject({ kind: 'tool', args: {} })
  })
  it('parses final answers', () => {
    expect(parseReply('{"final":"4"}')).toEqual({ kind: 'final', answer: '4', thought: undefined })
  })
  it('treats plain prose as a final answer', () => {
    expect(parseReply('The answer is 4.')).toEqual({ kind: 'final', answer: 'The answer is 4.' })
  })
  it('flags invalid JSON', () => {
    expect(parseReply('{"tool": calculator}').kind).toBe('invalid')
  })
  it('flags JSON with neither tool nor final', () => {
    expect(parseReply('{"answer": "4"}').kind).toBe('invalid')
  })
})

describe('reasoning models (<think>)', () => {
  it('ignores braces inside the thinking and keeps it as reasoning', () => {
    const r = parseReply('<think>Maybe {"final":"wrong"}? No, use the calculator.</think>\n{"tool":"calculator","args":{"expression":"1+1"}}')
    expect(r).toMatchObject({ kind: 'tool', tool: 'calculator', reasoning: expect.stringContaining('use the calculator') })
  })
  it('keeps thinking out of a plain-text answer', () => {
    expect(parseReply('<think>hmm</think>The answer is 2.')).toMatchObject({ kind: 'final', answer: 'The answer is 2.', reasoning: 'hmm' })
  })
  it('treats a reply cut off mid-thought as empty, not as an answer', () => {
    expect(parseReply('<think>still going {"tool":')).toMatchObject({ kind: 'invalid', reasoning: expect.stringContaining('still going') })
  })
  it('leaves normal replies alone', () => {
    expect(splitThinking('{"final":"x"}')).toEqual({ text: '{"final":"x"}' })
    expect(parseReply('{"final":"x"}')).toEqual({ kind: 'final', answer: 'x' })
  })
})
