/** Local stubs — LIMS calibration package is not in this repo (APP-S07). */

export type CalibrationPointsColumn = {
  id: string
  label: string
  kind: 'text' | 'number'
}

export type CalibrationPointRow = Record<string, string>

export function emptyCalibrationPointsColumn(
  label = '',
  kind: 'text' | 'number' = 'number',
): CalibrationPointsColumn {
  return {
    id: `col_${Math.random().toString(36).slice(2, 10)}`,
    label,
    kind,
  }
}

export function emptyCalibrationPointRow(columns: CalibrationPointsColumn[]): CalibrationPointRow {
  const row: CalibrationPointRow = { id: `row_${Math.random().toString(36).slice(2, 10)}` }
  for (const col of columns) row[col.id] = ''
  return row
}
