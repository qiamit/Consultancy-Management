import type { UncertaintyCalculationData } from './testParameterUncertainty'
import { parseUncertaintyCalculationData } from './testParameterUncertainty'
import { todayLocalIso } from '@/lib/localDate'

export type UncertaintyHistoryRecord = {
  id: string
  recordedAt: string
  uncertaintyMu: string
  calculationData: UncertaintyCalculationData | null
  savedByName: string
}

export function newUncertaintyHistoryId(): string {
  return `uh-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function parseUncertaintyMuHistory(value: unknown): UncertaintyHistoryRecord[] {
  if (!Array.isArray(value)) return []
  const out: UncertaintyHistoryRecord[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const uncertaintyMu = String(row.uncertaintyMu ?? row.uncertainty_mu ?? '').trim()
    const recordedAt = String(row.recordedAt ?? row.recorded_at ?? '').trim()
    if (!uncertaintyMu || !recordedAt) continue
    const calcRaw = row.calculationData ?? row.calculation_data ?? null
    out.push({
      id: String(row.id ?? newUncertaintyHistoryId()),
      recordedAt,
      uncertaintyMu,
      calculationData: parseUncertaintyCalculationData(calcRaw, '') ?? null,
      savedByName: String(row.savedByName ?? row.saved_by_name ?? '').trim(),
    })
  }
  return out
}

export function sortUncertaintyHistoryNewestFirst(
  records: UncertaintyHistoryRecord[],
): UncertaintyHistoryRecord[] {
  return [...records].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
}

export function todayIsoDate(): string {
  return todayLocalIso()
}
