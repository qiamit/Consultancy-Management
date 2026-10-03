/** Lab Settings date/time display preferences (view layer). Input fields stay ISO/native. */

export const APP_DATE_FORMAT_STORAGE_KEY = 'consultancy.appDateFormat'
export const APP_TIME_FORMAT_STORAGE_KEY = 'consultancy.appTimeFormat'

export const DEFAULT_APP_DATE_FORMAT = 'dd-mmm-yy'
export const DEFAULT_APP_TIME_FORMAT = '24h'

export type AppTimeFormatId = '24h' | '12h'

export const BUILTIN_TIME_FORMAT_OPTIONS: Array<{ value: AppTimeFormatId; label: string }> = [
  { value: '24h', label: '24 Hour (HH:MM)' },
  { value: '12h', label: '12 Hour (hh:MM AM/PM)' },
]

export const BUILTIN_DATE_FORMAT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'dd-mmm-yy', label: 'DD-Mmm-YY' },
  { value: 'dd-mmm-yyyy', label: 'DD-Mmm-YYYY' },
  { value: 'dd/mm/yyyy', label: 'DD/MM/YYYY' },
  { value: 'dd-mm-yyyy', label: 'DD-MM-YYYY' },
  { value: 'dd.mm.yyyy', label: 'DD.MM.YYYY' },
  { value: 'mm/dd/yyyy', label: 'MM/DD/YYYY' },
  { value: 'mm-dd-yyyy', label: 'MM-DD-YYYY' },
  { value: 'yyyy-mm-dd', label: 'YYYY-MM-DD' },
  { value: 'yyyy/mm/dd', label: 'YYYY/MM/DD' },
  { value: 'mmm dd, yyyy', label: 'Mmm DD, YYYY' },
]

const MONTH_ABBR = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

type DateParts = {
  yyyy: string
  yy: string
  mm: string
  dd: string
  mmm: string
}

type Listener = () => void

let dateFormatPref = DEFAULT_APP_DATE_FORMAT
let timeFormatPref: AppTimeFormatId = DEFAULT_APP_TIME_FORMAT
const listeners = new Set<Listener>()

function emit() {
  listeners.forEach((l) => l())
}

export function subscribeAppDateTimeFormat(listener: Listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getAppDateFormat(): string {
  return dateFormatPref
}

export function getAppTimeFormat(): AppTimeFormatId {
  return timeFormatPref
}

export function getAppDateTimeFormatSnapshot() {
  return `${dateFormatPref}|${timeFormatPref}`
}

/** Preserve pattern tokens/separators for custom date formats. */
export function toDateFormatValue(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9/.\-, ]+/g, '')
    .trim()
}

export function normalizeAppDateFormat(value: string | null | undefined): string {
  const raw = String(value ?? '').trim()
  if (!raw) return DEFAULT_APP_DATE_FORMAT
  const lowered = toDateFormatValue(raw)
  if (!lowered) return DEFAULT_APP_DATE_FORMAT

  const aliases: Record<string, string> = {
    'dd-mmm-yy': 'dd-mmm-yy',
    'dd-mmm-yyyy': 'dd-mmm-yyyy',
    'dd/mm/yyyy': 'dd/mm/yyyy',
    'dd-mm-yyyy': 'dd-mm-yyyy',
    'dd.mm.yyyy': 'dd.mm.yyyy',
    'mm/dd/yyyy': 'mm/dd/yyyy',
    'mm-dd-yyyy': 'mm-dd-yyyy',
    'yyyy-mm-dd': 'yyyy-mm-dd',
    'yyyy/mm/dd': 'yyyy/mm/dd',
    'mmm dd, yyyy': 'mmm dd, yyyy',
    'mmm dd yyyy': 'mmm dd, yyyy',
    ddmmyyyy: 'dd/mm/yyyy',
    mmddyyyy: 'mm/dd/yyyy',
    yyyymmdd: 'yyyy-mm-dd',
    'dd-mmm-yy (e.g. 21-aug-26)': 'dd-mmm-yy',
  }
  if (aliases[lowered]) return aliases[lowered]

  // Accept any token pattern that includes day/month/year markers
  if (/(yyyy|yy)/.test(lowered) && /(mmm|mm)/.test(lowered) && /dd/.test(lowered)) {
    return lowered
  }
  return DEFAULT_APP_DATE_FORMAT
}

export function normalizeAppTimeFormat(value: string | null | undefined): AppTimeFormatId {
  const raw = String(value ?? '').trim().toLowerCase()
  if (raw === '12h' || raw.includes('12')) return '12h'
  return '24h'
}

export function persistAppDateFormat(value: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(APP_DATE_FORMAT_STORAGE_KEY, value)
  } catch {
    /* ignore */
  }
}

export function persistAppTimeFormat(value: AppTimeFormatId) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(APP_TIME_FORMAT_STORAGE_KEY, value)
  } catch {
    /* ignore */
  }
}

export function readStoredAppDateFormat(): string {
  if (typeof window === 'undefined') return DEFAULT_APP_DATE_FORMAT
  try {
    return normalizeAppDateFormat(window.localStorage.getItem(APP_DATE_FORMAT_STORAGE_KEY))
  } catch {
    return DEFAULT_APP_DATE_FORMAT
  }
}

export function readStoredAppTimeFormat(): AppTimeFormatId {
  if (typeof window === 'undefined') return DEFAULT_APP_TIME_FORMAT
  try {
    return normalizeAppTimeFormat(window.localStorage.getItem(APP_TIME_FORMAT_STORAGE_KEY))
  } catch {
    return DEFAULT_APP_TIME_FORMAT
  }
}

export function setAppDateFormat(value: string) {
  const next = normalizeAppDateFormat(value)
  if (next === dateFormatPref) {
    persistAppDateFormat(next)
    return
  }
  dateFormatPref = next
  persistAppDateFormat(next)
  emit()
}

export function setAppTimeFormat(value: string) {
  const next = normalizeAppTimeFormat(value)
  if (next === timeFormatPref) {
    persistAppTimeFormat(next)
    return
  }
  timeFormatPref = next
  persistAppTimeFormat(next)
  emit()
}

export function initAppDateTimeFormatFromStorage() {
  dateFormatPref = readStoredAppDateFormat()
  timeFormatPref = readStoredAppTimeFormat()
}

function parseDateParts(dateString: string | null | undefined): DateParts | null {
  if (!dateString?.trim()) return null
  const raw = dateString.trim()
  const iso = raw.slice(0, 10)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (m) {
    const yyyy = m[1]!
    const monthIdx = parseInt(m[2]!, 10) - 1
    const dayNum = parseInt(m[3]!, 10)
    if (monthIdx < 0 || monthIdx > 11 || dayNum < 1 || dayNum > 31) return null
    return {
      yyyy,
      yy: yyyy.slice(2),
      mm: String(monthIdx + 1).padStart(2, '0'),
      dd: String(dayNum).padStart(2, '0'),
      mmm: MONTH_ABBR[monthIdx]!,
    }
  }
  const parsed = Date.parse(raw)
  if (Number.isNaN(parsed)) return null
  const d = new Date(parsed)
  const yyyy = String(d.getFullYear())
  return {
    yyyy,
    yy: yyyy.slice(2),
    mm: String(d.getMonth() + 1).padStart(2, '0'),
    dd: String(d.getDate()).padStart(2, '0'),
    mmm: MONTH_ABBR[d.getMonth()]!,
  }
}

/** Apply a token pattern (dd, mm, mmm, yy, yyyy) to date parts. */
export function applyDateFormatPattern(parts: DateParts, pattern: string): string {
  const p = normalizeAppDateFormat(pattern)
  return p
    .replace(/yyyy/g, parts.yyyy)
    .replace(/mmm/g, parts.mmm)
    .replace(/mm/g, parts.mm)
    .replace(/dd/g, parts.dd)
    .replace(/yy/g, parts.yy)
}

/** Format for display using the active Lab Settings date format. Returns null if invalid. */
export function formatDateByPreference(
  dateString: string | null | undefined,
  pattern = getAppDateFormat(),
): string | null {
  const parts = parseDateParts(dateString)
  if (!parts) return null
  return applyDateFormatPattern(parts, pattern)
}

export function formatTimeByPreference(
  dateString: string | null | undefined,
  timeFormat = getAppTimeFormat(),
): string | null {
  if (!dateString?.trim()) return null
  const parsed = Date.parse(dateString)
  if (Number.isNaN(parsed)) return null
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: timeFormat === '12h',
  }).format(new Date(parsed))
}

// Hydrate from localStorage as early as this module loads in the browser.
if (typeof window !== 'undefined') {
  initAppDateTimeFormatFromStorage()
}
