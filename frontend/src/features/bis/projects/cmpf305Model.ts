/** CMPF-305 — Plant & Machinery declaration rows. */

import type { Cmpf305MachineryRow } from '../print/cmpf305Html'

export type { Cmpf305MachineryRow }

export type Cmpf305ModulePayload = {
  rows: Cmpf305MachineryRow[]
  firmRepName: string
  firmRepDesignation: string
  inspectionOfficerName: string
  inspectionOfficerDesignation: string
}

export function emptyCmpf305MachineryRow(): Cmpf305MachineryRow {
  return {
    machineryName: '',
    make: '',
    capacityPerDay: '',
    number: '',
    remarks: '',
  }
}

export function emptyCmpf305Payload(): Cmpf305ModulePayload {
  return {
    rows: [],
    firmRepName: '',
    firmRepDesignation: '',
    inspectionOfficerName: '',
    inspectionOfficerDesignation: '',
  }
}

export function cmpf305RowHasContent(row: Cmpf305MachineryRow): boolean {
  return Object.values(row).some((v) => String(v ?? '').trim().length > 0)
}

function str(raw: unknown): string {
  return String(raw ?? '').trim()
}

function parseRow(raw: Record<string, unknown>): Cmpf305MachineryRow {
  return {
    machineryName: str(raw.machineryName ?? raw.machinery_name ?? raw.name),
    make: str(raw.make),
    capacityPerDay: str(
      raw.capacityPerDay ?? raw.capacity_per_day ?? raw.productionCapacity ?? raw.capacity,
    ),
    number: str(raw.number ?? raw.qty ?? raw.quantity),
    remarks: str(raw.remarks ?? raw.remark),
  }
}

export function parseCmpf305Payload(
  payload: Record<string, unknown> | null,
): Cmpf305ModulePayload {
  const rawRows = Array.isArray(payload?.rows) ? payload.rows : []
  const rows = rawRows
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map(parseRow)
  return {
    rows: rows.filter(cmpf305RowHasContent),
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
