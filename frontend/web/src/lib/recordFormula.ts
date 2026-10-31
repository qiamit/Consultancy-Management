/**
 * Excel-like formulas for Customer Portal record columns, evaluated without eval().
 * Operands: numbers, column keys (e.g. load, area_mm2), "text", and values of linked entries in another section of
 * the same licence as <link column>.<column> (e.g. rm_lots.quantity: one value per linked entry).
 * Operators: + - * / ^ and % (percent), comparisons = <> != < <= > >=, & (join text), parentheses.
 * Functions: the Excel-style list in formulaFunctions.ts (SUM, AVERAGE, STDEV, IF, IFERROR, ROUND, TEXT, DATEDIF, …).
 * Example: = ROUND(load * 1000 / area, 1)   = SUM(rm_lots.quantity)   = IFERROR(a / b, 0)
 */

import {
  FUNCTION_NAMES,
  FormulaError,
  LAZY_FUNCTIONS,
  LIST_FUNCTIONS,
  runFunction,
  toNum,
  truthy,
  type FormulaScalar,
  type FormulaValue,
} from './formulaFunctions'

export { FORMULA_FUNCTIONS, FORMULA_OPERATORS, FormulaError, type FormulaScalar, type FormulaValue } from './formulaFunctions'

type Token =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'id'; v: string }
  | { t: 'op'; v: string }
  | { t: '('; v: '(' }
  | { t: ')'; v: ')' }
  | { t: ','; v: ',' }

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
      const m = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?/.exec(s.slice(i))!
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
      } else if ('+-*/^<>=&%'.includes(c)) {
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
  | { k: 'pct'; a: Node }
  | { k: 'bin'; op: string; a: Node; b: Node }
  | { k: 'call'; fn: string; args: Node[] }

function parse(tokens: Token[]): Node {
  let p = 0
  const peek = () => tokens[p]
  const take = () => tokens[p++]
  const expectT = (t: Token['t']) => {
    const tok = take()
    if (!tok || tok.t !== t) throw new FormulaError(`Expected "${t}"`)
  }
  const isOp = (v: string) => peek()?.t === 'op' && peek()!.v === v
  // compare < concat < add < mul < pow < unary < percent < primary
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
    while (isOp('&')) {
      take()
      a = { k: 'bin', op: '&', a, b: add() }
    }
    return a
  }
  const add = (): Node => {
    let a = mul()
    while (isOp('+') || isOp('-')) {
      const op = take()!.v as string
      a = { k: 'bin', op, a, b: mul() }
    }
    return a
  }
  const mul = (): Node => {
    let a = pow()
    while (isOp('*') || isOp('/')) {
      const op = take()!.v as string
      a = { k: 'bin', op, a, b: pow() }
    }
    return a
  }
  const pow = (): Node => {
    const a = unary()
    if (isOp('^')) {
      take()
      return { k: 'bin', op: '^', a, b: pow() }
    }
    return a
  }
  const unary = (): Node => {
    if (isOp('-')) {
      take()
      return { k: 'neg', a: unary() }
    }
    if (isOp('+')) {
      take()
      return unary()
    }
    let a = primary()
    while (isOp('%')) {
      take()
      a = { k: 'pct', a }
    }
    return a
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
        if (!FUNCTION_NAMES.has(fn)) throw new FormulaError(`Unknown function ${name}`)
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
      const upper = name.toUpperCase()
      if (upper === 'TRUE' || upper === 'FALSE') return { k: 'call', fn: upper, args: [] }
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
    else if (n.k === 'neg' || n.k === 'pct') walk(n.a)
    else if (n.k === 'bin') {
      walk(n.a)
      walk(n.b)
    } else if (n.k === 'call') n.args.forEach(walk)
  }
  walk(parse(tokenize(src)))
  return [...refs]
}

function refLabel(n: Node): string {
  return n.k === 'ref' ? n.v : 'A value'
}

/** A list in a place that needs one value: one item is fine, more must go through SUM, AVERAGE, … */
function scalar(v: FormulaValue, label: string): FormulaScalar {
  if (!Array.isArray(v)) return v
  if (v.length <= 1) return v[0] ?? null
  throw new FormulaError(`${label} has ${v.length} values; use SUM, AVERAGE, MIN, MAX or COUNT`)
}

/** Evaluates a formula; empty inputs give null (blank cell), real errors (e.g. divide by zero) throw FormulaError. */
export function evaluateFormula(src: string, values: Record<string, FormulaValue>): FormulaValue {
  const one = (n: Node) => scalar(ev(n), refLabel(n))
  const ev = (n: Node): FormulaValue => {
    switch (n.k) {
      case 'num':
        return n.v
      case 'str':
        return n.v
      case 'ref':
        return values[n.v] ?? null
      case 'neg': {
        const a = toNum(one(n.a))
        return a == null ? null : -a
      }
      case 'pct': {
        const a = toNum(one(n.a))
        return a == null ? null : a / 100
      }
      case 'bin': {
        const av = one(n.a)
        const bv = one(n.b)
        if (n.op === '&') return `${av ?? ''}${bv ?? ''}`
        if (['=', '<>', '<', '<=', '>', '>='].includes(n.op)) {
          const an = toNum(av)
          const bn = toNum(bv)
          const [x, y] = an != null && bn != null ? [an, bn] : [String(av ?? '').toLowerCase(), String(bv ?? '').toLowerCase()]
          switch (n.op) {
            case '=': return x === y
            case '<>': return x !== y
            case '<': return x < y
            case '<=': return x <= y
            case '>': return x > y
            default: return x >= y
          }
        }
        const a = toNum(av)
        const b = toNum(bv)
        if (a == null || b == null) return null
        switch (n.op) {
          case '+': return a + b
          case '-': return a - b
          case '*': return a * b
          case '/':
            if (b === 0) throw new FormulaError('#DIV/0! (divide by zero)')
            return a / b
          default: return a ** b
        }
      }
      case 'call': {
        if (LAZY_FUNCTIONS.has(n.fn)) {
          switch (n.fn) {
            case 'IF':
              return truthy(n.args[0] ? one(n.args[0]) : null) ? (n.args[1] ? ev(n.args[1]) : true) : n.args[2] ? ev(n.args[2]) : false
            case 'IFS':
              for (let i = 0; i + 1 < n.args.length; i += 2) if (truthy(one(n.args[i]!))) return ev(n.args[i + 1]!)
              return null
            case 'IFERROR':
              try {
                return n.args[0] ? ev(n.args[0]) : null
              } catch (err) {
                if (err instanceof FormulaError) return n.args[1] ? ev(n.args[1]) : null
                throw err
              }
            case 'IFNA': {
              const v = n.args[0] ? ev(n.args[0]) : null
              return v == null || v === '' ? (n.args[1] ? ev(n.args[1]) : null) : v
            }
            default: {
              // SWITCH(value, match1, result1, …, [default])
              const v = n.args[0] ? one(n.args[0]) : null
              const rest = n.args.slice(1)
              for (let i = 0; i + 1 < rest.length; i += 2) {
                const m = one(rest[i]!)
                const same = toNum(v) != null && toNum(m) != null ? toNum(v) === toNum(m) : String(v ?? '').toLowerCase() === String(m ?? '').toLowerCase()
                if (same) return ev(rest[i + 1]!)
              }
              return rest.length % 2 === 1 ? ev(rest[rest.length - 1]!) : null
            }
          }
        }
        const args = LIST_FUNCTIONS.has(n.fn) ? n.args.map(ev) : n.args.map(one)
        return runFunction(n.fn, args)
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
