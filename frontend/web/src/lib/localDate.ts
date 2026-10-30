/**
 * Calendar-date helpers that never shift a day.
 *
 * A calendar date ("2026-10-30") is stored in Postgres `date` columns and handled in the app as a
 * plain `YYYY-MM-DD` string. Two traps cause the "one day off" bugs:
 *  - `new Date().toISOString().slice(0, 10)` is the UTC date, which in India (UTC+5:30) is still
 *    yesterday between 00:00 and 05:30.
 *  - `new Date('2026-10-30')` is UTC midnight; mixing it with local getters/setters (getDate,
 *    setDate, setHours) or with `new Date()` comparisons drifts by a day in some time zones.
 * Everything here works on local calendar parts (or pure integer day numbers), so it gives the
 * same answer in IST, UTC or anywhere else.
 */

/** Years a date field accepts. Rejects typos such as 0027 or 20266. */
export const MIN_DATE_YEAR = 1900
export const MAX_DATE_YEAR = 2100
export const MIN_ISO_DATE = `${MIN_DATE_YEAR}-01-01`
export const MAX_ISO_DATE = `${MAX_DATE_YEAR}-12-31`

const ISO_DATE_RE = /^(\d{4,6})-(\d{2})-(\d{2})$/

const pad2 = (n: number) => String(n).padStart(2, '0')

/** Local calendar date of `date` as YYYY-MM-DD. */
export function toLocalIsoDate(date: Date): string {
  return `${String(date.getFullYear()).padStart(4, '0')}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** Today's local calendar date as YYYY-MM-DD (IST for users in India, also before 05:30). */
export function todayLocalIso(now: Date = new Date()): string {
  return toLocalIsoDate(now)
}

/** Split a YYYY-MM-DD string (time part ignored) into numbers; null when it is not a real date. */
export function parseIsoDateParts(value: string | null | undefined): { y: number; m: number; d: number } | null {
  const m = ISO_DATE_RE.exec(String(value ?? '').trim().slice(0, 10))
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1) return null
  if (d > new Date(Date.UTC(y, mo, 0)).getUTCDate()) return null
  return { y, m: mo, d }
}

/** True for a real YYYY-MM-DD date whose year is within MIN_DATE_YEAR..MAX_DATE_YEAR. */
export function isValidIsoDate(value: string | null | undefined): boolean {
  const p = parseIsoDateParts(value)
  return !!p && String(value ?? '').trim().length === 10 && p.y >= MIN_DATE_YEAR && p.y <= MAX_DATE_YEAR
}

/** The YYYY-MM-DD string as a Date at LOCAL midnight (not UTC midnight); null if invalid. */
export function parseIsoDateLocal(value: string | null | undefined): Date | null {
  const p = parseIsoDateParts(value)
  if (!p) return null
  const date = new Date(p.y, p.m - 1, p.d)
  if (p.y < 100) date.setFullYear(p.y)
  return date
}

/** Whole-day number for a calendar date (days since 1970-01-01), independent of time zone. */
function dayNumber(value: string | null | undefined): number | null {
  const p = parseIsoDateParts(value)
  return p ? Date.UTC(p.y, p.m - 1, p.d) / 86_400_000 : null
}

function fromDayNumber(n: number): string {
  const date = new Date(n * 86_400_000)
  return `${String(date.getUTCFullYear()).padStart(4, '0')}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`
}

/** YYYY-MM-DD plus `days` (negative to go back). '' when the input is not a date. */
export function addDaysIso(value: string | null | undefined, days: number): string {
  const n = dayNumber(value)
  return n == null ? '' : fromDayNumber(n + days)
}

/**
 * YYYY-MM-DD plus `months`, clamping the day to the end of the target month
 * (31 Jan + 1 month = 28/29 Feb, not 2/3 Mar). '' when the input is not a date.
 */
export function addMonthsIso(value: string | null | undefined, months: number): string {
  const p = parseIsoDateParts(value)
  if (!p) return ''
  const first = new Date(Date.UTC(p.y, p.m - 1 + months, 1))
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  first.setUTCDate(Math.min(p.d, lastDay))
  return fromDayNumber(first.getTime() / 86_400_000)
}

/** Calendar days from `from` to `to` (to − from). null if either is not a date. */
export function diffDaysIso(from: string | null | undefined, to: string | null | undefined): number | null {
  const a = dayNumber(from)
  const b = dayNumber(to)
  return a == null || b == null ? null : b - a
}

/** Days from today (local) until `value`; negative once it has passed. null if not a date. */
export function daysUntilIso(value: string | null | undefined, today: string = todayLocalIso()): number | null {
  return diffDaysIso(today, value)
}

/**
 * Local calendar date of a timestamp (timestamptz string such as "2026-10-29T20:00:00+00:00",
 * which is 30 Oct in India). A bare YYYY-MM-DD is returned unchanged. '' if unparseable.
 */
export function timestampToLocalIsoDate(value: string | null | undefined): string {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const t = Date.parse(raw)
  return Number.isNaN(t) ? '' : toLocalIsoDate(new Date(t))
}

/**
 * Normalise what a date field holds before saving: '' stays '', a valid date is kept, a two-digit
 * year typed as 00YY becomes 20YY, anything else (year 0202, 20266, garbage) returns null so the
 * caller can reject it.
 */
export function normalizeDateFieldValue(value: string | null | undefined): string | null {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const p = parseIsoDateParts(raw)
  if (!p || raw.length > 10 + 2) return null
  let y = p.y
  if (y >= 0 && y < 100) y += 2000
  if (y < MIN_DATE_YEAR || y > MAX_DATE_YEAR) return null
  const iso = `${y}-${pad2(p.m)}-${pad2(p.d)}`
  return parseIsoDateParts(iso) ? iso : null
}
