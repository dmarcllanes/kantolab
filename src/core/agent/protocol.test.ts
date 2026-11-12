import { describe, expect, it } from 'vitest'
import { extractJsonObject, parseReply } from './protocol'

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
