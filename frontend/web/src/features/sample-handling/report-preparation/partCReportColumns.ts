export type PartCReportColumnKey =
  | 'srNo'
  | 'testName'
  | 'unit'
  | 'specifiedRequirement'
  | 'observedValue'
  | 'uncertainty'
  | 'remark'

export type PartCReportColumnVisibility = Record<PartCReportColumnKey, boolean>

/** Column visibility per report scope (Accredited / Non Accredited). */
export type PartCReportColumnsByScope = {
  nabl: PartCReportColumnVisibility
  non_nabl: PartCReportColumnVisibility
}

export const PART_C_REPORT_COLUMN_DEFS: ReadonlyArray<{
  key: PartCReportColumnKey
  label: string
}> = [
  { key: 'srNo', label: 'Sr No' },
  { key: 'testName', label: 'Test Name' },
  { key: 'unit', label: 'Unit' },
  { key: 'specifiedRequirement', label: 'Specified Requirements' },
  { key: 'observedValue', label: 'Observed Value' },
  { key: 'uncertainty', label: 'Uncertainty' },
  { key: 'remark', label: 'Remark' },
]

export const DEFAULT_PART_C_REPORT_COLUMNS: PartCReportColumnVisibility = {
  srNo: true,
  testName: true,
  unit: true,
  specifiedRequirement: true,
  observedValue: true,
  uncertainty: true,
  remark: true,
}

export const DEFAULT_PART_C_REPORT_COLUMNS_BY_SCOPE: PartCReportColumnsByScope = {
  nabl: { ...DEFAULT_PART_C_REPORT_COLUMNS },
  non_nabl: {
    ...DEFAULT_PART_C_REPORT_COLUMNS,
    uncertainty: false,
  },
}

function looksLikeFlatColumns(o: Record<string, unknown>): boolean {
  return PART_C_REPORT_COLUMN_DEFS.some((col) => typeof o[col.key] === 'boolean')
}

export function parsePartCReportColumns(raw: unknown): PartCReportColumnVisibility {
  const out = { ...DEFAULT_PART_C_REPORT_COLUMNS }
  if (!raw || typeof raw !== 'object') return out

  const o = raw as Record<string, unknown>
  for (const col of PART_C_REPORT_COLUMN_DEFS) {
    if (typeof o[col.key] === 'boolean') {
      out[col.key] = o[col.key]
    }
  }

  const anyVisible = PART_C_REPORT_COLUMN_DEFS.some((col) => out[col.key])
  return anyVisible ? out : { ...DEFAULT_PART_C_REPORT_COLUMNS }
}

export function parsePartCReportColumnsByScope(raw: unknown): PartCReportColumnsByScope {
  const d = DEFAULT_PART_C_REPORT_COLUMNS_BY_SCOPE
  if (!raw || typeof raw !== 'object') {
    return {
      nabl: { ...d.nabl },
      non_nabl: { ...d.non_nabl },
    }
  }

  const o = raw as Record<string, unknown>

  // Legacy: flat column map → apply to both scopes
  if (!('nabl' in o) && !('non_nabl' in o) && looksLikeFlatColumns(o)) {
    const flat = parsePartCReportColumns(o)
    return { nabl: { ...flat }, non_nabl: { ...flat } }
  }

  return {
    nabl: parsePartCReportColumns(o.nabl ?? d.nabl),
    non_nabl: parsePartCReportColumns(o.non_nabl ?? d.non_nabl),
  }
}

export function partCColumnsForScope(
  columns: PartCReportColumnsByScope | PartCReportColumnVisibility,
  scope: 'nabl' | 'non_nabl',
): PartCReportColumnVisibility {
  return parsePartCReportColumnsByScope(columns)[scope]
}

export function visiblePartCReportColumns(
  columns: PartCReportColumnVisibility,
): Array<(typeof PART_C_REPORT_COLUMN_DEFS)[number]> {
  return PART_C_REPORT_COLUMN_DEFS.filter((col) => columns[col.key])
}

/**
 * Part C column widths (table-layout: fixed).
 * - Sr No: content minimum (absolute)
 * - Test Name 25%, Unit 7%, Observed 15%, Uncertainty 10%, Remark 10%
 * - Specified Requirements: remaining; unused Uncertainty/Remark widths fold into it
 */
export function partCColumnWidthPercents(
  columns: PartCReportColumnVisibility,
): Record<PartCReportColumnKey, string> {
  const hasU = columns.uncertainty
  const hasR = columns.remark

  const testName = 25
  const unit = 7
  const observed = 15
  const uncertainty = hasU ? 10 : 0
  const remark = hasR ? 10 : 0
  // Sr No uses absolute min-content width (not %); remaining % → Specified Requirements
  const specified = Math.max(100 - testName - unit - observed - uncertainty - remark, 10)

  return {
    srNo: '8mm',
    testName: `${testName}%`,
    unit: `${unit}%`,
    specifiedRequirement: `${specified}%`,
    observedValue: `${observed}%`,
    uncertainty: `${uncertainty}%`,
    remark: `${remark}%`,
  }
}
