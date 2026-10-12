import type { BisPrintData } from './loadBisPrintData'
import { printSignatoryDefaults } from './loadBisPrintData'
import { escapeHtml as esc } from './openPrintHtml'
import {
  applicantContextFromPrintData,
  applicationNoDisplay,
  buildPrintPage,
  inspectionDateOrToday,
  letterheadHtml,
  preparedByHtml,
  signatoryHtml,
  toBlockHtml,
  type PrintApplicantContext,
} from './printDocumentShared'
import { parseRawMaterialReferencePayload } from '../projects/rawMaterialReferenceModel'
import { cmpf307RowHasContent, parseCmpf307Payload } from '../projects/cmpf307Model'
import { formatDisplayDate } from '../projects/types'

export type SefPackagingRow = { label: string; value: string }

export type SelfEvaluationFormData = PrintApplicantContext & {
  plantLayout: string
  packagingMarkingRows: SefPackagingRow[]
  brandsWithoutMarkReasons: string
  rawMaterials: Array<{ rawMaterial: string; supplierName: string; bisCertificationMark: string; testCertificate: string; batchesPackaging: string }>
  qualityControlStaff: Array<{ personName: string; designation: string; qualification: string; experience: string }>
  brandRows: Array<{ brandName: string; ownedBy: string; registeredStatus: string; registrationDate: string }>
  signatoryName: string
  signatoryDesignation: string
}

export const SEF_BRAND_DECLARATION_POINTS = [
  'Other Brand Names / Trade – Mark(s) used for the same product marketed without BIS Standard Mark. Give reasons.',
  'In case Brand Names / Trade – Mark(s) of any other party/manufacturer is being used for purposes of the above, give the design depiction of the Brand Names / Trade – Mark(s) and copy of the agreement authorizing the use of the same.',
  'We undertake to inform BIS in advance as and when we propose to use any other Brand Names / Trade – Mark(s) in conjunction with the operation of the BIS Certification Scheme.',
  'We also undertake that, as far as possible, the entire production which conforms to the ISS shall be marked with the BIS Mark, irrespective of the Brand Names / Trade – Mark(s) used.',
  'I / We understand that the above has been given only as information to BIS, that BIS has no role in permitting/approving of any Brand Name or Trade – Mark(s), that this is not in any way be interpreted to mean that BIS has permitted / approved the use of the Brand Names and Trade Marks listed above, and that the responsibility is entirely mine / ours.',
] as const

export const SEF_FINAL_DECLARATION =
  'The information given in this report are true to the best of my knowledge and belief. I shall be responsible if any misleading information has been given in this report and the application shall be liable for rejection if wrong information has been given. If the licence is granted on the basis of information which is found to be incorrect later, the licence shall be liable for cancellation.'

export function defaultPackagingMarkingRows(markingClause = ''): SefPackagingRow[] {
  const markingRef = markingClause.trim() || 'Marking Clause'
  return [
    { label: 'Nature of Packaging', value: 'Pieces' },
    { label: 'Quantity Per Package', value: 'As per Customer Requirement after GOL' },
    { label: 'Marking on Article', value: `As per ${markingRef} after GOL` },
    { label: 'Method of Marking', value: 'Marking by Tag after GOL' },
    { label: 'Form of Label(s)', value: 'Attached after GOL' },
    { label: 'Batch OR Code Number for Identification', value: 'Batch Number Will be Provided After GOL' },
    {
      label: 'In What Manner Marking Differs from the Provisions in the IS Specification',
      value: 'Immediate Stop Marking & Take Corrective Action',
    },
  ]
}

function packagingTableHtml(rows: SefPackagingRow[]): string {
  const body = rows
    .map(
      (row, i) => `<tr>
      <td style="width:6%">${i + 1}</td>
      <td class="pd-left sef-lbl">${esc(row.label)}</td>
      <td class="pd-left">${esc(row.value) || '&nbsp;'}</td>
    </tr>`,
    )
    .join('')
  return `<table class="pd-table sef-pack">${body}</table>`
}

function dataTable(headers: string[], rows: string[][], widths: string[] = []): string {
  const head = headers.map((header, i) => `<th${widths[i] ? ` style="width:${widths[i]}"` : ''}>${i === 0 ? 'Sr.<br/>No.' : esc(header)}</th>`).join('')
  const body = rows.map((row, rowIndex) => `<tr><td>${rowIndex + 1}</td>${row.map((cell, cellIndex) => `<td${cellIndex === 0 ? ' class="pd-left"' : ''}>${esc(cell) || '&nbsp;'}</td>`).join('')}</tr>`).join('')
  return `<table class="pd-table sef-blank"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
}

function buildBody(data: SelfEvaluationFormData): string {
  const letterDate = inspectionDateOrToday(data.dateOfInspection)
  const packaging =
    data.packagingMarkingRows.length > 0
      ? data.packagingMarkingRows
      : defaultPackagingMarkingRows()
  const sigName = data.signatoryName.trim() || data.contactPerson.trim()
  const reasons = data.brandsWithoutMarkReasons.trim() || '&nbsp;'

  const page1 = `
<div class="pd-sheet">
  ${letterheadHtml(data)}
  <h1 class="pd-title">Self Evaluation cum Verification Form</h1>

  <div class="pd-to-row">
    <div class="pd-to-block">${toBlockHtml(data.bisBranchName, data.bisBranchState)}</div>
    <div class="pd-date-block">
      <div><strong>Date of Inspection:</strong> ${esc(letterDate)}</div>
      <div><strong>Application No.:</strong> ${esc(applicationNoDisplay(data.applicationNumber))}</div>
    </div>
  </div>

  <p class="sef-section"><strong>1. General Information</strong></p>
  <p class="sef-line"><strong>a.</strong> Applicant Name :- ${esc(data.applicantName) || '________________'}${data.applicantAddress ? `, ${esc(data.applicantAddress)}` : ''}</p>
  <p class="sef-line"><strong>b.</strong> Plant Layout :- ${esc(data.plantLayout.trim() || 'Enclosed')}</p>

  <p class="sef-section"><strong>2. Raw Material Details</strong></p>
  ${dataTable(['', 'Raw Material', 'Name of Supplier', 'BIS Mark', 'Test Certificate', 'Batches / Packaging'], data.rawMaterials.filter((row) => row.rawMaterial.trim() && row.supplierName.trim()).map((row) => [row.rawMaterial, row.supplierName, row.bisCertificationMark, row.testCertificate, row.batchesPackaging]), ['6%', '22%', '27%', '14%', '15%', '16%'])}

  <p class="sef-section"><strong>3. Packaging &amp; Marking</strong></p>
  ${packagingTableHtml(packaging)}

  <div class="cmpf-sign-right">${signatoryHtml({ firmName: data.applicantName, name: sigName, designation: data.signatoryDesignation })}</div>
</div>`

  const page2 = `
<div class="pd-sheet sef-page-two">
  ${letterheadHtml(data)}
  <p class="sef-section"><strong>4. Details of Quality Control Staff</strong></p>
  ${dataTable(['', 'Name of the Person', 'Designation', 'Qualification', 'Experience'], data.qualityControlStaff.filter((row) => [row.personName, row.designation, row.qualification, row.experience].some((value) => value.trim())).map((row) => [row.personName, row.designation, row.qualification, row.experience]), ['6%', '24%', '24%', '24%', '22%'])}

  <p class="sef-section"><strong>5. Brand Name</strong></p>
  <p class="sef-sub"><strong>Declaration of Brand Name / Trade – Mark Proposed to be Covered Under Certification</strong></p>
  <p class="sef-sub"><strong>A. Brand Name / Trade – Mark(s) Being Used</strong></p>
  ${dataTable(['', 'Brand Names / Trade – Mark(s)', 'Owned By', 'Registered / Unregistered', 'Date of Registration'], data.brandRows.filter((row) => row.brandName.trim()).map((row) => [row.brandName, row.ownedBy, row.registeredStatus, formatDisplayDate(row.registrationDate)]), ['6%', '32%', '13%', '27%', '22%'])}

  <div class="sef-points">
    ${SEF_BRAND_DECLARATION_POINTS.map(
      (text, i) =>
        `<p><strong>${String.fromCharCode(66 + i)}.</strong> ${esc(text)}${i === 0 ? ` ${reasons}` : ''}</p>`,
    ).join('')}
  </div>

  <p class="sef-section"><strong>Declaration</strong></p>
  <p class="pd-body">${esc(SEF_FINAL_DECLARATION)}</p>

  <div class="cmpf-sign-right">${signatoryHtml({ firmName: data.applicantName, name: sigName, designation: data.signatoryDesignation })}</div>
  ${preparedByHtml(data.preparedBy)}
</div>`

  return `${page1}${page2}`
}

const STYLES = `
  .sef-section { margin: 10px 0 4px; font-size: 11.5px; }
  .sef-line, .sef-sub { margin: 3px 0; font-size: 11px; }
  .sef-lbl { font-weight: 700; background: #f8fafc; width: 42%; text-align: left; }
  .sef-pack td, .sef-blank td { height: 7mm; font-size: 9.5px; }
  .sef-blank { table-layout: fixed; }
  .sef-blank th:first-child, .sef-blank td:first-child { width: 6%; }
  .sef-points p { margin: 4px 0; font-size: 10px; line-height: 1.45; text-align: justify; }
  .sef-page-two { margin-top: 2em !important; break-before: page; page-break-before: always; }
  .cmpf-sign-right { margin-top: 14px; text-align: right; }
  .cmpf-sign-right .pd-signatory { text-align: left; }
`

export function buildSelfEvaluationFormHtml(data: SelfEvaluationFormData): string {
  return buildPrintPage({
    title: `Self Evaluation Form — ${data.applicantName || 'Applicant'}`,
    styles: STYLES,
    body: buildBody(data),
  })
}

/** Maps a BIS project row + client + consultancy context into Self Evaluation Form fields. */
export function selfEvaluationFormDataFromPrintData(printData: BisPrintData): SelfEvaluationFormData {
  const ctx = applicantContextFromPrintData(printData)
  const basePayload = printData.modulePayload ?? {}
  const source = basePayload.__sefSources && typeof basePayload.__sefSources === 'object'
    ? basePayload.__sefSources as Record<string, unknown>
    : {}
  const payload = source.selfEvaluation && typeof source.selfEvaluation === 'object'
    ? source.selfEvaluation as Record<string, unknown>
    : basePayload
  const rows = (value: unknown) => Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object') : []
  const rawRows = parseRawMaterialReferencePayload({ rawMaterials: source.rawMaterials } as Record<string, unknown>).rawMaterials
    .filter((row) => row.rawMaterial.trim() && row.supplierName.trim())
  const staffRows = rows(source.technicalStaff)
  const brandPayload = parseCmpf307Payload({ rows: source.brands, brandsWithoutMarkReasons: source.brandsWithoutMarkReasons })
  const brandRows = brandPayload.rows.filter(cmpf307RowHasContent)
  const packageRows = Array.isArray(payload.packagingMarkingRows)
    ? payload.packagingMarkingRows.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object').map((item) => ({ label: String(item.label ?? ''), value: String(item.value ?? '') }))
    : defaultPackagingMarkingRows()
  return {
    ...ctx,
    plantLayout: String(payload.plantLayout ?? 'Enclosed'),
    packagingMarkingRows: packageRows,
    brandsWithoutMarkReasons: brandPayload.brandsWithoutMarkReasons,
    rawMaterials: rawRows.map((row) => ({ rawMaterial: String(row.rawMaterial ?? ''), supplierName: String(row.supplierName ?? ''), bisCertificationMark: String(row.bisCertificationMark ?? ''), testCertificate: String(row.testCertificate ?? ''), batchesPackaging: String(row.batchesPackaging ?? '') })),
    qualityControlStaff: staffRows.map((row) => ({ personName: String(row.personName ?? ''), designation: String(row.designation ?? ''), qualification: String(row.educationalQualification ?? ''), experience: String(row.experienceYears ?? '') })),
    brandRows: brandRows.map((row) => ({ brandName: String(row.brandName ?? ''), ownedBy: String(row.ownedBy ?? 'Self'), registeredStatus: String(row.registeredStatus ?? 'Unregistered'), registrationDate: String(row.registrationDate ?? '') })),
    signatoryName: printSignatoryDefaults(printData).signatoryName,
    signatoryDesignation: printSignatoryDefaults(printData).signatoryDesignation,
  }
}
