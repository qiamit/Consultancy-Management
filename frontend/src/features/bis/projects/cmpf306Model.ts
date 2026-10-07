/** CMPF-306 — Testing Equipment declaration rows. */

import type { Cmpf306EquipmentRow } from '../print/cmpf306Html'

export type { Cmpf306EquipmentRow }

export type Cmpf306ModulePayload = {
  rows: Cmpf306EquipmentRow[]
  firmRepName: string
  firmRepDesignation: string
  inspectionOfficerName: string
  inspectionOfficerDesignation: string
}

export function emptyCmpf306EquipmentRow(): Cmpf306EquipmentRow {
  return {
    equipmentName: '',
    make: '',
    leastCount: '',
    range: '',
    calibrationStatus: '',
    clauseNo: '',
    quantity: '',
  }
}

export function emptyCmpf306Payload(): Cmpf306ModulePayload {
  return {
    rows: [],
    firmRepName: '',
    firmRepDesignation: '',
    inspectionOfficerName: '',
    inspectionOfficerDesignation: '',
  }
}

export function cmpf306RowHasContent(row: Cmpf306EquipmentRow): boolean {
  return Object.values(row).some((v) => String(v ?? '').trim().length > 0)
}

function str(raw: unknown): string {
  return String(raw ?? '').trim()
}

function parseRow(raw: Record<string, unknown>): Cmpf306EquipmentRow {
  return {
    equipmentName: str(
      raw.equipmentName ?? raw.equipment_name ?? raw.name ?? raw.testEquipment,
    ),
    make: str(raw.make),
    leastCount: str(raw.leastCount ?? raw.least_count),
    range: str(raw.range),
    calibrationStatus: str(
      raw.calibrationStatus ?? raw.calibration_status ?? raw.calibration,
    ),
    clauseNo: str(raw.clauseNo ?? raw.clause_no ?? raw.clause),
    quantity: str(raw.quantity ?? raw.qty ?? raw.number),
  }
}

export function parseCmpf306Payload(
  payload: Record<string, unknown> | null,
): Cmpf306ModulePayload {
  const rawRows = Array.isArray(payload?.rows) ? payload.rows : []
  const rows = rawRows
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map(parseRow)
  return {
    rows: rows.filter(cmpf306RowHasContent),
    firmRepName: str(payload?.firmRepName ?? payload?.firm_rep_name),
    firmRepDesignation: str(
      payload?.firmRepDesignation ?? payload?.firm_rep_designation,
    ),
    inspectionOfficerName: str(
      payload?.inspectionOfficerName ?? payload?.inspection_officer_name,
    ),
    inspectionOfficerDesignation: str(
      payload?.inspectionOfficerDesignation ?? payload?.inspection_officer_designation,
    ),
  }
}
