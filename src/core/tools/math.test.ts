import { describe, expect, it } from 'vitest'
import { evaluate } from './math'

describe('evaluate', () => {
  it.each([
    ['1 + 2 * 3', 7],
    ['(1 + 2) * 3', 9],
    ['2 ^ 3 ^ 2', 512],
    ['-2 ^ 2', -4],
    ['10 % 4', 2],
    ['sqrt(16) + abs(-3)', 7],
    ['max(1, 5, 3)', 5],
    ['round(pi * 100) / 100', 3.14],
    ['1.5e3 / .5', 3000],
    ['12 × 3 ÷ 4', 9],
  ])('%s = %d', (expr, expected) => {
    expect(evaluate(expr)).toBeCloseTo(expected)
  })

  it.each(['', '1 +', '2 ** 3', 'foo(1)', 'alert(1)', '1 / 0', '(1 + 2', '1 2'])('rejects %j', (expr) => {
    expect(() => evaluate(expr)).toThrow()
  })
})
