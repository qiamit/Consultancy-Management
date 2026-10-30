import { evaluateFormula, type FormulaValue } from '@/lib/recordFormula'

/* Customer Portal records: column definitions (designed by Q Engineering) and the calculation of one entry. */

export type RecordColumnType = 'text' | 'number' | 'spec' | 'date' | 'select' | 'formula' | 'link' | 'pass_fail' | 'attachment'

export type RecordColumn = {
  id: string
  key: string
  label: string
  col_type: RecordColumnType
  unit: string | null
  spec_min: number | null
  spec_max: number | null
  config: { options?: string[]; formula?: string; section_id?: string; decimals?: number }
  required: boolean
}

export const COLUMN_TYPE_LABEL: Record<RecordColumnType, string> = {
  text: 'Text',
  number: 'Number',
  spec: 'Number With Limits (Auto Pass / Fail)',
  date: 'Date',
  select: 'Dropdown',
  formula: 'Formula (Calculated)',
  link: 'Link to Another Section',
  pass_fail: 'Pass / Fail',
  attachment: 'Attachment',
}

export const SECTION_KIND_LABEL: Record<string, string> = {
  raw_material: 'Raw Material',
  in_process: 'In-Process',
  final_test: 'Final Testing',
  batch: 'Batch / Lot',
  custom: 'Custom',
}

/** A column key from its label: "Heat / Lot No" -> heat_lot_no. */
export function columnKeyFrom(label: string, taken: string[]): string {
  let base = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32)
  if (!/^[a-z]/.test(base)) base = `c_${base}`.replace(/_+$/, '') || 'col'
  let key = base
  for (let n = 2; taken.includes(key); n++) key = `${base}_${n}`
  return key
}

export function toNumber(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

/** True / false when the value has limits to check, null when there is nothing to judge. */
export function withinLimits(col: Pick<RecordColumn, 'spec_min' | 'spec_max'>, v: unknown): boolean | null {
  const n = toNumber(v)
  if (n == null || (col.spec_min == null && col.spec_max == null)) return null
  if (col.spec_min != null && n < Number(col.spec_min)) return false
  if (col.spec_max != null && n > Number(col.spec_max)) return false
  return true
}

/**
 * Fills the formula columns (in column order, so a formula may use an earlier formula) and works out the result:
 * fail when any limit is broken or a Pass / Fail column says fail; pass when something was checked and all passed.
 */
export function computeEntry(columns: RecordColumn[], input: Record<string, unknown>): {
  values: Record<string, unknown>
  result: 'pass' | 'fail' | null
  formulaErrors: Record<string, string>
} {
  const values: Record<string, unknown> = { ...input }
  const formulaErrors: Record<string, string> = {}
  for (const col of columns) {
    if (col.col_type !== 'formula') continue
    try {
      const out = evaluateFormula(col.config.formula ?? '', values as Record<string, FormulaValue>)
      const decimals = col.config.decimals
      values[col.key] =
        typeof out === 'number' && decimals != null ? Math.round(out * 10 ** decimals) / 10 ** decimals : out
    } catch (err) {
      values[col.key] = null
      formulaErrors[col.key] = err instanceof Error ? err.message : 'Formula error'
    }
  }
  let checked = false
  let failed = false
  for (const col of columns) {
    if (col.col_type === 'spec' || (col.col_type === 'formula' && (col.spec_min != null || col.spec_max != null))) {
      const ok = withinLimits(col, values[col.key])
      if (ok != null) {
        checked = true
        if (!ok) failed = true
      }
    } else if (col.col_type === 'pass_fail') {
      const v = String(values[col.key] ?? '').toLowerCase()
      if (v === 'pass' || v === 'fail') {
        checked = true
        if (v === 'fail') failed = true
      }
    }
  }
  return { values, result: failed ? 'fail' : checked ? 'pass' : null, formulaErrors }
}

export function limitsText(col: Pick<RecordColumn, 'spec_min' | 'spec_max' | 'unit'>): string {
  const u = col.unit ? ` ${col.unit}` : ''
  if (col.spec_min != null && col.spec_max != null) return `${col.spec_min}–${col.spec_max}${u}`
  if (col.spec_min != null) return `Min ${col.spec_min}${u}`
  if (col.spec_max != null) return `Max ${col.spec_max}${u}`
  return ''
}
