import { evaluateFormula, type FormulaScalar, type FormulaValue } from '@/lib/recordFormula'

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
  config: {
    options?: string[]
    /** Dropdown: preselected for a new entry. */
    default?: string
    /** Dropdown: choosing one of these makes the entry Fail. */
    fail_options?: string[]
    /** Dropdown: several choices at once (stored as a list). */
    multiple?: boolean
    /** Dropdown: the customer may also type a value that is not in the list. */
    allow_other?: boolean
    formula?: string
    section_id?: string
    decimals?: number
    /** Other per-type settings (text, number, date, link, pass / fail); see ColumnTypeSettings. */
    [setting: string]: unknown
  }
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
 * `linked` gives, per link column key, the stored values of the entries picked in it (same licence only), so a
 * formula can use <link column>.<column> (one value per picked entry).
 */
export function computeEntry(
  columns: RecordColumn[],
  input: Record<string, unknown>,
  linked: Record<string, Array<Record<string, unknown>>> = {},
): {
  values: Record<string, unknown>
  result: 'pass' | 'fail' | null
  formulaErrors: Record<string, string>
} {
  const values: Record<string, unknown> = { ...input }
  const formulaErrors: Record<string, string> = {}
  const linkedScope: Record<string, FormulaValue> = {}
  for (const [linkKey, rows] of Object.entries(linked)) {
    const keys = new Set(rows.flatMap((r) => Object.keys(r)))
    for (const k of keys) linkedScope[`${linkKey}.${k}`] = rows.map((r) => (r[k] ?? null) as FormulaScalar)
  }
  for (const col of columns) {
    if (col.col_type !== 'formula') continue
    try {
      const out = evaluateFormula(col.config.formula ?? '', { ...linkedScope, ...(values as Record<string, FormulaValue>) })
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
    } else if (col.col_type === 'select' && col.config.fail_options?.length) {
      const v = values[col.key]
      const picked = (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]).map(String)
      if (picked.length) {
        checked = true
        if (picked.some((p) => col.config.fail_options!.includes(p))) failed = true
      }
    } else if (col.col_type === 'pass_fail' && !col.config.no_fail_effect) {
      const v = String(values[col.key] ?? '').toLowerCase()
      if (v === 'pass' || v === 'fail') {
        checked = true
        if (v === 'fail') failed = true
      }
    }
  }
  return { values, result: failed ? 'fail' : checked ? 'pass' : null, formulaErrors }
}

/** Starting values of a new entry: the defaults set on each column. */
export function defaultEntryValues(columns: RecordColumn[], now = new Date()): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const pad = (n: number) => String(n).padStart(2, '0')
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  for (const c of columns) {
    const cfg = c.config
    if (c.col_type === 'select' && cfg.default) out[c.key] = cfg.multiple ? [cfg.default] : cfg.default
    else if (c.col_type === 'text' && cfg.default_text) out[c.key] = String(cfg.default_text)
    else if ((c.col_type === 'number' || c.col_type === 'spec') && cfg.default_number != null) out[c.key] = Number(cfg.default_number)
    else if (c.col_type === 'date' && cfg.default_today) out[c.key] = cfg.include_time ? `${today}T${pad(now.getHours())}:${pad(now.getMinutes())}` : today
    else if (c.col_type === 'pass_fail' && cfg.default_pf) out[c.key] = String(cfg.default_pf)
  }
  return out
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** A date (or date-time) value in the column's chosen format. */
export function formatDateValue(col: Pick<RecordColumn, 'config'>, v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(v)
  if (!m) return v
  const [, y, mo, d, hh, mi] = m
  const mon = MONTHS[Number(mo) - 1] ?? mo
  const f = String(col.config.date_format ?? '')
  const date =
    f === 'dd-mm-yyyy' ? `${d}-${mo}-${y}`
      : f === 'dd mmm yyyy' ? `${d} ${mon} ${y}`
        : f === 'mmm dd, yyyy' ? `${mon} ${d}, ${y}`
          : f === 'yyyy-mm-dd' ? `${y}-${mo}-${d}`
            : `${d}/${mo}/${y}`
  return hh != null ? `${date} ${hh}:${mi}` : date
}

/** A number in the column's format: decimals, thousands separator, ₹ or %. */
export function formatNumberValue(col: Pick<RecordColumn, 'config'>, n: number): string {
  const cfg = col.config
  const dec = cfg.decimals != null && Number.isFinite(Number(cfg.decimals)) ? Number(cfg.decimals) : null
  const text = cfg.thousands
    ? n.toLocaleString('en-IN', dec != null ? { minimumFractionDigits: dec, maximumFractionDigits: dec } : { maximumFractionDigits: 6 })
    : dec != null ? n.toFixed(dec) : String(Math.round(n * 1e6) / 1e6)
  return cfg.format === 'currency' ? `₹ ${text}` : cfg.format === 'percent' ? `${text} %` : text
}

export const PASS_FAIL_PRESETS: Array<[string, string, string]> = [
  ['Pass / Fail', 'Pass', 'Fail'],
  ['OK / Not OK', 'OK', 'Not OK'],
  ['Yes / No', 'Yes', 'No'],
  ['Confirm / Not Confirm', 'Confirm', 'Not Confirm'],
  ['Accepted / Rejected', 'Accepted', 'Rejected'],
  ['Conforming / Non-Conforming', 'Conforming', 'Non-Conforming'],
  ['Satisfactory / Unsatisfactory', 'Satisfactory', 'Unsatisfactory'],
]

/** Words a Pass / Fail column shows for pass and fail (values stay 'pass' / 'fail'). */
export function passFailWords(config: Record<string, unknown>): [string, string] {
  if (config.preset === 'custom') return [String(config.pass_label || 'Pass'), String(config.fail_label || 'Fail')]
  const p = PASS_FAIL_PRESETS.find(([n]) => n === config.preset)
  return p ? [p[1], p[2]] : ['Pass', 'Fail']
}

export function limitsText(col: Pick<RecordColumn, 'spec_min' | 'spec_max' | 'unit'>): string {
  const u = col.unit ? ` ${col.unit}` : ''
  if (col.spec_min != null && col.spec_max != null) return `${col.spec_min}–${col.spec_max}${u}`
  if (col.spec_min != null) return `Min ${col.spec_min}${u}`
  if (col.spec_max != null) return `Max ${col.spec_max}${u}`
  return ''
}
