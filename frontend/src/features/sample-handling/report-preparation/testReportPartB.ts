import type { ReportScopeKind } from './reportScope'

export const PART_B_APPLICABLE = 'Applicable'
export const PART_B_NOT_APPLICABLE = 'Not Applicable'

export const PART_B_OUTPUT_OPTIONS = [PART_B_APPLICABLE, PART_B_NOT_APPLICABLE] as const

export const PART_B_YES = 'Yes'
export const PART_B_NO = 'No'

export const PART_B_YES_NO_OPTIONS = [PART_B_YES, PART_B_NO] as const

export type TestReportPartBDetails = {
  samplingProcedureRef: string
  supportingDocuments: string
  deviationFromMethods: string
  nablReportRequired: string
}

export type PartBFieldKey = keyof TestReportPartBDetails

export const PART_B_ROWS: ReadonlyArray<{
  key: PartBFieldKey
  label: string
  options: readonly string[]
}> = [
  {
    key: 'samplingProcedureRef',
    label: 'Reference to Sampling Procedure, wherever Applicable.',
    options: PART_B_OUTPUT_OPTIONS,
  },
  {
    key: 'supportingDocuments',
    label:
      'Supporting Documents for the Measurements Taken & Results Derived like Graphs, Table Sketches & Photographs as Appropriate to Test Report, if Any.',
    options: PART_B_OUTPUT_OPTIONS,
  },
  {
    key: 'deviationFromMethods',
    label: 'Deviation from the Test Methods as Prescribed in Relevant ISS / Work Instruction',
    options: PART_B_OUTPUT_OPTIONS,
  },
  {
    key: 'nablReportRequired',
    label: 'NABL Report Required ?',
    options: PART_B_YES_NO_OPTIONS,
  },
]

export const PART_B_ROW_LABELS = PART_B_ROWS.map((r) => r.label)

/** Legacy Part B values that mean “Applicable”. */
export function isPartBApplicableValue(value: string): boolean {
  const v = value.trim()
  return v === PART_B_APPLICABLE || v === 'Yes' || v === 'Yes Available'
}

/** Map stored / legacy strings to Applicable / Not Applicable (rows 1–3). */
export function normalizePartBOutputValue(value: string): string {
  return isPartBApplicableValue(value) ? PART_B_APPLICABLE : PART_B_NOT_APPLICABLE
}

/** Row 4 — Yes / No (legacy “Applicable” → Yes). */
export function isPartBYesValue(value: string): boolean {
  const v = value.trim()
  return v === PART_B_YES || v === PART_B_APPLICABLE
}

export function normalizePartBNablOutputValue(value: string): string {
  return isPartBYesValue(value) ? PART_B_YES : PART_B_NO
}

export function normalizePartBFieldValue(key: PartBFieldKey, value: string): string {
  return key === 'nablReportRequired'
    ? normalizePartBNablOutputValue(value)
    : normalizePartBOutputValue(value)
}

function formatPartBBoolean(v: boolean | null | undefined, fallback: string): string {
  if (v === true) return PART_B_APPLICABLE
  if (v === false) return PART_B_NOT_APPLICABLE
  return fallback
}

/** Review tab yes/no → Part B display */
export function formatPartBSamplingProcedure(v: boolean | null | undefined): string {
  return formatPartBBoolean(v, PART_B_NOT_APPLICABLE)
}

export function formatPartBSupportingDocuments(v: boolean | null | undefined): string {
  return formatPartBBoolean(v, PART_B_NOT_APPLICABLE)
}

export function formatPartBDeviationFromMethods(v: boolean | null | undefined): string {
  return formatPartBBoolean(v, PART_B_NOT_APPLICABLE)
}

export function formatPartBNablFromBoolean(v: boolean | null | undefined): string {
  if (v === true) return PART_B_YES
  if (v === false) return PART_B_NO
  return PART_B_NO
}

export function formatPartBNablReportRequired(scopes: ReportScopeKind[] | undefined): string {
  if (scopes?.includes('nabl')) return PART_B_YES
  return PART_B_NO
}

export function buildTestReportPartBDetails(
  row: {
    sampling_procedure_ref?: boolean | null
    supporting_docs_required?: boolean | null
    deviation_from_methods?: boolean | null
    test_report_nabl_required?: boolean | null
  },
  applicableScopes?: ReportScopeKind[],
): TestReportPartBDetails {
  const nablStored = row.test_report_nabl_required
  const nablReportRequired =
    nablStored !== null && nablStored !== undefined
      ? formatPartBNablFromBoolean(nablStored)
      : formatPartBNablReportRequired(applicableScopes)

  return {
    samplingProcedureRef: formatPartBSamplingProcedure(row.sampling_procedure_ref),
    supportingDocuments: formatPartBSupportingDocuments(row.supporting_docs_required),
    deviationFromMethods: formatPartBDeviationFromMethods(row.deviation_from_methods),
    nablReportRequired,
  }
}

export function partBValuesList(details: TestReportPartBDetails): string[] {
  return PART_B_ROWS.map((row) => normalizePartBFieldValue(row.key, details[row.key]))
}

export function partBDetailsToSampleUpdate(
  partB: TestReportPartBDetails,
): {
  sampling_procedure_ref: boolean
  supporting_docs_required: boolean
  deviation_from_methods: boolean
  test_report_nabl_required: boolean
} {
  return {
    sampling_procedure_ref: isPartBApplicableValue(partB.samplingProcedureRef),
    supporting_docs_required: isPartBApplicableValue(partB.supportingDocuments),
    deviation_from_methods: isPartBApplicableValue(partB.deviationFromMethods),
    test_report_nabl_required: isPartBYesValue(partB.nablReportRequired),
  }
}
