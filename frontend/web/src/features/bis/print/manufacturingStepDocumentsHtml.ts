import type { BisPrintData } from './loadBisPrintData'
import { printSignatoryDefaults } from './loadBisPrintData'
import { escapeHtml as esc } from './openPrintHtml'
import {
  applicantContextFromPrintData,
  applicationNoDisplay,
  buildPrintPage,
  inspectionDateOrToday,
  isStandardRefHtml,
  letterheadHtml,
  preparedByHtml,
  signatoryHtml,
  toBlockHtml,
  type PrintApplicantContext,
} from './printDocumentShared'

/* Step 3 (Manufacturing Process) documents that are edited inline on the step:
   Sub-contracting of Manufacturing Process / Machinery and Hygiene Conditions. */

export type ManufacturingSubcontractingRow = {
  process: string
  machinery: string
  subcontractorName: string
  subcontractorAddress: string
  remarks: string
}

export type HygieneConditionRow = {
  aspect: string
  arrangement: string
  remarks: string
}

type TableDocumentData<Row> = PrintApplicantContext & {
  rows: Row[]
  signatoryName: string
  signatoryDesignation: string
}

export type ManufacturingSubcontractingData = TableDocumentData<ManufacturingSubcontractingRow>
export type HygieneConditionsData = TableDocumentData<HygieneConditionRow>

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim())

function payloadRows<Row extends Record<string, string>>(payload: unknown, keys: Array<keyof Row>): Row[] {
  const rows = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).rows : null
  if (!Array.isArray(rows)) return []
  return rows
    .map((item) => {
      const source = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
      return Object.fromEntries(keys.map((key) => [key, text(source[String(key)])])) as Row
    })
    .filter((row) => keys.some((key) => row[key]))
}

function tableHtml<Row extends Record<string, string>>(
  rows: Row[],
  columns: Array<{ key: keyof Row; label: string; left?: boolean }>,
  emptyText: string,
): string {
  const body = rows.length
    ? rows
        .map(
          (r, i) => `<tr>
      <td>${i + 1}</td>
      ${columns.map((c) => `<td${c.left ? ' class="pd-left"' : ''}>${esc(r[c.key]) || '&nbsp;'}</td>`).join('')}
    </tr>`,
        )
        .join('')
    : `<tr><td colspan="${columns.length + 1}">${esc(emptyText)}</td></tr>`
  return `
<table class="pd-table mfg-table">
  <thead>
    <tr>
      <th style="width:6%">Sr. No.</th>
      ${columns.map((c) => `<th>${esc(c.label)}</th>`).join('')}
    </tr>
  </thead>
  <tbody>${body}</tbody>
</table>`
}

function sheetHtml(
  data: PrintApplicantContext & { signatoryName: string; signatoryDesignation: string },
  title: string,
  subject: string,
  intro: string,
  table: string,
  closing: string,
): string {
  const letterDate = inspectionDateOrToday(data.dateOfInspection)
  const sigName = data.signatoryName.trim() || data.contactPerson.trim()
  return `
<div class="pd-sheet">
  ${letterheadHtml(data)}
  <h1 class="pd-title">${esc(title)}</h1>

  <div class="pd-to-row">
    <div class="pd-to-block">${toBlockHtml(data.bisBranchName, data.bisBranchState)}</div>
    <div class="pd-date-block">
      <div><strong>Date of Inspection:</strong> ${esc(letterDate)}</div>
      <div><strong>Application No.:</strong> ${esc(applicationNoDisplay(data.applicationNumber))}</div>
    </div>
  </div>

  <p class="pd-body"><strong>Sub:</strong> ${subject}</p>
  <p class="pd-body">${intro}</p>

  ${table}

  <p class="pd-body">${closing}</p>

  <div class="cmpf-sign-right">${signatoryHtml({ firmName: data.applicantName, name: sigName, designation: data.signatoryDesignation })}</div>
  ${preparedByHtml(data.preparedBy)}
</div>`
}

const STYLES = `
  .mfg-table td { height: 7.5mm; font-size: 9.5px; }
  .cmpf-sign-right { margin-top: 14px; text-align: right; }
  .cmpf-sign-right .pd-signatory { text-align: right; margin-left: auto; }
`

function firmIntro(data: PrintApplicantContext): string {
  return `We, <strong>M/s. ${esc(data.applicantName)}</strong>,${
    data.applicantAddress ? ` having our factory at <strong>${esc(data.applicantAddress)}</strong>,` : ''
  }`
}

export function buildManufacturingSubcontractingHtml(data: ManufacturingSubcontractingData): string {
  const isStdRef = isStandardRefHtml(data.isNumber, data.isTitle)
  const body = sheetHtml(
    data,
    'Sub-contracting of Manufacturing Process / Machinery',
    `Details of manufacturing processes / machinery sub-contracted in connection with BIS licence application${isStdRef ? ` for Indian Standard ${isStdRef}` : ''}.`,
    `${firmIntro(data)} hereby furnish the details of the manufacturing processes / machinery that are sub-contracted to outside agencies. The particulars are as under:`,
    tableHtml(
      data.rows,
      [
        { key: 'process', label: 'Manufacturing Process Sub-contracted', left: true },
        { key: 'machinery', label: 'Machinery Used', left: true },
        { key: 'subcontractorName', label: 'Name of Sub-contractor', left: true },
        { key: 'subcontractorAddress', label: 'Address of Sub-contractor', left: true },
        { key: 'remarks', label: 'Remarks' },
      ],
      'No manufacturing process / machinery is sub-contracted.',
    ),
    'We undertake that the sub-contracted processes are carried out under our supervision and control, that the quality of the sub-contracted work is verified before further processing, and that any change in sub-contractor will be informed to BIS.',
  )
  return buildPrintPage({ title: `Sub-contracting of Manufacturing — ${data.applicantName || 'Applicant'}`, styles: STYLES, body })
}

export function buildHygieneConditionsHtml(data: HygieneConditionsData): string {
  const isStdRef = isStandardRefHtml(data.isNumber, data.isTitle)
  const body = sheetHtml(
    data,
    'Hygiene Conditions of Manufacturing Premises',
    `Hygiene conditions maintained at the manufacturing premises in connection with BIS licence application${isStdRef ? ` for Indian Standard ${isStdRef}` : ''}.`,
    `${firmIntro(data)} hereby declare the hygiene conditions and arrangements maintained at our manufacturing premises as under:`,
    tableHtml(
      data.rows,
      [
        { key: 'aspect', label: 'Hygiene Aspect', left: true },
        { key: 'arrangement', label: 'Arrangement / Condition Maintained', left: true },
        { key: 'remarks', label: 'Remarks' },
      ],
      'Hygiene conditions have not been recorded yet.',
    ),
    'We undertake to maintain the above hygiene conditions at all times and to keep the related records available for verification by BIS officers.',
  )
  return buildPrintPage({ title: `Hygiene Conditions — ${data.applicantName || 'Applicant'}`, styles: STYLES, body })
}

function tableDocumentData<Row extends Record<string, string>>(printData: BisPrintData, keys: Array<keyof Row>): TableDocumentData<Row> {
  const sig = printSignatoryDefaults(printData)
  return {
    ...applicantContextFromPrintData(printData),
    rows: payloadRows<Row>(printData.modulePayload, keys),
    signatoryName: sig.signatoryName,
    signatoryDesignation: sig.signatoryDesignation,
  }
}

export function manufacturingSubcontractingDataFromPrintData(printData: BisPrintData): ManufacturingSubcontractingData {
  return tableDocumentData<ManufacturingSubcontractingRow>(printData, ['process', 'machinery', 'subcontractorName', 'subcontractorAddress', 'remarks'])
}

export function hygieneConditionsDataFromPrintData(printData: BisPrintData): HygieneConditionsData {
  return tableDocumentData<HygieneConditionRow>(printData, ['aspect', 'arrangement', 'remarks'])
}

/* ───────── Step 6: Raw Material Test Reports ───────── */

export type RawMaterialTestReportRow = {
  description: string
  testReport: string
  complete: string
  conformity: string
}

export type RawMaterialTestReportsData = TableDocumentData<RawMaterialTestReportRow>

/** An attached row file is stored as { id, file_name, storage_path }. */
function attachedLabel(value: unknown): string {
  return value && typeof value === 'object' && text((value as Record<string, unknown>).storage_path) ? 'Attached' : 'Not Attached'
}

export function buildRawMaterialTestReportsHtml(data: RawMaterialTestReportsData): string {
  const isStdRef = isStandardRefHtml(data.isNumber, data.isTitle)
  const body = sheetHtml(
    data,
    'Raw Material Test Reports',
    `Test reports / test certificates of raw material used in the finished product sample lot${isStdRef ? ` for Indian Standard ${isStdRef}` : ''}.`,
    `${firmIntro(data)} hereby furnish the test reports / test certificates of the raw material used in the finished product sample lot, as required by the Indian Standard:`,
    tableHtml(
      data.rows,
      [
        { key: 'description', label: 'Raw Material Description', left: true },
        { key: 'testReport', label: 'Test Report / Test Certificate' },
        { key: 'complete', label: 'Test Report / Certificate Complete' },
        { key: 'conformity', label: 'Conformity as per Indian Standard' },
      ],
      'No raw material test reports have been recorded.',
    ),
    'We confirm that the above raw material conforms to the requirements of the Indian Standard and that the test reports / certificates are available for verification by BIS officers.',
  )
  return buildPrintPage({ title: `Raw Material Test Reports — ${data.applicantName || 'Applicant'}`, styles: STYLES, body })
}

export function rawMaterialTestReportsDataFromPrintData(printData: BisPrintData): RawMaterialTestReportsData {
  const sig = printSignatoryDefaults(printData)
  const payload = printData.modulePayload
  const rows = payload && typeof payload === 'object' && Array.isArray((payload as Record<string, unknown>).rows)
    ? ((payload as Record<string, unknown>).rows as Array<Record<string, unknown>>)
    : []
  return {
    ...applicantContextFromPrintData(printData),
    rows: rows
      .filter((r) => r && typeof r === 'object' && text(r.description))
      .map((r) => ({ description: text(r.description), testReport: attachedLabel(r.testReport), complete: text(r.complete), conformity: text(r.conformity) })),
    signatoryName: sig.signatoryName,
    signatoryDesignation: sig.signatoryDesignation,
  }
}

/* ───────── Step 4: Packaging and Marking ───────── */

export type PackagingMarkingFields = {
  natureOfPackaging: string
  quantityPerPackage: string
  markingOnArticle: string
  methodOfMarking: string
  methodOfMarkingOther: string
  batchNumbering: string
  markingDeviation: string
  labelFileName: string
}

export type PackagingMarkingData = PrintApplicantContext & {
  fields: PackagingMarkingFields
  signatoryName: string
  signatoryDesignation: string
}

/** Typical Manak Online values before grant of licence; used until the application saves its own. */
export const PACKAGING_MARKING_DEFAULTS = {
  natureOfPackaging: 'Pieces',
  quantityPerPackage: 'As per Customer Requirement after GOL',
  markingOnArticle: 'As per Marking Clause after GOL',
  methodOfMarking: 'Any Other',
  methodOfMarkingOther: 'Marking by Tag after GOL',
  batchNumbering: 'Batch Number Will be Provided After GOL',
  markingDeviation: 'Immediate Stop Marking & Take Corrective Action',
} as const

export function packagingMarkingFieldsFrom(payload: unknown): PackagingMarkingFields {
  const p = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  // Other data is merged into every document payload, so look for the packaging fields themselves.
  const saved = Object.keys(PACKAGING_MARKING_DEFAULTS).some((k) => text(p[k]))
  const o: Record<string, unknown> = saved ? p : { ...PACKAGING_MARKING_DEFAULTS, labelFileName: p.labelFileName }
  return {
    natureOfPackaging: text(o.natureOfPackaging),
    quantityPerPackage: text(o.quantityPerPackage),
    markingOnArticle: text(o.markingOnArticle),
    methodOfMarking: text(o.methodOfMarking),
    methodOfMarkingOther: text(o.methodOfMarkingOther),
    batchNumbering: text(o.batchNumbering),
    // Added later: older saved details fall back to the usual wording.
    markingDeviation: text(o.markingDeviation) || PACKAGING_MARKING_DEFAULTS.markingDeviation,
    labelFileName: text(o.labelFileName),
  }
}

/** True when the application has saved its own Packaging and Marking details. */
export function hasSavedPackagingMarking(payload: unknown): boolean {
  const p = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  return ['natureOfPackaging', 'quantityPerPackage', 'markingOnArticle', 'methodOfMarking', 'batchNumbering'].some((k) => text(p[k]))
}

/** Method of Marking as printed: the description when "Any Other" is chosen. */
export function packagingMarkingMethod(f: PackagingMarkingFields): string {
  return f.methodOfMarking === 'Any Other' && f.methodOfMarkingOther
    ? f.methodOfMarkingOther
    : [f.methodOfMarking, f.methodOfMarkingOther].filter(Boolean).join(' — ')
}

/** Rows of the Self Evaluation Form "Packaging & Marking" section, taken from Packaging and Marking (Step 4). */
export function sefPackagingRowsFrom(f: PackagingMarkingFields): Array<{ label: string; value: string }> {
  return [
    { label: 'Nature of Packaging', value: f.natureOfPackaging },
    { label: 'Quantity Per Package', value: f.quantityPerPackage },
    { label: 'Marking on Article', value: f.markingOnArticle },
    { label: 'Method of Marking', value: packagingMarkingMethod(f) },
    { label: 'Form of Label(s)', value: f.labelFileName ? 'Attached' : 'Attached after GOL' },
    { label: 'Batch OR Code Number for Identification', value: f.batchNumbering },
    { label: 'In What Manner Marking Differs from the Provisions in the IS Specification', value: f.markingDeviation },
  ]
}

export function buildPackagingMarkingHtml(data: PackagingMarkingData): string {
  const isStdRef = isStandardRefHtml(data.isNumber, data.isTitle)
  const f = data.fields
  const method = packagingMarkingMethod(f)
  const rows: Array<[string, string]> = [
    ['Nature of Packaging', f.natureOfPackaging],
    ['Quantity per Package', f.quantityPerPackage],
    ['Marking on Article', f.markingOnArticle],
    ['Method of Marking', method],
    ['Form of Label(s)', f.labelFileName ? 'Attached' : 'Not attached'],
    ['Batch / Code / Serial Numbering for Identification', f.batchNumbering],
    ['In What Manner Marking Differs from the Provisions in the IS Specification', f.markingDeviation],
  ]
  const table = `
<table class="pd-table mfg-table">
  <thead><tr><th style="width:6%">Sr. No.</th><th style="width:38%">Particulars</th><th>Details</th></tr></thead>
  <tbody>${rows.map(([label, value], i) => `<tr><td>${i + 1}</td><td class="pd-left">${esc(label)}</td><td class="pd-left">${esc(value) || '&nbsp;'}</td></tr>`).join('')}</tbody>
</table>`
  const body = sheetHtml(
    data,
    'Packaging and Marking Details',
    `Packaging and marking details of the product(s) covered under BIS licence application${isStdRef ? ` for Indian Standard ${isStdRef}` : ''}.`,
    `${firmIntro(data)} hereby furnish the packaging and marking details of our product as under:`,
    table,
    'We undertake to mark the product and its packaging as stated above and as per the marking clause of the Indian Standard after grant of licence, and to inform BIS of any change.',
  )
  return buildPrintPage({ title: `Packaging and Marking — ${data.applicantName || 'Applicant'}`, styles: STYLES, body })
}

export function packagingMarkingDataFromPrintData(printData: BisPrintData): PackagingMarkingData {
  const sig = printSignatoryDefaults(printData)
  return {
    ...applicantContextFromPrintData(printData),
    fields: packagingMarkingFieldsFrom(printData.modulePayload),
    signatoryName: sig.signatoryName,
    signatoryDesignation: sig.signatoryDesignation,
  }
}
