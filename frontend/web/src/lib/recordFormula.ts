/**
 * Excel-like formulas for Customer Portal record columns, evaluated without eval().
 * Operands: numbers, column keys (e.g. load, area_mm2), "text".
 * Operators: + - * / ^, comparisons = <> != < <= > >=, & (join text), parentheses.
 * Functions: SUM, AVG, MIN, MAX, ROUND(x[, digits]), ABS, SQRT, IF(cond, a, b), AND, OR, NOT.
 * Example: = ROUND(load * 1000 / area, 1)
 */

export type FormulaValue = number | string | boolean | null

type Token =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'id'; v: string }
  | { t: 'op'; v: string }
  | { t: '('; v: '(' }
  | { t: ')'; v: ')' }
  | { t: ','; v: ',' }

export class FormulaError extends Error {}

function tokenize(src: string): Token[] {
  const s = src.trim().replace(/^=/, '')
  const out: Token[] = []
  let i = 0
  while (i < s.length) {
    const c = s[i]!
    if (/\s/.test(c)) {
      i++
    } else if (/[0-9.]/.test(c)) {
      const m = /^\d*\.?\d+(e[+-]?\d+)?/i.exec(s.slice(i))
      if (!m) throw new FormulaError(`Bad number near "${s.slice(i, i + 6)}"`)
      out.push({ t: 'num', v: Number(m[0]) })
      i += m[0].length
    } else if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i))!
      out.push({ t: 'id', v: m[0] })
      i += m[0].length
    } else if (c === '"') {
      const end = s.indexOf('"', i + 1)
      if (end < 0) throw new FormulaError('Missing closing quote')
      out.push({ t: 'str', v: s.slice(i + 1, end) })
      i = end + 1
    } else if (c === '(' || c === ')' || c === ',') {
      out.push({ t: c, v: c } as Token)
      i++
    } else {
      const two = s.slice(i, i + 2)
      if (['<=', '>=', '<>', '!='].includes(two)) {
        out.push({ t: 'op', v: two === '!=' ? '<>' : two })
        i += 2
      } else if ('+-*/^<>=&'.includes(c)) {
        out.push({ t: 'op', v: c })
        i++
      } else {
        throw new FormulaError(`Unknown character "${c}"`)
      }
    }
  }
  return out
}

type Node =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'ref'; v: string }
  | { k: 'neg'; a: Node }
  | { k: 'bin'; op: string; a: Node; b: Node }
  | { k: 'call'; fn: string; args: Node[] }

const FUNCS = new Set(['SUM', 'AVG', 'AVERAGE', 'MIN', 'MAX', 'ROUND', 'ABS', 'SQRT', 'IF', 'AND', 'OR', 'NOT'])

function parse(tokens: Token[]): Node {
  let p = 0
  const peek = () => tokens[p]
  const take = () => tokens[p++]
  const expectT = (t: Token['t']) => {
    const tok = take()
    if (!tok || tok.t !== t) throw new FormulaError(`Expected "${t}"`)
  }
  // compare < concat < add < mul < pow < unary < primary
  const compare = (): Node => {
    let a = concat()
    while (peek()?.t === 'op' && ['=', '<>', '<', '<=', '>', '>='].includes(peek()!.v as string)) {
      const op = take()!.v as string
      a = { k: 'bin', op, a, b: concat() }
    }
    return a
  }
  const concat = (): Node => {
    let a = add()
    while (peek()?.t === 'op' && peek()!.v === '&') {
      take()
      a = { k: 'bin', op: '&', a, b: add() }
    }
    return a
  }
  const add = (): Node => {
    let a = mul()
    while (peek()?.t === 'op' && (peek()!.v === '+' || peek()!.v === '-')) {
      const op = take()!.v as string
      a = { k: 'bin', op, a, b: mul() }
    }
    return a
  }
  const mul = (): Node => {
    let a = pow()
    while (peek()?.t === 'op' && (peek()!.v === '*' || peek()!.v === '/')) {
      const op = take()!.v as string
      a = { k: 'bin', op, a, b: pow() }
    }
    return a
  }
  const pow = (): Node => {
    const a = unary()
    if (peek()?.t === 'op' && peek()!.v === '^') {
      take()
      return { k: 'bin', op: '^', a, b: pow() }
    }
    return a
  }
  const unary = (): Node => {
    if (peek()?.t === 'op' && peek()!.v === '-') {
      take()
      return { k: 'neg', a: unary() }
    }
    if (peek()?.t === 'op' && peek()!.v === '+') {
      take()
      return unary()
    }
    return primary()
  }
  const primary = (): Node => {
    const tok = take()
    if (!tok) throw new FormulaError('Formula ends too early')
    if (tok.t === 'num') return { k: 'num', v: tok.v }
    if (tok.t === 'str') return { k: 'str', v: tok.v }
    if (tok.t === '(') {
      const e = compare()
      expectT(')')
      return e
    }
    if (tok.t === 'id') {
      const name = tok.v
      if (peek()?.t === '(') {
        const fn = name.toUpperCase()
        if (!FUNCS.has(fn)) throw new FormulaError(`Unknown function ${name}`)
        take()
        const args: Node[] = []
        if (peek()?.t !== ')') {
          args.push(compare())
          while (peek()?.t === ',') {
            take()
            args.push(compare())
          }
        }
        expectT(')')
        return { k: 'call', fn, args }
      }
      return { k: 'ref', v: name.toLowerCase() }
    }
    throw new FormulaError(`Unexpected "${tok.v}"`)
  }
  const node = compare()
  if (p < tokens.length) throw new FormulaError(`Unexpected "${tokens[p]!.v}"`)
  return node
}

/** Column keys a formula uses (to check them in the designer). */
export function formulaRefs(src: string): string[] {
  const refs = new Set<string>()
  const walk = (n: Node) => {
    if (n.k === 'ref') refs.add(n.v)
    else if (n.k === 'neg') walk(n.a)
    else if (n.k === 'bin') {
      walk(n.a)
      walk(n.b)
    } else if (n.k === 'call') n.args.forEach(walk)
  }
  walk(parse(tokenize(src)))
  return [...refs]
}

function num(v: FormulaValue): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'boolean') return v ? 1 : 0
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

/** Evaluates a formula; empty inputs give null (blank cell) instead of an error. */
export function evaluateFormula(src: string, values: Record<string, FormulaValue>): FormulaValue {
  const ev = (n: Node): FormulaValue => {
    switch (n.k) {
      case 'num':
        return n.v
      case 'str':
        return n.v
      case 'ref':
        return values[n.v] ?? null
      case 'neg': {
        const a = num(ev(n.a))
        return a == null ? null : -a
      }
      case 'bin': {
        const av = ev(n.a)
        const bv = ev(n.b)
        if (n.op === '&') return `${av ?? ''}${bv ?? ''}`
        if (['=', '<>', '<', '<=', '>', '>='].includes(n.op)) {
          const an = num(av)
          const bn = num(bv)
          const [x, y] = an != null && bn != null ? [an, bn] : [String(av ?? ''), String(bv ?? '')]
          switch (n.op) {
            case '=': return x === y
            case '<>': return x !== y
            case '<': return x < y
            case '<=': return x <= y
            case '>': return x > y
            default: return x >= y
          }
        }
        const a = num(av)
        const b = num(bv)
        if (a == null || b == null) return null
        switch (n.op) {
          case '+': return a + b
          case '-': return a - b
          case '*': return a * b
          case '/': return b === 0 ? null : a / b
          default: return a ** b
        }
      }
      case 'call': {
        const args = n.args.map(ev)
        const nums = args.map(num).filter((x): x is number => x != null)
        switch (n.fn) {
          case 'SUM': return nums.length ? nums.reduce((s, x) => s + x, 0) : null
          case 'AVG':
          case 'AVERAGE': return nums.length ? nums.reduce((s, x) => s + x, 0) / nums.length : null
          case 'MIN': return nums.length ? Math.min(...nums) : null
          case 'MAX': return nums.length ? Math.max(...nums) : null
          case 'ABS': return nums[0] == null ? null : Math.abs(nums[0])
          case 'SQRT': return nums[0] == null || nums[0] < 0 ? null : Math.sqrt(nums[0])
          case 'ROUND': {
            const x = num(args[0] ?? null)
            const d = num(args[1] ?? 0) ?? 0
            if (x == null) return null
            const f = 10 ** Math.max(0, Math.min(8, Math.trunc(d)))
            return Math.round(x * f) / f
          }
          case 'IF': return args[0] === true || (num(args[0] ?? null) ?? 0) !== 0 ? (args[1] ?? null) : (args[2] ?? null)
          case 'AND': return args.every((a) => a === true || (num(a) ?? 0) !== 0)
          case 'OR': return args.some((a) => a === true || (num(a) ?? 0) !== 0)
          case 'NOT': return !(args[0] === true || (num(args[0] ?? null) ?? 0) !== 0)
          default: return null
        }
      }
    }
  }
  return ev(parse(tokenize(src)))
}

/** Checks a formula against the keys of the section; returns an error message or ''. */
export function formulaProblem(src: string, keys: string[]): string {
  if (!src.trim()) return 'Enter a formula'
  try {
    const unknown = formulaRefs(src).filter((r) => !keys.includes(r))
    return unknown.length ? `Unknown column: ${unknown.join(', ')}` : ''
  } catch (err) {
    return err instanceof Error ? err.message : 'Invalid formula'
  }
}
