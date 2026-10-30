/** Number, money and month helpers for the dashboard (Indian grouping, ₹). */

const countFormatter = new Intl.NumberFormat('en-IN')

export function formatCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return countFormatter.format(value)
}

const inrFull = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

/** ₹5,90,000 */
export function formatInr(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return inrFull.format(value)
}

/** ₹5.9 L, ₹1.2 Cr, ₹75K — for axes and compact tiles. */
export function formatInrCompact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  const trim = (n: number) => n.toFixed(n >= 100 ? 0 : 1).replace(/\.0$/, '')
  if (abs >= 1_00_00_000) return `${sign}₹${trim(abs / 1_00_00_000)} Cr`
  if (abs >= 1_00_000) return `${sign}₹${trim(abs / 1_00_000)} L`
  if (abs >= 1_000) return `${sign}₹${trim(abs / 1_000)}K`
  return `${sign}₹${countFormatter.format(Math.round(abs))}`
}

/** Positive / negative difference with a sign, e.g. "+4" or "−2". */
export function formatSignedCount(value: number): string {
  if (value > 0) return `+${countFormatter.format(value)}`
  if (value < 0) return `−${countFormatter.format(Math.abs(value))}`
  return '0'
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** `YYYY-MM` for a local date. */
export function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/** "Nov '26" from `2026-11`. */
export function monthShortLabel(key: string): string {
  const [y, m] = key.split('-')
  const idx = Number(m) - 1
  return `${MONTHS[idx] ?? m} '${(y ?? '').slice(2)}`
}

/** "November 2026" from `2026-11`. */
export function monthLongLabel(key: string): string {
  const [y, m] = key.split('-')
  const date = new Date(Number(y), Number(m) - 1, 1)
  if (Number.isNaN(date.getTime())) return key
  return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

/**
 * Consecutive month keys starting `offset` months from the month of `today`.
 * monthKeys('2026-10-30', 0, 12) → 2026-10 … 2027-09; monthKeys(today, -11, 12) → the last 12 months.
 */
export function monthKeys(todayIso: string, offset: number, count: number): string[] {
  const [y, m] = todayIso.slice(0, 7).split('-').map(Number)
  const keys: string[] = []
  for (let i = 0; i < count; i += 1) {
    keys.push(monthKeyOf(new Date(y, m - 1 + offset + i, 1)))
  }
  return keys
}

/** First day (YYYY-MM-DD) of a `YYYY-MM` month key. */
export function monthStartIso(key: string): string {
  return `${key}-01`
}

/** Whole days from `todayIso` to `dateIso` (negative when past). */
export function daysBetween(todayIso: string, dateIso: string): number {
  const a = new Date(`${todayIso.slice(0, 10)}T00:00:00`)
  const b = new Date(`${dateIso.slice(0, 10)}T00:00:00`)
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

/** "Today", "Tomorrow", "In 12 Days", "3 Days Ago". */
export function daysLeftLabel(days: number): string {
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'
  if (days > 0) return `In ${days} Days`
  return `${Math.abs(days)} Days Ago`
}

/** "2 Hours Ago", "3 Days Ago" for an ISO timestamp. */
export function relativeTimeLabel(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '—'
  const mins = Math.max(0, Math.round((now - t) / 60_000))
  if (mins < 1) return 'Just Now'
  if (mins < 60) return `${mins} Min Ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} ${hours === 1 ? 'Hour' : 'Hours'} Ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} ${days === 1 ? 'Day' : 'Days'} Ago`
  const months = Math.round(days / 30)
  if (months < 12) return `${months} ${months === 1 ? 'Month' : 'Months'} Ago`
  const years = Math.round(months / 12)
  return `${years} ${years === 1 ? 'Year' : 'Years'} Ago`
}
