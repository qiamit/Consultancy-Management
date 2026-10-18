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

/** Excel columns of the testing equipment list: used by the Excel download and by Import from Excel. */
export const CMPF306_EXCEL_COLUMNS: Array<{ key: keyof Cmpf306EquipmentRow; label: string; aliases: string[] }> = [
  { key: 'equipmentName', label: 'Test Equipment / Chemical', aliases: ['test equipments chemicals', 'test equipment chemical', 'test equipment', 'equipment name', 'equipment', 'chemical'] },
  { key: 'make', label: 'Make', aliases: ['make', 'manufacturer'] },
  { key: 'leastCount', label: 'Least Count', aliases: ['least count', 'leastcount', 'resolution'] },
  { key: 'range', label: 'Range', aliases: ['range', 'measurement range'] },
  { key: 'calibrationStatus', label: 'Calibration Status', aliases: ['calibration status', 'calibration', 'calibration due'] },
  { key: 'clauseNo', label: 'Clause No.', aliases: ['clause no', 'clause number', 'clause'] },
  { key: 'quantity', label: 'Quantity', aliases: ['quantity', 'qty', 'number'] },
]

/** The equipment list as an .xlsx sheet with the import column headings (fill it in and import it back). */
export async function buildCmpf306ExcelBlob(payload: Record<string, unknown> | null, title: string): Promise<Blob> {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(title.slice(0, 31))
  sheet.addRow(['S.No.', ...CMPF306_EXCEL_COLUMNS.map((c) => c.label)])
  parseCmpf306Payload(payload).rows.forEach((row, i) => sheet.addRow([i + 1, ...CMPF306_EXCEL_COLUMNS.map((c) => row[c.key])]))
  const header = sheet.getRow(1)
  header.font = { bold: true, color: { argb: 'FFFDE68A' } }
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF292524' } }
  sheet.getColumn(1).width = 7
  CMPF306_EXCEL_COLUMNS.forEach((c, i) => {
    sheet.getColumn(i + 2).width = c.key === 'equipmentName' ? 40 : c.key === 'make' ? 30 : 16
  })
  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
      cell.alignment = { vertical: 'middle', wrapText: true }
    })
  })
  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
