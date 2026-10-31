/**
 * Excel-style functions for record formulas: the help shown in the Formula Builder and the code that runs them.
 * IF, IFS, IFERROR, IFNA and SWITCH are evaluated lazily in recordFormula.ts; everything else is here.
 * Dates are ISO strings (YYYY-MM-DD), as stored by date columns.
 */

export type FormulaScalar = number | string | boolean | null
export type FormulaValue = FormulaScalar | FormulaScalar[]

export class FormulaError extends Error {}

export type FunctionCategory = 'Math' | 'Statistical' | 'Logical' | 'Text' | 'Date'

export type FunctionInfo = {
  name: string
  category: FunctionCategory
  syntax: string
  help: string
  /** Takes whole lists (several linked values) as arguments. */
  list?: boolean
}

export const FORMULA_FUNCTIONS: FunctionInfo[] = [
  // Math
  { name: 'SUM', category: 'Math', syntax: 'SUM(n1, n2, …)', help: 'Adds all the numbers.', list: true },
  { name: 'PRODUCT', category: 'Math', syntax: 'PRODUCT(n1, n2, …)', help: 'Multiplies all the numbers.', list: true },
  { name: 'SUMSQ', category: 'Math', syntax: 'SUMSQ(n1, n2, …)', help: 'Adds the squares of the numbers.', list: true },
  { name: 'SUMPRODUCT', category: 'Math', syntax: 'SUMPRODUCT(list1, list2)', help: 'Multiplies matching items of two lists and adds the results.', list: true },
  { name: 'ROUND', category: 'Math', syntax: 'ROUND(x, digits)', help: 'Rounds to the given decimals (0.5 goes up).' },
  { name: 'ROUNDUP', category: 'Math', syntax: 'ROUNDUP(x, digits)', help: 'Rounds away from zero.' },
  { name: 'ROUNDDOWN', category: 'Math', syntax: 'ROUNDDOWN(x, digits)', help: 'Rounds towards zero.' },
  { name: 'MROUND', category: 'Math', syntax: 'MROUND(x, multiple)', help: 'Rounds to the nearest multiple, e.g. MROUND(17, 5) = 15.' },
  { name: 'CEILING', category: 'Math', syntax: 'CEILING(x, significance)', help: 'Rounds up to the next multiple.' },
  { name: 'FLOOR', category: 'Math', syntax: 'FLOOR(x, significance)', help: 'Rounds down to the previous multiple.' },
  { name: 'INT', category: 'Math', syntax: 'INT(x)', help: 'Rounds down to a whole number.' },
  { name: 'TRUNC', category: 'Math', syntax: 'TRUNC(x, digits)', help: 'Cuts off decimals without rounding.' },
  { name: 'ABS', category: 'Math', syntax: 'ABS(x)', help: 'The number without its minus sign.' },
  { name: 'SIGN', category: 'Math', syntax: 'SIGN(x)', help: '1 for positive, -1 for negative, 0 for zero.' },
  { name: 'SQRT', category: 'Math', syntax: 'SQRT(x)', help: 'Square root.' },
  { name: 'POWER', category: 'Math', syntax: 'POWER(x, y)', help: 'x raised to y (same as x ^ y).' },
  { name: 'EXP', category: 'Math', syntax: 'EXP(x)', help: 'e raised to x.' },
  { name: 'LN', category: 'Math', syntax: 'LN(x)', help: 'Natural logarithm.' },
  { name: 'LOG', category: 'Math', syntax: 'LOG(x, base)', help: 'Logarithm; base 10 when left out.' },
  { name: 'LOG10', category: 'Math', syntax: 'LOG10(x)', help: 'Base-10 logarithm.' },
  { name: 'MOD', category: 'Math', syntax: 'MOD(x, divisor)', help: 'Remainder after division.' },
  { name: 'QUOTIENT', category: 'Math', syntax: 'QUOTIENT(x, divisor)', help: 'Whole-number part of a division.' },
  { name: 'PI', category: 'Math', syntax: 'PI()', help: '3.14159…' },
  { name: 'SIN', category: 'Math', syntax: 'SIN(radians)', help: 'Sine.' },
  { name: 'COS', category: 'Math', syntax: 'COS(radians)', help: 'Cosine.' },
  { name: 'TAN', category: 'Math', syntax: 'TAN(radians)', help: 'Tangent.' },
  { name: 'ASIN', category: 'Math', syntax: 'ASIN(x)', help: 'Arc-sine, in radians.' },
  { name: 'ACOS', category: 'Math', syntax: 'ACOS(x)', help: 'Arc-cosine, in radians.' },
  { name: 'ATAN', category: 'Math', syntax: 'ATAN(x)', help: 'Arc-tangent, in radians.' },
  { name: 'ATAN2', category: 'Math', syntax: 'ATAN2(x, y)', help: 'Angle of the point (x, y), in radians.' },
  { name: 'DEGREES', category: 'Math', syntax: 'DEGREES(radians)', help: 'Radians to degrees.' },
  { name: 'RADIANS', category: 'Math', syntax: 'RADIANS(degrees)', help: 'Degrees to radians.' },
  { name: 'GCD', category: 'Math', syntax: 'GCD(n1, n2, …)', help: 'Greatest common divisor.', list: true },
  { name: 'LCM', category: 'Math', syntax: 'LCM(n1, n2, …)', help: 'Least common multiple.', list: true },
  { name: 'FACT', category: 'Math', syntax: 'FACT(n)', help: 'Factorial: 1 × 2 × … × n.' },
  { name: 'EVEN', category: 'Math', syntax: 'EVEN(x)', help: 'Rounds up to the next even number.' },
  { name: 'ODD', category: 'Math', syntax: 'ODD(x)', help: 'Rounds up to the next odd number.' },
  // Statistical
  { name: 'AVERAGE', category: 'Statistical', syntax: 'AVERAGE(n1, n2, …)', help: 'Mean of the numbers (AVG works too).', list: true },
  { name: 'AVG', category: 'Statistical', syntax: 'AVG(n1, n2, …)', help: 'Same as AVERAGE.', list: true },
  { name: 'MIN', category: 'Statistical', syntax: 'MIN(n1, n2, …)', help: 'Smallest number.', list: true },
  { name: 'MAX', category: 'Statistical', syntax: 'MAX(n1, n2, …)', help: 'Largest number.', list: true },
  { name: 'COUNT', category: 'Statistical', syntax: 'COUNT(v1, v2, …)', help: 'How many numbers.', list: true },
  { name: 'COUNTA', category: 'Statistical', syntax: 'COUNTA(v1, v2, …)', help: 'How many values are not empty.', list: true },
  { name: 'COUNTBLANK', category: 'Statistical', syntax: 'COUNTBLANK(v1, v2, …)', help: 'How many values are empty.', list: true },
  { name: 'MEDIAN', category: 'Statistical', syntax: 'MEDIAN(n1, n2, …)', help: 'Middle value.', list: true },
  { name: 'MODE', category: 'Statistical', syntax: 'MODE(n1, n2, …)', help: 'Most frequent value.', list: true },
  { name: 'STDEV', category: 'Statistical', syntax: 'STDEV(n1, n2, …)', help: 'Standard deviation of a sample (n − 1).', list: true },
  { name: 'STDEV.S', category: 'Statistical', syntax: 'STDEV.S(n1, n2, …)', help: 'Same as STDEV.', list: true },
  { name: 'STDEVP', category: 'Statistical', syntax: 'STDEVP(n1, n2, …)', help: 'Standard deviation of the whole population (n).', list: true },
  { name: 'STDEV.P', category: 'Statistical', syntax: 'STDEV.P(n1, n2, …)', help: 'Same as STDEVP.', list: true },
  { name: 'VAR', category: 'Statistical', syntax: 'VAR(n1, n2, …)', help: 'Variance of a sample.', list: true },
  { name: 'VAR.S', category: 'Statistical', syntax: 'VAR.S(n1, n2, …)', help: 'Same as VAR.', list: true },
  { name: 'VARP', category: 'Statistical', syntax: 'VARP(n1, n2, …)', help: 'Variance of the whole population.', list: true },
  { name: 'VAR.P', category: 'Statistical', syntax: 'VAR.P(n1, n2, …)', help: 'Same as VARP.', list: true },
  { name: 'AVEDEV', category: 'Statistical', syntax: 'AVEDEV(n1, n2, …)', help: 'Average distance from the mean.', list: true },
  { name: 'DEVSQ', category: 'Statistical', syntax: 'DEVSQ(n1, n2, …)', help: 'Sum of squared distances from the mean.', list: true },
  { name: 'GEOMEAN', category: 'Statistical', syntax: 'GEOMEAN(n1, n2, …)', help: 'Geometric mean.', list: true },
  { name: 'HARMEAN', category: 'Statistical', syntax: 'HARMEAN(n1, n2, …)', help: 'Harmonic mean.', list: true },
  { name: 'LARGE', category: 'Statistical', syntax: 'LARGE(list, k)', help: 'The k-th largest value.', list: true },
  { name: 'SMALL', category: 'Statistical', syntax: 'SMALL(list, k)', help: 'The k-th smallest value.', list: true },
  { name: 'PERCENTILE', category: 'Statistical', syntax: 'PERCENTILE(list, k)', help: 'k-th percentile, k from 0 to 1.', list: true },
  { name: 'QUARTILE', category: 'Statistical', syntax: 'QUARTILE(list, q)', help: 'Quartile q = 0 to 4.', list: true },
  { name: 'COUNTIF', category: 'Statistical', syntax: 'COUNTIF(list, ">10")', help: 'How many values meet the condition.', list: true },
  { name: 'SUMIF', category: 'Statistical', syntax: 'SUMIF(list, ">10")', help: 'Adds the values that meet the condition.', list: true },
  { name: 'AVERAGEIF', category: 'Statistical', syntax: 'AVERAGEIF(list, ">10")', help: 'Mean of the values that meet the condition.', list: true },
  // Logical
  { name: 'IF', category: 'Logical', syntax: 'IF(condition, then, else)', help: 'Gives "then" when the condition is true, otherwise "else".' },
  { name: 'IFS', category: 'Logical', syntax: 'IFS(cond1, value1, cond2, value2, …)', help: 'Value of the first true condition.' },
  { name: 'IFERROR', category: 'Logical', syntax: 'IFERROR(value, fallback)', help: 'Gives the fallback when the value is an error (e.g. divide by zero).' },
  { name: 'IFNA', category: 'Logical', syntax: 'IFNA(value, fallback)', help: 'Gives the fallback when the value is empty.' },
  { name: 'SWITCH', category: 'Logical', syntax: 'SWITCH(value, match1, result1, …, default)', help: 'Result of the first matching value.' },
  { name: 'AND', category: 'Logical', syntax: 'AND(c1, c2, …)', help: 'True when all are true.', list: true },
  { name: 'OR', category: 'Logical', syntax: 'OR(c1, c2, …)', help: 'True when any is true.', list: true },
  { name: 'XOR', category: 'Logical', syntax: 'XOR(c1, c2, …)', help: 'True when an odd number are true.', list: true },
  { name: 'NOT', category: 'Logical', syntax: 'NOT(condition)', help: 'Opposite of the condition.' },
  { name: 'TRUE', category: 'Logical', syntax: 'TRUE()', help: 'The value true.' },
  { name: 'FALSE', category: 'Logical', syntax: 'FALSE()', help: 'The value false.' },
  { name: 'ISBLANK', category: 'Logical', syntax: 'ISBLANK(value)', help: 'True when empty.' },
  { name: 'ISNUMBER', category: 'Logical', syntax: 'ISNUMBER(value)', help: 'True when a number.' },
  { name: 'ISTEXT', category: 'Logical', syntax: 'ISTEXT(value)', help: 'True when text.' },
  { name: 'ISEVEN', category: 'Logical', syntax: 'ISEVEN(n)', help: 'True when even.' },
  { name: 'ISODD', category: 'Logical', syntax: 'ISODD(n)', help: 'True when odd.' },
  // Text
  { name: 'CONCAT', category: 'Text', syntax: 'CONCAT(t1, t2, …)', help: 'Joins texts (same as &).', list: true },
  { name: 'CONCATENATE', category: 'Text', syntax: 'CONCATENATE(t1, t2, …)', help: 'Same as CONCAT.', list: true },
  { name: 'TEXTJOIN', category: 'Text', syntax: 'TEXTJOIN(", ", TRUE, t1, …)', help: 'Joins with a separator; TRUE skips empty values.', list: true },
  { name: 'LEFT', category: 'Text', syntax: 'LEFT(text, n)', help: 'First n characters.' },
  { name: 'RIGHT', category: 'Text', syntax: 'RIGHT(text, n)', help: 'Last n characters.' },
  { name: 'MID', category: 'Text', syntax: 'MID(text, start, n)', help: 'n characters from position start (1 = first).' },
  { name: 'LEN', category: 'Text', syntax: 'LEN(text)', help: 'Number of characters.' },
  { name: 'UPPER', category: 'Text', syntax: 'UPPER(text)', help: 'CAPITAL LETTERS.' },
  { name: 'LOWER', category: 'Text', syntax: 'LOWER(text)', help: 'small letters.' },
  { name: 'PROPER', category: 'Text', syntax: 'PROPER(text)', help: 'Capital First Letters.' },
  { name: 'TRIM', category: 'Text', syntax: 'TRIM(text)', help: 'Removes extra spaces.' },
  { name: 'SUBSTITUTE', category: 'Text', syntax: 'SUBSTITUTE(text, old, new)', help: 'Replaces every "old" with "new".' },
  { name: 'REPLACE', category: 'Text', syntax: 'REPLACE(text, start, n, new)', help: 'Replaces n characters from start.' },
  { name: 'FIND', category: 'Text', syntax: 'FIND(find, text)', help: 'Position of "find" (case sensitive).' },
  { name: 'SEARCH', category: 'Text', syntax: 'SEARCH(find, text)', help: 'Position of "find" (any case).' },
  { name: 'TEXT', category: 'Text', syntax: 'TEXT(value, "0.00")', help: 'Number as text with the given decimals ("#,##0.00" adds commas).' },
  { name: 'FIXED', category: 'Text', syntax: 'FIXED(x, decimals)', help: 'Number as text with fixed decimals.' },
  { name: 'VALUE', category: 'Text', syntax: 'VALUE(text)', help: 'Text to number.' },
  { name: 'REPT', category: 'Text', syntax: 'REPT(text, n)', help: 'Repeats the text n times.' },
  { name: 'EXACT', category: 'Text', syntax: 'EXACT(t1, t2)', help: 'True when both texts are exactly the same.' },
  // Date
  { name: 'TODAY', category: 'Date', syntax: 'TODAY()', help: "Today's date." },
  { name: 'DATE', category: 'Date', syntax: 'DATE(year, month, day)', help: 'Builds a date.' },
  { name: 'YEAR', category: 'Date', syntax: 'YEAR(date)', help: 'Year of a date.' },
  { name: 'MONTH', category: 'Date', syntax: 'MONTH(date)', help: 'Month of a date (1–12).' },
  { name: 'DAY', category: 'Date', syntax: 'DAY(date)', help: 'Day of the month.' },
  { name: 'WEEKDAY', category: 'Date', syntax: 'WEEKDAY(date)', help: 'Day of the week, 1 = Sunday.' },
  { name: 'DAYS', category: 'Date', syntax: 'DAYS(end, start)', help: 'Days between two dates.' },
  { name: 'DATEDIF', category: 'Date', syntax: 'DATEDIF(start, end, "D")', help: 'Whole days ("D"), months ("M") or years ("Y") between dates.' },
  { name: 'EDATE', category: 'Date', syntax: 'EDATE(date, months)', help: 'Date moved by whole months.' },
  { name: 'EOMONTH', category: 'Date', syntax: 'EOMONTH(date, months)', help: 'Last day of the month, months later.' },
]

export const FORMULA_OPERATORS: Array<{ symbol: string; insert: string; category: string; example: string; help: string }> = [
  { symbol: '+', insert: ' + ', category: 'Arithmetic', example: 'a + b', help: 'Add.' },
  { symbol: '−', insert: ' - ', category: 'Arithmetic', example: 'a - b', help: 'Subtract (or make negative: -a).' },
  { symbol: '×', insert: ' * ', category: 'Arithmetic', example: 'a * b', help: 'Multiply (type *).' },
  { symbol: '÷', insert: ' / ', category: 'Arithmetic', example: 'a / b', help: 'Divide (type /). Dividing by zero is an error.' },
  { symbol: '^', insert: '^', category: 'Arithmetic', example: 'a ^ 2', help: 'Power.' },
  { symbol: '%', insert: '%', category: 'Arithmetic', example: '18%', help: 'Percent: 18% = 0.18.' },
  { symbol: '=', insert: ' = ', category: 'Comparison', example: 'a = b', help: 'Equal to.' },
  { symbol: '<>', insert: ' <> ', category: 'Comparison', example: 'a <> b', help: 'Not equal to.' },
  { symbol: '>', insert: ' > ', category: 'Comparison', example: 'a > b', help: 'Greater than.' },
  { symbol: '<', insert: ' < ', category: 'Comparison', example: 'a < b', help: 'Less than.' },
  { symbol: '>=', insert: ' >= ', category: 'Comparison', example: 'a >= b', help: 'Greater than or equal to.' },
  { symbol: '<=', insert: ' <= ', category: 'Comparison', example: 'a <= b', help: 'Less than or equal to.' },
  { symbol: '&', insert: ' & ', category: 'Text', example: 'a & " MT"', help: 'Joins text.' },
  { symbol: '( )', insert: '(', category: 'Grouping', example: '(a + b) * c', help: 'Brackets decide what is worked out first.' },
  { symbol: ',', insert: ', ', category: 'Grouping', example: 'SUM(a, b)', help: 'Separates function arguments.' },
  { symbol: '" "', insert: '""', category: 'Text', example: '"Pass"', help: 'Text in double quotes.' },
]

export const LIST_FUNCTIONS = new Set(FORMULA_FUNCTIONS.filter((f) => f.list).map((f) => f.name))
export const LAZY_FUNCTIONS = new Set(['IF', 'IFS', 'IFERROR', 'IFNA', 'SWITCH'])
export const FUNCTION_NAMES = new Set(FORMULA_FUNCTIONS.map((f) => f.name))

// ── Helpers ─────────────────────────────────────────────────────────────────────────────────────────

export function toNum(v: FormulaScalar | undefined): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'boolean') return v ? 1 : 0
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

export function truthy(v: FormulaScalar | undefined): boolean {
  if (v === true) return true
  if (typeof v === 'string') return v.toUpperCase() === 'TRUE' || (toNum(v) ?? 0) !== 0
  return (toNum(v) ?? 0) !== 0
}

const flat = (args: FormulaValue[]): FormulaScalar[] => args.flat()
const numbers = (args: FormulaValue[]): number[] =>
  flat(args)
    .filter((v) => typeof v === 'number' || typeof v === 'boolean' || (typeof v === 'string' && v.trim() !== '' && toNum(v) != null))
    .map((v) => toNum(v)!)

function need(v: FormulaScalar | undefined, what = 'a number'): number {
  const n = toNum(v)
  if (n == null) throw new FormulaError(`Needs ${what}`)
  return n
}

const text = (v: FormulaScalar | undefined) => (v == null ? '' : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : String(v))

function mean(xs: number[]) {
  return xs.reduce((s, x) => s + x, 0) / xs.length
}
function sumSqDev(xs: number[]) {
  const m = mean(xs)
  return xs.reduce((s, x) => s + (x - m) ** 2, 0)
}
function sorted(xs: number[]) {
  return [...xs].sort((a, b) => a - b)
}
function percentile(xs: number[], k: number) {
  if (!xs.length) return null
  if (k < 0 || k > 1) throw new FormulaError('Percentile must be 0 to 1')
  const s = sorted(xs)
  const pos = (s.length - 1) * k
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return s[lo]! + (s[hi]! - s[lo]!) * (pos - lo)
}
function roundTo(x: number, d: number, mode: 'round' | 'up' | 'down') {
  const f = 10 ** Math.trunc(d)
  const v = Math.abs(x) * f
  const r = mode === 'round' ? Math.round(v + 1e-9) : mode === 'up' ? Math.ceil(v - 1e-9) : Math.floor(v + 1e-9)
  return (Math.sign(x) * r) / f
}
function gcd2(a: number, b: number): number {
  return b === 0 ? Math.abs(a) : gcd2(b, a % b)
}

/** ">10", "<=5", "<>0", "Pass" → test for COUNTIF / SUMIF / AVERAGEIF. */
function criterion(c: FormulaScalar): (v: FormulaScalar) => boolean {
  const s = text(c).trim()
  const m = /^(<=|>=|<>|<|>|=)?(.*)$/.exec(s)!
  const op = m[1] ?? '='
  const target = m[2]!.trim()
  const tn = toNum(target)
  return (v) => {
    const vn = toNum(v)
    if (tn != null && vn != null) {
      switch (op) {
        case '>': return vn > tn
        case '<': return vn < tn
        case '>=': return vn >= tn
        case '<=': return vn <= tn
        case '<>': return vn !== tn
        default: return vn === tn
      }
    }
    const eq = text(v).toLowerCase() === target.toLowerCase()
    return op === '<>' ? !eq : op === '=' ? eq : false
  }
}

function parseDate(v: FormulaScalar | undefined): Date {
  const s = text(v).trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (!m) throw new FormulaError('Needs a date (YYYY-MM-DD)')
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
}
const iso = (d: Date) => d.toISOString().slice(0, 10)
function addMonths(d: Date, months: number) {
  const r = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1))
  const last = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate()
  r.setUTCDate(Math.min(d.getUTCDate(), last))
  return r
}

function formatNumber(x: number, format: string): string {
  const dec = /\.(0+)/.exec(format)?.[1]?.length ?? 0
  const grouped = format.includes(',')
  return grouped
    ? x.toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec })
    : x.toFixed(dec)
}

// ── Implementations (args are already evaluated; list functions get lists as they are) ────────────

type Impl = (args: FormulaValue[]) => FormulaValue

const one = (args: FormulaValue[], i = 0) => args[i] as FormulaScalar | undefined

const IMPL: Record<string, Impl> = {
  SUM: (a) => numbers(a).reduce((s, x) => s + x, 0),
  PRODUCT: (a) => (numbers(a).length ? numbers(a).reduce((s, x) => s * x, 1) : 0),
  SUMSQ: (a) => numbers(a).reduce((s, x) => s + x * x, 0),
  SUMPRODUCT: (a) => {
    const lists = a.map((v) => (Array.isArray(v) ? v : [v]).map((x) => toNum(x) ?? 0))
    const len = Math.min(...lists.map((l) => l.length))
    let total = 0
    for (let i = 0; i < len; i++) total += lists.reduce((p, l) => p * l[i]!, 1)
    return total
  },
  ROUND: (a) => roundTo(need(one(a)), toNum(one(a, 1)) ?? 0, 'round'),
  ROUNDUP: (a) => roundTo(need(one(a)), toNum(one(a, 1)) ?? 0, 'up'),
  ROUNDDOWN: (a) => roundTo(need(one(a)), toNum(one(a, 1)) ?? 0, 'down'),
  MROUND: (a) => {
    const m = need(one(a, 1))
    return m === 0 ? 0 : Math.round(need(one(a)) / m) * m
  },
  CEILING: (a) => {
    const s = toNum(one(a, 1)) ?? 1
    return s === 0 ? 0 : Math.ceil(need(one(a)) / s) * s
  },
  FLOOR: (a) => {
    const s = toNum(one(a, 1)) ?? 1
    if (s === 0) throw new FormulaError('#DIV/0!')
    return Math.floor(need(one(a)) / s) * s
  },
  INT: (a) => Math.floor(need(one(a))),
  TRUNC: (a) => {
    const f = 10 ** Math.trunc(toNum(one(a, 1)) ?? 0)
    return Math.trunc(need(one(a)) * f) / f
  },
  ABS: (a) => Math.abs(need(one(a))),
  SIGN: (a) => Math.sign(need(one(a))),
  SQRT: (a) => {
    const x = need(one(a))
    if (x < 0) throw new FormulaError('#NUM! (square root of a negative)')
    return Math.sqrt(x)
  },
  POWER: (a) => need(one(a)) ** need(one(a, 1)),
  EXP: (a) => Math.exp(need(one(a))),
  LN: (a) => {
    const x = need(one(a))
    if (x <= 0) throw new FormulaError('#NUM!')
    return Math.log(x)
  },
  LOG: (a) => {
    const x = need(one(a))
    const b = toNum(one(a, 1)) ?? 10
    if (x <= 0 || b <= 0 || b === 1) throw new FormulaError('#NUM!')
    return Math.log(x) / Math.log(b)
  },
  LOG10: (a) => {
    const x = need(one(a))
    if (x <= 0) throw new FormulaError('#NUM!')
    return Math.log10(x)
  },
  MOD: (a) => {
    const d = need(one(a, 1))
    if (d === 0) throw new FormulaError('#DIV/0!')
    const x = need(one(a))
    return x - d * Math.floor(x / d)
  },
  QUOTIENT: (a) => {
    const d = need(one(a, 1))
    if (d === 0) throw new FormulaError('#DIV/0!')
    return Math.trunc(need(one(a)) / d)
  },
  PI: () => Math.PI,
  SIN: (a) => Math.sin(need(one(a))),
  COS: (a) => Math.cos(need(one(a))),
  TAN: (a) => Math.tan(need(one(a))),
  ASIN: (a) => Math.asin(need(one(a))),
  ACOS: (a) => Math.acos(need(one(a))),
  ATAN: (a) => Math.atan(need(one(a))),
  ATAN2: (a) => Math.atan2(need(one(a, 1)), need(one(a))),
  DEGREES: (a) => (need(one(a)) * 180) / Math.PI,
  RADIANS: (a) => (need(one(a)) * Math.PI) / 180,
  GCD: (a) => numbers(a).map(Math.trunc).reduce((g, x) => gcd2(g, x), 0),
  LCM: (a) => numbers(a).map(Math.trunc).reduce((l, x) => (l === 0 || x === 0 ? 0 : Math.abs(l * x) / gcd2(l, x)), 1),
  FACT: (a) => {
    const n = Math.trunc(need(one(a)))
    if (n < 0) throw new FormulaError('#NUM!')
    let f = 1
    for (let i = 2; i <= n; i++) f *= i
    return f
  },
  EVEN: (a) => {
    const x = need(one(a))
    const r = Math.ceil(Math.abs(x) / 2) * 2
    return x < 0 ? -r : r
  },
  ODD: (a) => {
    const x = need(one(a))
    let r = Math.ceil(Math.abs(x))
    if (r % 2 === 0) r += 1
    return x < 0 ? -r : r
  },

  AVERAGE: (a) => {
    const xs = numbers(a)
    if (!xs.length) return null
    return mean(xs)
  },
  MIN: (a) => (numbers(a).length ? Math.min(...numbers(a)) : null),
  MAX: (a) => (numbers(a).length ? Math.max(...numbers(a)) : null),
  COUNT: (a) => numbers(a).length,
  COUNTA: (a) => flat(a).filter((v) => v != null && v !== '').length,
  COUNTBLANK: (a) => flat(a).filter((v) => v == null || v === '').length,
  MEDIAN: (a) => {
    const s = sorted(numbers(a))
    if (!s.length) return null
    const mid = Math.floor(s.length / 2)
    return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
  },
  MODE: (a) => {
    const counts = new Map<number, number>()
    for (const x of numbers(a)) counts.set(x, (counts.get(x) ?? 0) + 1)
    let best: number | null = null
    let bestN = 1
    for (const [x, n] of counts) if (n > bestN) [best, bestN] = [x, n]
    return best
  },
  STDEV: (a) => {
    const xs = numbers(a)
    return xs.length > 1 ? Math.sqrt(sumSqDev(xs) / (xs.length - 1)) : null
  },
  STDEVP: (a) => {
    const xs = numbers(a)
    return xs.length ? Math.sqrt(sumSqDev(xs) / xs.length) : null
  },
  VAR: (a) => {
    const xs = numbers(a)
    return xs.length > 1 ? sumSqDev(xs) / (xs.length - 1) : null
  },
  VARP: (a) => {
    const xs = numbers(a)
    return xs.length ? sumSqDev(xs) / xs.length : null
  },
  AVEDEV: (a) => {
    const xs = numbers(a)
    if (!xs.length) return null
    const m = mean(xs)
    return mean(xs.map((x) => Math.abs(x - m)))
  },
  DEVSQ: (a) => (numbers(a).length ? sumSqDev(numbers(a)) : null),
  GEOMEAN: (a) => {
    const xs = numbers(a)
    if (!xs.length || xs.some((x) => x <= 0)) return null
    return Math.exp(mean(xs.map(Math.log)))
  },
  HARMEAN: (a) => {
    const xs = numbers(a)
    if (!xs.length || xs.some((x) => x <= 0)) return null
    return xs.length / xs.reduce((s, x) => s + 1 / x, 0)
  },
  LARGE: (a) => {
    const s = sorted(numbers(a.slice(0, -1))).reverse()
    const k = Math.trunc(need(one(a, a.length - 1)))
    return s[k - 1] ?? null
  },
  SMALL: (a) => {
    const s = sorted(numbers(a.slice(0, -1)))
    const k = Math.trunc(need(one(a, a.length - 1)))
    return s[k - 1] ?? null
  },
  PERCENTILE: (a) => percentile(numbers(a.slice(0, -1)), need(one(a, a.length - 1))),
  QUARTILE: (a) => {
    const q = Math.trunc(need(one(a, a.length - 1)))
    if (q < 0 || q > 4) throw new FormulaError('Quartile must be 0 to 4')
    return percentile(numbers(a.slice(0, -1)), q / 4)
  },
  COUNTIF: (a) => {
    const test = criterion(one(a, a.length - 1) ?? null)
    return flat(a.slice(0, -1)).filter(test).length
  },
  SUMIF: (a) => {
    const test = criterion(one(a, a.length - 1) ?? null)
    return flat(a.slice(0, -1)).filter(test).map((v) => toNum(v) ?? 0).reduce((s, x) => s + x, 0)
  },
  AVERAGEIF: (a) => {
    const test = criterion(one(a, a.length - 1) ?? null)
    const xs = flat(a.slice(0, -1)).filter(test).map(toNum).filter((x): x is number => x != null)
    return xs.length ? mean(xs) : null
  },

  AND: (a) => flat(a).every(truthy),
  OR: (a) => flat(a).some(truthy),
  XOR: (a) => flat(a).filter(truthy).length % 2 === 1,
  NOT: (a) => !truthy(one(a)),
  TRUE: () => true,
  FALSE: () => false,
  ISBLANK: (a) => one(a) == null || one(a) === '',
  ISNUMBER: (a) => typeof one(a) === 'number',
  ISTEXT: (a) => typeof one(a) === 'string' && toNum(one(a)) == null,
  ISEVEN: (a) => Math.trunc(need(one(a))) % 2 === 0,
  ISODD: (a) => Math.abs(Math.trunc(need(one(a))) % 2) === 1,

  CONCAT: (a) => flat(a).map(text).join(''),
  TEXTJOIN: (a) => {
    const sep = text(one(a))
    const skip = truthy(one(a, 1))
    return flat(a.slice(2)).map(text).filter((t) => !skip || t !== '').join(sep)
  },
  LEFT: (a) => text(one(a)).slice(0, Math.max(0, Math.trunc(toNum(one(a, 1)) ?? 1))),
  RIGHT: (a) => {
    const n = Math.max(0, Math.trunc(toNum(one(a, 1)) ?? 1))
    const t = text(one(a))
    return n === 0 ? '' : t.slice(-n)
  },
  MID: (a) => {
    const start = Math.max(1, Math.trunc(need(one(a, 1))))
    return text(one(a)).substr(start - 1, Math.max(0, Math.trunc(need(one(a, 2)))))
  },
  LEN: (a) => text(one(a)).length,
  UPPER: (a) => text(one(a)).toUpperCase(),
  LOWER: (a) => text(one(a)).toLowerCase(),
  PROPER: (a) => text(one(a)).toLowerCase().replace(/(^|[^a-z])([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase()),
  TRIM: (a) => text(one(a)).trim().replace(/\s+/g, ' '),
  SUBSTITUTE: (a) => {
    const old = text(one(a, 1))
    return old ? text(one(a)).split(old).join(text(one(a, 2))) : text(one(a))
  },
  REPLACE: (a) => {
    const t = text(one(a))
    const start = Math.max(1, Math.trunc(need(one(a, 1)))) - 1
    const n = Math.max(0, Math.trunc(need(one(a, 2))))
    return t.slice(0, start) + text(one(a, 3)) + t.slice(start + n)
  },
  FIND: (a) => {
    const i = text(one(a, 1)).indexOf(text(one(a)))
    if (i < 0) throw new FormulaError('#VALUE! (not found)')
    return i + 1
  },
  SEARCH: (a) => {
    const i = text(one(a, 1)).toLowerCase().indexOf(text(one(a)).toLowerCase())
    if (i < 0) throw new FormulaError('#VALUE! (not found)')
    return i + 1
  },
  TEXT: (a) => {
    const n = toNum(one(a))
    return n == null ? text(one(a)) : formatNumber(n, text(one(a, 1)) || '0')
  },
  FIXED: (a) => need(one(a)).toFixed(Math.max(0, Math.trunc(toNum(one(a, 1)) ?? 2))),
  VALUE: (a) => need(one(a), 'a number in the text'),
  REPT: (a) => text(one(a)).repeat(Math.max(0, Math.min(1000, Math.trunc(need(one(a, 1)))))),
  EXACT: (a) => text(one(a)) === text(one(a, 1)),

  TODAY: () => iso(new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()))),
  DATE: (a) => iso(new Date(Date.UTC(Math.trunc(need(one(a))), Math.trunc(need(one(a, 1))) - 1, Math.trunc(need(one(a, 2)))))),
  YEAR: (a) => parseDate(one(a)).getUTCFullYear(),
  MONTH: (a) => parseDate(one(a)).getUTCMonth() + 1,
  DAY: (a) => parseDate(one(a)).getUTCDate(),
  WEEKDAY: (a) => parseDate(one(a)).getUTCDay() + 1,
  DAYS: (a) => Math.round((parseDate(one(a)).getTime() - parseDate(one(a, 1)).getTime()) / 86400000),
  DATEDIF: (a) => {
    const s = parseDate(one(a))
    const e = parseDate(one(a, 1))
    if (e < s) throw new FormulaError('#NUM! (end before start)')
    const unit = text(one(a, 2)).toUpperCase() || 'D'
    if (unit === 'D') return Math.round((e.getTime() - s.getTime()) / 86400000)
    let months = (e.getUTCFullYear() - s.getUTCFullYear()) * 12 + (e.getUTCMonth() - s.getUTCMonth())
    if (e.getUTCDate() < s.getUTCDate()) months -= 1
    if (unit === 'M') return months
    if (unit === 'Y') return Math.floor(months / 12)
    throw new FormulaError('Unit must be "D", "M" or "Y"')
  },
  EDATE: (a) => iso(addMonths(parseDate(one(a)), Math.trunc(need(one(a, 1))))),
  EOMONTH: (a) => {
    const d = addMonths(parseDate(one(a)), Math.trunc(need(one(a, 1))))
    return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)))
  },
}

IMPL.AVG = IMPL.AVERAGE!
IMPL['STDEV.S'] = IMPL.STDEV!
IMPL['STDEV.P'] = IMPL.STDEVP!
IMPL['VAR.S'] = IMPL.VAR!
IMPL['VAR.P'] = IMPL.VARP!
IMPL.CONCATENATE = IMPL.CONCAT!

export function runFunction(name: string, args: FormulaValue[]): FormulaValue {
  const fn = IMPL[name]
  if (!fn) throw new FormulaError(`Unknown function ${name}`)
  return fn(args)
}
