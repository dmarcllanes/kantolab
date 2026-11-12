// A small arithmetic evaluator for the calculator tool. No eval(), no Function().

const FUNCS: Record<string, (...args: number[]) => number> = {
  sqrt: Math.sqrt, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil,
  ln: Math.log, log: Math.log10, exp: Math.exp, sin: Math.sin, cos: Math.cos, tan: Math.tan,
  min: Math.min, max: Math.max,
}
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E }

type Token = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string }

function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  const re = /\s*(?:(\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([a-zA-Z_]+)|([-+*/%^(),]))/y
  let i = 0
  while (i < src.length) {
    if (/^\s+$/.test(src.slice(i))) break
    re.lastIndex = i
    const m = re.exec(src)
    if (!m) throw new Error(`Unexpected character "${src[i]}" at position ${i}`)
    if (m[1] !== undefined) tokens.push({ t: 'num', v: Number(m[1]) })
    else if (m[2] !== undefined) tokens.push({ t: 'id', v: m[2].toLowerCase() })
    else tokens.push({ t: 'op', v: m[3] })
    i = re.lastIndex
  }
  return tokens
}

export function evaluate(expression: string): number {
  const tokens = tokenize(expression.replace(/×/g, '*').replace(/÷/g, '/'))
  let pos = 0
  const peek = () => tokens[pos]
  const isOp = (v: string) => peek()?.t === 'op' && peek()?.v === v
  const expect = (v: string) => {
    if (!isOp(v)) throw new Error(`Expected "${v}"`)
    pos++
  }

  function expr(): number {
    let left = term()
    while (isOp('+') || isOp('-')) {
      const op = tokens[pos++].v
      const right = term()
      left = op === '+' ? left + right : left - right
    }
    return left
  }
  function term(): number {
    let left = unary()
    while (isOp('*') || isOp('/') || isOp('%')) {
      const op = tokens[pos++].v
      const right = unary()
      left = op === '*' ? left * right : op === '/' ? left / right : left % right
    }
    return left
  }
  function unary(): number {
    if (isOp('-')) { pos++; return -unary() }
    if (isOp('+')) { pos++; return unary() }
    return power()
  }
  function power(): number {
    const base = primary()
    if (isOp('^')) { pos++; return base ** unary() }
    return base
  }
  function primary(): number {
    const tok = tokens[pos++]
    if (!tok) throw new Error('Unexpected end of expression')
    if (tok.t === 'num') return tok.v
    if (tok.t === 'id') {
      if (isOp('(')) {
        const fn = FUNCS[tok.v]
        if (!fn) throw new Error(`Unknown function "${tok.v}"`)
        pos++
        const args = [expr()]
        while (isOp(',')) { pos++; args.push(expr()) }
        expect(')')
        return fn(...args)
      }
      if (tok.v in CONSTS) return CONSTS[tok.v]
      throw new Error(`Unknown name "${tok.v}"`)
    }
    if (tok.v === '(') {
      const v = expr()
      expect(')')
      return v
    }
    throw new Error(`Unexpected "${tok.v}"`)
  }

  if (tokens.length === 0) throw new Error('Empty expression')
  const value = expr()
  if (pos < tokens.length) throw new Error(`Unexpected "${String(tokens[pos].v)}"`)
  if (!Number.isFinite(value)) throw new Error('Result is not a finite number')
  return value
}
