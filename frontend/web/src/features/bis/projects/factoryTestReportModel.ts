/** Factory Test Report — sample + test-parameter selection payload. */

import {
  parseSampleFor,
  sampleForLabel,
  todayYmdLocal,
  type OslSampleFor,
  type OslSampleRequirementRow,
} from './oslSampleRequirementsModel'

export type FactoryTestReportParamRow = {
  testParameterId: string
  testName: string
  clauseNo: string
  isReference: string
  unit: string
  specifiedRequirement: string
  observedValue: string
  remark: string
}

export type FactoryTestReportEntry = {
  id: string
  sampleRowId: string
  sampleFor: OslSampleFor
  batchNumber: string
  dateOfManufacturing: string
  gradeTypeVariety: string
  declaredValue: string
  dateOfTestingStart: string
  dateOfTestingFinish: string
  parameters: FactoryTestReportParamRow[]
}

export type FactoryTestReportModulePayload = {
  reports: FactoryTestReportEntry[]
  inspectionOfficerName: string
  inspectionOfficerDesignation: string
  authorisedName: string
  authorisedDesignation: string
  testedByName: string
  testedByDesignation: string
  /** When true, Witnessed By block prints on the report (default on). */
  applyWitnessedBy: boolean
  /** When true, Authorized Signatory block prints on the report (default on). */
  applyAuthorizedSignatory: boolean
  /** When true, Tested By block prints on the report (default on). */
  applyTestedBy: boolean
}

let ftrSeq = 0

function nextFtrId(): string {
  ftrSeq += 1
  return `ftr-${Date.now()}-${ftrSeq}`
}

function str(raw: unknown): string {
  return String(raw ?? '').trim()
}

/** Missing key → true (legacy payloads keep all signatures applied). */
function boolDefaultTrue(raw: unknown): boolean {
  if (raw === false || raw === 0 || raw === '0' || raw === 'false') return false
  return true
}

export function emptyFactoryTestReportParamRow(
  partial?: Partial<FactoryTestReportParamRow>,
): FactoryTestReportParamRow {
  return {
    testParameterId: '',
    testName: '',
    clauseNo: '',
    isReference: '',
    unit: '',
    specifiedRequirement: '',
    observedValue: '',
    remark: 'Pass',
    ...partial,
  }
}

export function emptyFactoryTestReportEntry(
  partial?: Partial<FactoryTestReportEntry>,
): FactoryTestReportEntry {
  return {
    id: nextFtrId(),
    sampleRowId: '',
    sampleFor: 'ft',
    batchNumber: '',
    dateOfManufacturing: '',
    gradeTypeVariety: '',
    declaredValue: '',
    dateOfTestingStart: todayYmdLocal(),
    dateOfTestingFinish: todayYmdLocal(),
    parameters: [],
    ...partial,
  }
}

export function emptyFactoryTestReportPayload(): FactoryTestReportModulePayload {
  return {
    reports: [],
    inspectionOfficerName: '',
    inspectionOfficerDesignation: '',
    authorisedName: '',
    authorisedDesignation: '',
    testedByName: '',
    testedByDesignation: '',
    applyWitnessedBy: true,
    applyAuthorizedSignatory: true,
    applyTestedBy: true,
  }
}

export function factoryTestReportHasContent(entry: FactoryTestReportEntry): boolean {
  return Boolean(
    entry.sampleRowId.trim() ||
      entry.batchNumber.trim() ||
      entry.parameters.length > 0,
  )
}

/** Label for sample dropdown / table: Sample For · Batch · DOM. */
export function formatSampleTestRequestOption(
  sample: Pick<OslSampleRequirementRow, 'sampleFor' | 'batchNumber' | 'dateOfManufacturing'>,
  formatDate: (ymd: string) => string = (v) => v || '—',
): string {
  const batch = sample.batchNumber.trim() || '—'
  const dom = sample.dateOfManufacturing.trim()
    ? formatDate(sample.dateOfManufacturing.trim())
    : '—'
  return `${sampleForLabel(sample.sampleFor)} · Batch ${batch} · DOM ${dom}`
}

/** Snapshot sample fields into a Factory Test Report entry. */
export function applySampleToFactoryTestReport(
  entry: FactoryTestReportEntry,
  sample: OslSampleRequirementRow,
): FactoryTestReportEntry {
  return {
    ...entry,
    sampleRowId: sample.id,
    sampleFor: sample.sampleFor,
    batchNumber: sample.batchNumber,
    dateOfManufacturing: sample.dateOfManufacturing,
    gradeTypeVariety: sample.gradeTypeVariety || sample.sampleDescription,
    declaredValue: sample.declaredValue,
  }
}

function parseParamRow(raw: Record<string, unknown>): FactoryTestReportParamRow {
  return {
    testParameterId: str(raw.testParameterId ?? raw.test_parameter_id),
    testName: str(raw.testName ?? raw.test_name ?? raw.item_name),
    clauseNo: str(raw.clauseNo ?? raw.clause_no),
    isReference: str(raw.isReference ?? raw.is_reference),
    unit: str(raw.unit ?? raw.unit_value),
    specifiedRequirement: str(
      raw.specifiedRequirement ?? raw.specified_requirement ?? raw.specific_requirement,
    ),
    observedValue: str(raw.observedValue ?? raw.observed_value),
    remark: str(raw.remark ?? raw.remarks) || 'Pass',
  }
}

function parseEntry(raw: Record<string, unknown>): FactoryTestReportEntry {
  const rawParams = Array.isArray(raw.parameters) ? raw.parameters : []
  const parameters = rawParams
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map(parseParamRow)
    .filter((p) => p.testName || p.testParameterId)

  return {
    id: str(raw.id) || nextFtrId(),
    sampleRowId: str(raw.sampleRowId ?? raw.sample_row_id),
    sampleFor: parseSampleFor(raw.sampleFor ?? raw.sample_for, 'ft'),
    batchNumber: str(raw.batchNumber ?? raw.batch_number),
    dateOfManufacturing: str(raw.dateOfManufacturing ?? raw.date_of_manufacturing),
    gradeTypeVariety: str(raw.gradeTypeVariety ?? raw.grade_type_variety),
    declaredValue: str(raw.declaredValue ?? raw.declared_value),
    dateOfTestingStart: str(raw.dateOfTestingStart ?? raw.date_of_testing_start),
    dateOfTestingFinish: str(
      raw.dateOfTestingFinish ??
        raw.date_of_testing_finish ??
        raw.dateOfTestingCompletion ??
        raw.date_of_testing_completion,
    ),
    parameters,
  }
}

export function parseFactoryTestReportPayload(
  payload: Record<string, unknown> | null,
): FactoryTestReportModulePayload {
  const rawReports = Array.isArray(payload?.reports)
    ? payload.reports
    : Array.isArray(payload?.rows)
      ? payload.rows
      : []

  const reports = rawReports
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map(parseEntry)

  return {
    reports,
    inspectionOfficerName: str(
      payload?.inspectionOfficerName ?? payload?.inspection_officer_name,
    ),
    inspectionOfficerDesignation: str(
      payload?.inspectionOfficerDesignation ?? payload?.inspection_officer_designation,
    ),
    authorisedName: str(payload?.authorisedName ?? payload?.authorizedName),
    authorisedDesignation: str(
      payload?.authorisedDesignation ?? payload?.authorizedDesignation,
    ),
    testedByName: str(payload?.testedByName ?? payload?.tested_by_name),
    testedByDesignation: str(
      payload?.testedByDesignation ?? payload?.tested_by_designation,
    ),
    applyWitnessedBy: boolDefaultTrue(
      payload?.applyWitnessedBy ?? payload?.apply_witnessed_by,
    ),
    applyAuthorizedSignatory: boolDefaultTrue(
      payload?.applyAuthorizedSignatory ?? payload?.apply_authorized_signatory,
    ),
    applyTestedBy: boolDefaultTrue(payload?.applyTestedBy ?? payload?.apply_tested_by),
  }
}
