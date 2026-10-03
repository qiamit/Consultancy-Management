import type { MaintenanceHistoryRecord } from './maintenanceHistory'
import type { IntermediateCheckHistoryRecord } from './intermediateCheckHistory'

export type EquipmentStatus = 'Active' | 'In Repair' | 'Idle'

export type Frequency = 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Half Yearly' | 'Yearly' | ''

export type MaintenanceChecklistItem = {
  checkPoint: string
  status: 'OK' | 'Not OK'
  repairIfAny: string
}

export type { MaintenanceHistoryRecord } from './maintenanceHistory'
export type { IntermediateCheckHistoryRecord } from './intermediateCheckHistory'

export type EquipmentRow = {
  id: string
  asset_code: string
  equipment_name: string
  manufacturer: string | null
  model_number: string | null
  serial_number: string | null
  date_of_purchase: string | null
  purchased_from: string | null
  date_placed_in_service: string | null
  current_location: string | null
  equipment_status: string | null
  range_capacity: string | null
  resolution_least_count: string | null
  accuracy_acceptance_criteria: string | null
  calibration_frequency: string | null
  last_calibration_date: string | null
  next_calibration_due: string | null
  calibration_certificate_number: string | null
  calibration_certificate_uncertainty: string | null
  calibration_uncertainty_unit: string | null
  calibration_coverage_factor: string | null
  external_calibration_agency: string | null
  intermediate_check_frequency: string | null
  last_intermediate_check_date: string | null
  next_intermediate_check_date: string | null
  intermediate_check_result: string | null
  intermediate_check_history: IntermediateCheckHistoryRecord[] | null
  maintenance_schedule_frequency: string | null
  last_maintenance_date: string | null
  next_maintenance_date: string | null
  maintenance_done_by: string | null
  maintenance_checklist: MaintenanceChecklistItem[] | null
  maintenance_history: MaintenanceHistoryRecord[] | null
  history_of_damage: string | null
  upload_certificate_path: string | null
  upload_manual_sop_path: string | null
  custodian_employee_id: string | null
  created_at?: string
  updated_at?: string
}

export type EquipmentForm = {
  assetCode: string
  equipmentName: string
  manufacturer: string
  modelNumber: string
  serialNumber: string
  dateOfPurchase: string
  purchasedFrom: string
  datePlacedInService: string
  currentLocation: string
  equipmentStatus: EquipmentStatus
  rangeCapacity: string
  rangeCapacityUnit: string
  resolutionLeastCount: string
  resolutionLeastCountUnit: string
  accuracyAcceptanceCriteria: string
  accuracyAcceptanceCriteriaUnit: string
  calibrationFrequency: Frequency
  lastCalibrationDate: string
  nextCalibrationDue: string
  calibrationCertificateNumber: string
  calibrationCertificateUncertainty: string
  calibrationUncertaintyUnit: string
  calibrationCoverageFactor: string
  externalCalibrationAgency: string
  intermediateCheckFrequency: Frequency
  lastIntermediateCheckDate: string
  nextIntermediateCheckDate: string
  intermediateCheckResult: string
  intermediateCheckHistory: IntermediateCheckHistoryRecord[]
  maintenanceScheduleFrequency: Frequency
  lastMaintenanceDate: string
  nextMaintenanceDate: string
  maintenanceDoneBy: string
  maintenanceChecklist: MaintenanceChecklistItem[]
  maintenanceHistory: MaintenanceHistoryRecord[]
  historyOfDamage: string
  uploadCertificatePath: string
  uploadManualSopPath: string
  custodianEmployeeId: string
  certificateFile: File | null
  manualSopFile: File | null
}

export const emptyEquipmentForm = (): EquipmentForm => ({
  assetCode: '',
  equipmentName: '',
  manufacturer: '',
  modelNumber: '',
  serialNumber: '',
  dateOfPurchase: '',
  purchasedFrom: '',
  datePlacedInService: '',
  currentLocation: '',
  equipmentStatus: 'Active',
  rangeCapacity: '',
  rangeCapacityUnit: '',
  resolutionLeastCount: '',
  resolutionLeastCountUnit: '',
  accuracyAcceptanceCriteria: '',
  accuracyAcceptanceCriteriaUnit: '',
  calibrationFrequency: '',
  lastCalibrationDate: '',
  nextCalibrationDue: '',
  calibrationCertificateNumber: '',
  calibrationCertificateUncertainty: '',
  calibrationUncertaintyUnit: '',
  calibrationCoverageFactor: '',
  externalCalibrationAgency: '',
  intermediateCheckFrequency: '',
  lastIntermediateCheckDate: '',
  nextIntermediateCheckDate: '',
  intermediateCheckResult: '',
  intermediateCheckHistory: [],
  maintenanceScheduleFrequency: '',
  lastMaintenanceDate: '',
  nextMaintenanceDate: '',
  maintenanceDoneBy: '',
  maintenanceChecklist: [],
  maintenanceHistory: [],
  historyOfDamage: '',
  uploadCertificatePath: '',
  uploadManualSopPath: '',
  custodianEmployeeId: '',
  certificateFile: null,
  manualSopFile: null,
})

export const normalizeText = (value: string) => value.trim()

export function calculateNextDueDate(lastDateStr: string, frequency: Frequency): string {
  if (!lastDateStr || !frequency) return ''
  const date = new Date(lastDateStr)
  if (Number.isNaN(date.getTime())) return ''
  
  // Defensive check for accidental 6-digit years entered by user
  if (date.getFullYear() > 9999) {
    date.setFullYear(date.getFullYear() % 10000)
  }

  switch (frequency) {
    case 'Daily':
      date.setDate(date.getDate() + 1)
      break
    case 'Weekly':
      date.setDate(date.getDate() + 7)
      break
    case 'Monthly':
      date.setMonth(date.getMonth() + 1)
      break
    case 'Quarterly':
      date.setMonth(date.getMonth() + 3)
      break
    case 'Half Yearly':
      date.setMonth(date.getMonth() + 6)
      break
    case 'Yearly':
      date.setMonth(date.getMonth() + 12)
      break
    default:
      return ''
  }

  return date.toISOString().split('T')[0]
}

export function sanitizeDateStr(dateStr: string | null | undefined): string {
  if (!dateStr?.trim()) return ''
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return ''
  if (date.getFullYear() > 9999) {
    date.setFullYear(date.getFullYear() % 10000)
  }
  return date.toISOString().split('T')[0]
}

/** Local calendar date as YYYY-MM-DD (avoids UTC day-shift). */
export function todayIsoDate(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const NUMERIC_TOKEN =
  /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/

/** Split stored "100 kN" / "0.01 mm" / "1 %" / "1%" into value + unit for the form. */
export function splitValueAndUnit(raw: string | null | undefined): {
  value: string
  unit: string
} {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed) return { value: '', unit: '' }

  const lastSpace = trimmed.lastIndexOf(' ')
  if (lastSpace > 0) {
    const maybeUnit = trimmed.slice(lastSpace + 1).trim()
    const maybeValue = trimmed.slice(0, lastSpace).trim()
    if (maybeUnit && !NUMERIC_TOKEN.test(maybeUnit)) {
      return { value: maybeValue, unit: maybeUnit }
    }
  }

  // "1%" / "±0.02mm" — unit stuck to the end without a space
  const glued = trimmed.match(
    /^(.+?)([A-Za-zµμΩλ°%‰]+(?:\/[A-Za-z]+)?|[°℃℉])$/u,
  )
  if (glued) {
    const maybeValue = glued[1].trim()
    const maybeUnit = glued[2].trim()
    // Require a digit in the value so labels like "N/A" stay intact
    if (
      maybeValue &&
      maybeUnit &&
      /\d/.test(maybeValue) &&
      !NUMERIC_TOKEN.test(maybeUnit)
    ) {
      return { value: maybeValue, unit: maybeUnit }
    }
  }

  return { value: trimmed, unit: '' }
}

export function joinValueAndUnit(value: string, unit: string): string {
  const v = value.trim()
  const u = unit.trim()
  if (!v) return u
  if (!u) return v
  return `${v} ${u}`
}

/** True when Edit form Calibration status is Applicable (any cal data saved). */
export function isCalibrationApplicable(row: EquipmentRow): boolean {
  return !!(
    row.calibration_frequency?.trim() ||
    row.last_calibration_date?.trim() ||
    row.next_calibration_due?.trim() ||
    row.calibration_certificate_number?.trim() ||
    row.calibration_certificate_uncertainty?.trim() ||
    row.calibration_uncertainty_unit?.trim() ||
    row.calibration_coverage_factor?.trim() ||
    row.external_calibration_agency?.trim() ||
    row.upload_certificate_path?.trim()
  )
}

/** True when Edit form Intermediate Check status is Applicable. */
export function isIntermediateCheckApplicable(row: EquipmentRow): boolean {
  return !!(
    row.intermediate_check_frequency?.trim() ||
    row.last_intermediate_check_date?.trim() ||
    row.next_intermediate_check_date?.trim() ||
    row.intermediate_check_result?.trim() ||
    (Array.isArray(row.intermediate_check_history) && row.intermediate_check_history.length > 0)
  )
}

/** True when Edit form Maintenance status is Applicable. */
export function isMaintenanceApplicable(row: EquipmentRow): boolean {
  return !!(
    row.maintenance_schedule_frequency?.trim() ||
    row.last_maintenance_date?.trim() ||
    row.next_maintenance_date?.trim() ||
    row.maintenance_done_by?.trim() ||
    (Array.isArray(row.maintenance_checklist) && row.maintenance_checklist.length > 0) ||
    (Array.isArray(row.maintenance_history) && row.maintenance_history.length > 0)
  )
}

