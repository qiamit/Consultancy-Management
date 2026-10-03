import type { MaintenanceChecklistItem } from './types'

export type MaintenanceHistoryRecord = {
  id: string
  conductedOn: string
  doneBy: string
  doneByName: string
  checklist: MaintenanceChecklistItem[]
  nextDueDate: string
}

export function newMaintenanceHistoryId(): string {
  return `mh-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function parseMaintenanceHistoryFromDb(value: unknown): MaintenanceHistoryRecord[] {
  if (!Array.isArray(value)) return []
  const out: MaintenanceHistoryRecord[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const checklistRaw = row.checklist
    const checklist: MaintenanceChecklistItem[] = []
    if (Array.isArray(checklistRaw)) {
      for (const cp of checklistRaw) {
        if (!cp || typeof cp !== 'object') continue
        const c = cp as Record<string, unknown>
        const checkPoint = String(c.checkPoint ?? c.checkpoint ?? '').trim()
        if (!checkPoint) continue
        const statusRaw = String(c.status ?? 'OK').trim().toLowerCase()
        checklist.push({
          checkPoint,
          status: statusRaw === 'not ok' || statusRaw === 'notok' ? 'Not OK' : 'OK',
          repairIfAny: String(c.repairIfAny ?? c.repair_if_any ?? '').trim(),
        })
      }
    }
    const conductedOn = String(row.conductedOn ?? row.conducted_on ?? '').trim()
    if (!conductedOn || checklist.length === 0) continue
    out.push({
      id: String(row.id ?? newMaintenanceHistoryId()),
      conductedOn,
      doneBy: String(row.doneBy ?? row.done_by ?? '').trim(),
      doneByName: String(row.doneByName ?? row.done_by_name ?? '').trim(),
      checklist,
      nextDueDate: String(row.nextDueDate ?? row.next_due_date ?? '').trim(),
    })
  }
  return out
}

export function sortMaintenanceHistoryNewestFirst(
  records: MaintenanceHistoryRecord[],
): MaintenanceHistoryRecord[] {
  return [...records].sort((a, b) => b.conductedOn.localeCompare(a.conductedOn))
}
