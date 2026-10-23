/** Local stubs for intermediate-check encode/decode (APP-S07). */

import type { CalibrationPointRow, CalibrationPointsColumn } from './types'
import { emptyCalibrationPointRow, emptyCalibrationPointsColumn } from './types'

export type IntermediateCheckReading = {
  std: string
  obs: string
  error?: string
}

export type IntermediateCheckDraft = {
  doneBy: string
  envColumns: CalibrationPointsColumn[]
  envRows: CalibrationPointRow[]
  checkColumns: CalibrationPointsColumn[]
  checkRows: CalibrationPointRow[]
  readings: IntermediateCheckReading[]
  masterIds: string[]
}

export function decodeIntermediateCheckResult(
  text: string | null | undefined,
  doneByFallback = '',
): IntermediateCheckDraft {
  const empty: IntermediateCheckDraft = {
    doneBy: doneByFallback,
    envColumns: [],
    envRows: [],
    checkColumns: [],
    checkRows: [],
    readings: [],
    masterIds: [],
  }
  const raw = String(text || '').trim()
  if (!raw) return empty
  try {
    const match = raw.match(/\[ICDATA:(\{[\s\S]*\})\]/)
    if (!match) return empty
    const parsed = JSON.parse(match[1]) as Partial<IntermediateCheckDraft>
    return {
      ...empty,
      ...parsed,
      doneBy: String(parsed.doneBy || doneByFallback),
      envColumns: Array.isArray(parsed.envColumns) ? parsed.envColumns : [],
      envRows: Array.isArray(parsed.envRows) ? parsed.envRows : [],
      checkColumns: Array.isArray(parsed.checkColumns) ? parsed.checkColumns : [],
      checkRows: Array.isArray(parsed.checkRows) ? parsed.checkRows : [],
      readings: Array.isArray(parsed.readings) ? parsed.readings : [],
      masterIds: Array.isArray(parsed.masterIds) ? parsed.masterIds.map(String) : [],
    }
  } catch {
    return empty
  }
}

export function encodeIntermediateCheckResult(
  draft: IntermediateCheckDraft,
  _acceptanceCriteria?: string,
): string {
  const summary =
    draft.readings.length > 0
      ? `Intermediate check: ${draft.readings.length} reading(s)`
      : 'Intermediate check draft'
  return `${summary}\n[ICDATA:${JSON.stringify(draft)}]`
}

export function hasValidIntermediateReading(readings: IntermediateCheckReading[]): boolean {
  return readings.some((r) => String(r.std || '').trim() !== '' || String(r.obs || '').trim() !== '')
}

export function readingsFromCheckTable(
  columns: CalibrationPointsColumn[],
  rows: CalibrationPointRow[],
): IntermediateCheckReading[] {
  const stdCol = columns.find((c) => /std/i.test(c.label)) ?? columns[0]
  const obsCol = columns.find((c) => /obs/i.test(c.label)) ?? columns[1] ?? columns[0]
  if (!stdCol) return []
  return rows.map((row) => ({
    std: String(row[stdCol.id] ?? ''),
    obs: String(row[obsCol?.id ?? stdCol.id] ?? ''),
  }))
}

export function ensureEnvDefaults(draft: IntermediateCheckDraft): IntermediateCheckDraft {
  if (draft.envColumns.length > 0) return draft
  const columns = [
    emptyCalibrationPointsColumn('Temperature (°C)', 'number'),
    emptyCalibrationPointsColumn('Humidity (% RH)', 'number'),
  ]
  return { ...draft, envColumns: columns, envRows: [emptyCalibrationPointRow(columns)] }
}
