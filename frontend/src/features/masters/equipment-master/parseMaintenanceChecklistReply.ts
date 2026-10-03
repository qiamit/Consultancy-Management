import {
  defaultRepairForStatus,
  REPAIR_DEFAULT_NOT_OK,
  REPAIR_DEFAULT_OK,
  type MaintenanceCheckpointRow,
  type MaintenanceCheckpointStatus,
} from './maintenanceChecklist'

export type ParsedMaintenanceCheckpoint = {
  checkPoint: string
  status: MaintenanceCheckpointStatus
  repairIfAny: string
}

function newRowKey(): string {
  return `cp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function normalizeStatus(value: unknown): MaintenanceCheckpointStatus {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase()
  if (raw === 'not ok' || raw === 'notok' || raw === 'fail' || raw === 'failed' || raw === 'ng') {
    return 'Not OK'
  }
  return 'OK'
}

function normalizeRepair(status: MaintenanceCheckpointStatus, repairRaw: string): string {
  const repair = repairRaw.trim()
  if (status === 'OK') {
    if (!repair || repair === REPAIR_DEFAULT_NOT_OK) return REPAIR_DEFAULT_OK
    return repair
  }
  if (!repair || repair === REPAIR_DEFAULT_OK) return REPAIR_DEFAULT_NOT_OK
  return repair
}

function extractJsonPayload(reply: string): unknown | null {
  const fenced = reply.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = (fenced?.[1] ?? reply).trim()
  if (!candidate) return null

  try {
    return JSON.parse(candidate)
  } catch {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1))
      } catch {
        return null
      }
    }
    const arrStart = candidate.indexOf('[')
    const arrEnd = candidate.lastIndexOf(']')
    if (arrStart >= 0 && arrEnd > arrStart) {
      try {
        return JSON.parse(candidate.slice(arrStart, arrEnd + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

function asCheckpointList(payload: unknown): unknown[] | null {
  if (Array.isArray(payload)) return payload
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>
    for (const key of ['checkpoints', 'checklist', 'items', 'rows']) {
      if (Array.isArray(obj[key])) return obj[key] as unknown[]
    }
  }
  return null
}

function mapItem(item: unknown): ParsedMaintenanceCheckpoint | null {
  if (!item || typeof item !== 'object') return null
  const row = item as Record<string, unknown>
  const checkPoint = String(
    row.checkPoint ?? row.checkpoint ?? row.check_point ?? row.name ?? row.title ?? '',
  ).trim()
  if (!checkPoint) return null
  const status = normalizeStatus(row.status ?? row.result)
  const repairRaw = String(
    row.repairIfAny ?? row.repair_if_any ?? row.repair ?? row.remarks ?? '',
  ).trim()
  return {
    checkPoint,
    status,
    repairIfAny: normalizeRepair(status, repairRaw),
  }
}

/** Parse AI reply JSON into checklist rows. Returns null if no usable checklist found. */
export function parseMaintenanceChecklistReply(reply: string): MaintenanceCheckpointRow[] | null {
  const payload = extractJsonPayload(reply)
  if (!payload) return null
  const list = asCheckpointList(payload)
  if (!list || list.length === 0) return null

  const parsed = list.map(mapItem).filter((row): row is ParsedMaintenanceCheckpoint => row != null)
  if (parsed.length === 0) return null

  return parsed.map((item) => ({
    key: newRowKey(),
    selected: true,
    checkPoint: item.checkPoint,
    status: item.status,
    repairIfAny: item.repairIfAny || defaultRepairForStatus(item.status),
  }))
}

export function buildConductMaintenanceGenerateContext(
  equipment: {
    equipmentName?: string
    assetCode?: string
    manufacturer?: string
    modelNumber?: string
    rangeCapacity?: string
  },
): string {
  const lines = [
    'Module: Equipment Master — Conduct Maintenance checklist (auto-generate)',
    `Equipment name: ${equipment.equipmentName?.trim() || '(unnamed)'}`,
    equipment.assetCode?.trim() ? `Asset code: ${equipment.assetCode.trim()}` : '',
    equipment.manufacturer?.trim() ? `Manufacturer: ${equipment.manufacturer.trim()}` : '',
    equipment.modelNumber?.trim() ? `Model: ${equipment.modelNumber.trim()}` : '',
    equipment.rangeCapacity?.trim() ? `Range / capacity: ${equipment.rangeCapacity.trim()}` : '',
    '',
    'Task: Create a preventive maintenance checklist specific to this equipment.',
    'Requirements:',
    '- At least 10 distinct maintenance check points',
    '- Every check point status must be "OK"',
    `- Every check point repairIfAny must be "${REPAIR_DEFAULT_OK}"`,
    '- Check point text must be clear, professional English (proper grammar and capitalization)',
    '- Check points must be relevant to this equipment type (not generic filler)',
    '- Cover safety, cleanliness, mechanical/electrical condition, calibration/indication, lubrication, fasteners, accessories, and operational checks as applicable',
    '',
    'Respond with ONE short confirmation sentence, then ONLY this JSON shape:',
    '```json',
    '{',
    '  "checkpoints": [',
    `    { "checkPoint": "Example check point text", "status": "OK", "repairIfAny": "${REPAIR_DEFAULT_OK}" }`,
    '  ]',
    '}',
    '```',
  ]

  return lines.filter((line) => line.length > 0).join('\n')
}
