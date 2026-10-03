export type IntermediateCheckReadingItem = {
  checkPointValue: string
  std: string
  obs: string
}

export type IntermediateCheckMasterSnapshot = {
  id: string
  equipmentName: string
  assetCode: string
  rangeCapacity: string
  resolutionLeastCount: string
  acceptanceCriteria: string
  calibrationFrequency: string
  lastCalibrationDate: string
  certificateNumber: string
  nextCalibrationDue: string
}

export type IntermediateCheckHistoryRecord = {
  id: string
  conductedOn: string
  doneBy: string
  doneByName: string
  status: 'Satisfactory' | 'Unsatisfactory' | 'N/A'
  resultSummary: string
  readings: IntermediateCheckReadingItem[]
  nextDueDate: string
  temperature: string
  humidity: string
  masters: IntermediateCheckMasterSnapshot[]
}

export const INTERMEDIATE_CHECK_HISTORY_YEARS = 3
export const DEFAULT_INTERMEDIATE_TEMPERATURE = '27'
export const DEFAULT_INTERMEDIATE_HUMIDITY = '65'

export function newIntermediateCheckHistoryId(): string {
  return `ich-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function normalizeReading(row: unknown): IntermediateCheckReadingItem | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  return {
    checkPointValue: String(r.checkPointValue ?? r.checkPoint ?? r.checkpoint ?? '').trim(),
    std: String(r.std ?? '').trim(),
    obs: String(r.obs ?? '').trim(),
  }
}

function normalizeMasterSnapshot(row: unknown): IntermediateCheckMasterSnapshot | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  const id = String(r.id ?? '').trim()
  if (!id) return null
  return {
    id,
    equipmentName: String(r.equipmentName ?? r.equipment_name ?? '').trim(),
    assetCode: String(r.assetCode ?? r.asset_code ?? '').trim(),
    rangeCapacity: String(r.rangeCapacity ?? r.range_capacity ?? '').trim(),
    resolutionLeastCount: String(r.resolutionLeastCount ?? r.resolution_least_count ?? '').trim(),
    acceptanceCriteria: String(
      r.acceptanceCriteria ?? r.accuracy_acceptance_criteria ?? '',
    ).trim(),
    calibrationFrequency: String(r.calibrationFrequency ?? r.calibration_frequency ?? '').trim(),
    lastCalibrationDate: String(r.lastCalibrationDate ?? r.last_calibration_date ?? '').trim(),
    certificateNumber: String(
      r.certificateNumber ?? r.calibration_certificate_number ?? '',
    ).trim(),
    nextCalibrationDue: String(r.nextCalibrationDue ?? r.next_calibration_due ?? '').trim(),
  }
}

export function buildIntermediateCheckMasterSnapshots(
  masterIds: string[],
  iqcMasters: Array<Record<string, unknown>>,
): IntermediateCheckMasterSnapshot[] {
  const out: IntermediateCheckMasterSnapshot[] = []
  for (const id of masterIds) {
    const eq = iqcMasters.find((master) => String(master.id) === id)
    if (!eq) continue
    out.push({
      id,
      equipmentName: String(eq.equipment_name ?? '').trim(),
      assetCode: String(eq.asset_code ?? '').trim(),
      rangeCapacity: String(eq.range_capacity ?? '').trim(),
      resolutionLeastCount: String(eq.resolution_least_count ?? '').trim(),
      acceptanceCriteria: String(eq.accuracy_acceptance_criteria ?? '').trim(),
      calibrationFrequency: String(eq.calibration_frequency ?? '').trim(),
      lastCalibrationDate: String(eq.last_calibration_date ?? '').trim(),
      certificateNumber: String(eq.calibration_certificate_number ?? '').trim(),
      nextCalibrationDue: String(eq.next_calibration_due ?? '').trim(),
    })
  }
  return out
}

export function parseIntermediateCheckResultPayload(text: string): {
  summaryLine: string
  status: 'Satisfactory' | 'Unsatisfactory' | 'N/A'
  readings: IntermediateCheckReadingItem[]
  doneBy: string
  masterIds: string[]
  temperature: string
  humidity: string
} {
  const summaryLine = text.split('\n')[0]?.trim() || ''
  const match = text.match(/\[DATA:([\s\S]+)\]/)
  if (!match) {
    return {
      summaryLine,
      status: 'N/A',
      readings: [],
      doneBy: '',
      masterIds: [],
      temperature: DEFAULT_INTERMEDIATE_TEMPERATURE,
      humidity: DEFAULT_INTERMEDIATE_HUMIDITY,
    }
  }

  try {
    const parsed = JSON.parse(match[1]) as Record<string, unknown>
    const readings = Array.isArray(parsed.readings)
      ? parsed.readings
          .map(normalizeReading)
          .filter((row): row is IntermediateCheckReadingItem => row !== null)
      : []
    const statusRaw = String(parsed.status ?? 'N/A')
    const status: IntermediateCheckHistoryRecord['status'] =
      statusRaw === 'Satisfactory' || statusRaw === 'Unsatisfactory' ? statusRaw : 'N/A'
    const masterIds = Array.isArray(parsed.masters)
      ? parsed.masters.map((id) => String(id)).filter(Boolean)
      : []

    return {
      summaryLine,
      status,
      readings,
      doneBy: String(parsed.doneBy ?? '').trim(),
      masterIds,
      temperature:
        String(parsed.temperature ?? '').trim() || DEFAULT_INTERMEDIATE_TEMPERATURE,
      humidity: String(parsed.humidity ?? '').trim() || DEFAULT_INTERMEDIATE_HUMIDITY,
    }
  } catch {
    return {
      summaryLine,
      status: 'N/A',
      readings: [],
      doneBy: '',
      masterIds: [],
      temperature: DEFAULT_INTERMEDIATE_TEMPERATURE,
      humidity: DEFAULT_INTERMEDIATE_HUMIDITY,
    }
  }
}

export function createIntermediateCheckHistoryRecord(params: {
  conductedOn: string
  doneBy: string
  doneByName: string
  intermediateCheckResult: string
  nextDueDate: string
  iqcMasters?: Array<Record<string, unknown>>
}): IntermediateCheckHistoryRecord | null {
  const payload = parseIntermediateCheckResultPayload(params.intermediateCheckResult)
  if (!params.conductedOn.trim() || payload.readings.length === 0) return null

  const masters =
    params.iqcMasters && params.iqcMasters.length > 0
      ? buildIntermediateCheckMasterSnapshots(payload.masterIds, params.iqcMasters)
      : []

  return {
    id: newIntermediateCheckHistoryId(),
    conductedOn: params.conductedOn.trim(),
    doneBy: params.doneBy.trim() || payload.doneBy,
    doneByName: params.doneByName.trim(),
    status: payload.status,
    resultSummary: payload.summaryLine,
    readings: payload.readings,
    nextDueDate: params.nextDueDate.trim(),
    temperature: payload.temperature,
    humidity: payload.humidity,
    masters,
  }
}

export function parseIntermediateCheckHistoryFromDb(
  value: unknown,
): IntermediateCheckHistoryRecord[] {
  if (!Array.isArray(value)) return []
  const out: IntermediateCheckHistoryRecord[] = []

  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const conductedOn = String(row.conductedOn ?? row.conducted_on ?? '').trim()
    if (!conductedOn) continue

    const readingsRaw = row.readings
    const readings: IntermediateCheckReadingItem[] = []
    if (Array.isArray(readingsRaw)) {
      for (const reading of readingsRaw) {
        const normalized = normalizeReading(reading)
        if (normalized) readings.push(normalized)
      }
    }

    if (readings.length === 0 && row.intermediateCheckResult) {
      const parsed = parseIntermediateCheckResultPayload(String(row.intermediateCheckResult))
      readings.push(...parsed.readings)
    }

    if (readings.length === 0) continue

    const mastersRaw = row.masters
    const masters: IntermediateCheckMasterSnapshot[] = []
    if (Array.isArray(mastersRaw)) {
      for (const master of mastersRaw) {
        const normalized = normalizeMasterSnapshot(master)
        if (normalized) masters.push(normalized)
      }
    }

    const statusRaw = String(row.status ?? 'N/A')
    const status: IntermediateCheckHistoryRecord['status'] =
      statusRaw === 'Satisfactory' || statusRaw === 'Unsatisfactory' ? statusRaw : 'N/A'

    out.push({
      id: String(row.id ?? newIntermediateCheckHistoryId()),
      conductedOn,
      doneBy: String(row.doneBy ?? row.done_by ?? '').trim(),
      doneByName: String(row.doneByName ?? row.done_by_name ?? '').trim(),
      status,
      resultSummary: String(row.resultSummary ?? row.result_summary ?? '').trim(),
      readings,
      nextDueDate: String(row.nextDueDate ?? row.next_due_date ?? '').trim(),
      temperature:
        String(row.temperature ?? '').trim() || DEFAULT_INTERMEDIATE_TEMPERATURE,
      humidity: String(row.humidity ?? '').trim() || DEFAULT_INTERMEDIATE_HUMIDITY,
      masters,
    })
  }

  return out
}

export function sortIntermediateCheckHistoryNewestFirst(
  records: IntermediateCheckHistoryRecord[],
): IntermediateCheckHistoryRecord[] {
  return [...records].sort((a, b) => b.conductedOn.localeCompare(a.conductedOn))
}

export function isDateWithinLastYears(dateStr: string, years = INTERMEDIATE_CHECK_HISTORY_YEARS): boolean {
  if (!dateStr.trim()) return false
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return false
  const cutoff = new Date()
  cutoff.setFullYear(cutoff.getFullYear() - years)
  return date >= cutoff
}

export function filterIntermediateCheckHistoryLastYears(
  records: IntermediateCheckHistoryRecord[],
  years = INTERMEDIATE_CHECK_HISTORY_YEARS,
): IntermediateCheckHistoryRecord[] {
  return records.filter((record) => isDateWithinLastYears(record.conductedOn, years))
}
