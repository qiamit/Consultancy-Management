// Next run time of a QE Assistant scheduled task. Times of day are India time (IST, UTC+05:30, no DST).

const IST_OFFSET_MS = 330 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const WEEKDAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

/** Weekday numbers (0 = Sunday) from numbers or names ("mon", "Monday", "सोम" is not supported). */
export function parseWeekdays(value) {
  const list = Array.isArray(value) ? value : String(value ?? '').split(/[\s,]+/)
  const out = new Set()
  for (const raw of list) {
    if (raw === '' || raw == null) continue
    const n = Number(raw)
    if (Number.isInteger(n) && n >= 0 && n <= 6) out.add(n)
    else {
      const i = WEEKDAY_NAMES.indexOf(String(raw).trim().toLowerCase().slice(0, 3))
      if (i >= 0) out.add(i)
    }
  }
  return [...out].sort()
}

/** "YYYY-MM-DD HH:MM" (IST) or an ISO time → Date; null when unreadable. */
export function parseIstDateTime(value) {
  const s = String(value ?? '').trim()
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/)
  if (m) {
    const utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - IST_OFFSET_MS
    return Number.isFinite(utc) ? new Date(utc) : null
  }
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

function istMidnightUtc(from) {
  const ist = new Date(from.getTime() + IST_OFFSET_MS)
  return Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET_MS
}

function minutesOf(timeOfDay) {
  const m = String(timeOfDay ?? '').match(/^([01]?\d|2[0-3]):([0-5]\d)$/)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/** The first run after `from`, or null (a "once" task already past, or an incomplete schedule). */
export function nextRunAt(task, from = new Date()) {
  const kind = String(task.schedule_kind || '')
  if (kind === 'once') {
    const at = task.run_at ? new Date(task.run_at) : null
    return at && at.getTime() > from.getTime() ? at : null
  }
  if (kind === 'hourly') {
    const hours = Number(task.every_hours) || 0
    return hours >= 1 ? new Date(from.getTime() + hours * 60 * 60 * 1000) : null
  }
  const mins = minutesOf(task.time_of_day)
  if (mins == null) return null
  const days = kind === 'weekly' ? parseWeekdays(task.weekdays) : [0, 1, 2, 3, 4, 5, 6]
  if (!days.length || (kind !== 'daily' && kind !== 'weekly')) return null
  const base = istMidnightUtc(from)
  for (let d = 0; d <= 7; d += 1) {
    const at = base + d * DAY_MS + mins * 60 * 1000
    const weekday = new Date(at + IST_OFFSET_MS).getUTCDay()
    if (at > from.getTime() && days.includes(weekday)) return new Date(at)
  }
  return null
}

/** Short English description of a schedule, e.g. "Daily at 09:00 IST". */
export function describeSchedule(task) {
  const kind = String(task.schedule_kind || '')
  if (kind === 'once') return `Once at ${task.run_at ? new Date(task.run_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '—'} IST`
  if (kind === 'hourly') return `Every ${task.every_hours} hour${Number(task.every_hours) === 1 ? '' : 's'}`
  if (kind === 'daily') return `Daily at ${task.time_of_day} IST`
  const names = parseWeekdays(task.weekdays).map((d) => WEEKDAY_NAMES[d][0].toUpperCase() + WEEKDAY_NAMES[d].slice(1))
  return `Every ${names.join(', ')} at ${task.time_of_day} IST`
}
