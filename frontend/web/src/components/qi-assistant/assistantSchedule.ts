// Same rules as backend/services/functions/assistantSchedule.mjs (India time, UTC+05:30): used to resume a paused
// task and to describe schedules in the Scheduled Tasks view.

const IST_OFFSET_MS = 330 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export type TaskSchedule = {
  schedule_kind: 'once' | 'daily' | 'weekly' | 'hourly'
  run_at: string | null
  time_of_day: string | null
  weekdays: number[] | null
  every_hours: number | null
}

export function nextRunAt(task: TaskSchedule, from = new Date()): Date | null {
  if (task.schedule_kind === 'once') {
    const at = task.run_at ? new Date(task.run_at) : null
    return at && at.getTime() > from.getTime() ? at : null
  }
  if (task.schedule_kind === 'hourly') {
    const hours = Number(task.every_hours) || 0
    return hours >= 1 ? new Date(from.getTime() + hours * 3_600_000) : null
  }
  const m = String(task.time_of_day ?? '').match(/^([01]?\d|2[0-3]):([0-5]\d)$/)
  if (!m) return null
  const mins = Number(m[1]) * 60 + Number(m[2])
  const days = task.schedule_kind === 'weekly' ? task.weekdays ?? [] : [0, 1, 2, 3, 4, 5, 6]
  const ist = new Date(from.getTime() + IST_OFFSET_MS)
  const base = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET_MS
  for (let d = 0; d <= 7; d += 1) {
    const at = base + d * DAY_MS + mins * 60_000
    if (at > from.getTime() && days.includes(new Date(at + IST_OFFSET_MS).getUTCDay())) return new Date(at)
  }
  return null
}

export function describeSchedule(task: TaskSchedule): string {
  if (task.schedule_kind === 'once') return `Once, ${formatIst(task.run_at)}`
  if (task.schedule_kind === 'hourly') return `Every ${task.every_hours} Hour${Number(task.every_hours) === 1 ? '' : 's'}`
  if (task.schedule_kind === 'daily') return `Daily at ${task.time_of_day}`
  return `${(task.weekdays ?? []).map((d) => WEEKDAY_NAMES[d]).join(', ')} at ${task.time_of_day}`
}

export function formatIst(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
