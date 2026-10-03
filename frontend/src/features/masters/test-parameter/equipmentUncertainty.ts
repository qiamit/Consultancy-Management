import type { EquipmentRow } from '@/features/masters/equipment-master/types'

export type EquipmentUncertaintyOption = {
  id: string
  label: string
  assetCode: string
  equipmentName: string
  rangeCapacity: string
  manufacturer: string | null
  modelNumber: string | null
  calibrationCertificateNumber: string | null
  uncertainty: string
  uncertaintyUnit: string
  coverageFactor: string
}

export function formatEquipmentUncertaintyLabel(equipmentName: string, rangeCapacity?: string | null): string {
  const range = rangeCapacity?.trim()
  const name = equipmentName.trim()
  if (!name) return range ? `(${range})` : ''
  return range ? `${name} (${range})` : name
}

export function calibrationStandardUncertainty(
  certificateUncertainty: string,
  coverageFactor: string | null | undefined,
): string {
  const value = Number.parseFloat(certificateUncertainty.replace(/[^0-9.]/g, ''))
  const k = Number.parseFloat(coverageFactor?.replace(/[^0-9.]/g, '') || '') || 2
  if (!Number.isFinite(value) || value <= 0 || k <= 0) return ''
  return (value / k).toFixed(4)
}

export function parseEquipmentIntermediateCheckData(intermediateCheckResult: string | null | undefined): {
  labUncertainty: string
  unit: string
} {
  const match = intermediateCheckResult?.match(/\[DATA:([\s\S]+)\]/)
  if (!match) return { labUncertainty: '', unit: '' }
  try {
    const parsed = JSON.parse(match[1]) as { labUncertainty?: unknown; unit?: unknown }
    return {
      labUncertainty: parsed.labUncertainty != null ? String(parsed.labUncertainty) : '',
      unit: parsed.unit != null ? String(parsed.unit) : '',
    }
  } catch {
    return { labUncertainty: '', unit: '' }
  }
}

export function buildEquipmentUncertaintyOption(row: EquipmentRow): EquipmentUncertaintyOption {
  const { labUncertainty, unit: intermediateUnit } = parseEquipmentIntermediateCheckData(
    row.intermediate_check_result,
  )
  const certificateUncertainty =
    row.calibration_certificate_uncertainty?.replace(/[^0-9.]/g, '') ||
    labUncertainty.replace(/[^0-9.]/g, '')
  const uncertaintyUnit = row.calibration_uncertainty_unit?.trim() || intermediateUnit
  const coverageFactor = row.calibration_coverage_factor?.replace(/[^0-9.]/g, '') || '2'
  const rangeCapacity = row.range_capacity?.trim() ?? ''
  const label = formatEquipmentUncertaintyLabel(row.equipment_name, rangeCapacity)

  return {
    id: row.id,
    label,
    assetCode: row.asset_code,
    equipmentName: row.equipment_name,
    rangeCapacity,
    manufacturer: row.manufacturer,
    modelNumber: row.model_number,
    calibrationCertificateNumber: row.calibration_certificate_number,
    uncertainty: certificateUncertainty,
    uncertaintyUnit,
    coverageFactor,
  }
}

export function filterEquipmentUncertaintyOptions(
  query: string,
  options: EquipmentUncertaintyOption[],
  limit = 50,
): EquipmentUncertaintyOption[] {
  const q = query.trim().toLowerCase()
  const pool = options.filter(
    (opt) => opt.calibrationCertificateNumber?.trim() || opt.uncertainty.trim(),
  )
  if (!q) return pool.slice(0, limit)
  return pool
    .filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        opt.equipmentName.toLowerCase().includes(q) ||
        opt.rangeCapacity.toLowerCase().includes(q) ||
        opt.assetCode.toLowerCase().includes(q) ||
        opt.manufacturer?.toLowerCase().includes(q) ||
        opt.modelNumber?.toLowerCase().includes(q) ||
        opt.calibrationCertificateNumber?.toLowerCase().includes(q),
    )
    .slice(0, limit)
}
