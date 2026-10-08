import type { BisPrintData } from './loadBisPrintData'
import { printSignatoryDefaults } from './loadBisPrintData'
import { escapeHtml as esc } from './openPrintHtml'
import {
  applicantContextFromPrintData,
  applicationNoDisplay,
  blankTableRows,
  buildPrintPage,
  inspectionDateOrToday,
  letterheadHtml,
  preparedByHtml,
  signatoryHtml,
  toBlockHtml,
  type PrintApplicantContext,
} from './printDocumentShared'

export type SefPackagingRow = { label: string; value: string }

export type SelfEvaluationFormData = PrintApplicantContext & {
  plantLayout: string
  packagingMarkingRows: SefPackagingRow[]
  brandsWithoutMarkReasons: string
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
      value:
        'Immediate Stop Marking & Take Corrective Action Intend to Follow All the Specific Requirements as per',
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

function blankStaffTable(minRows: number, headers: string[]): string {
  const head = headers.map((h) => `<th>${esc(h)}</th>`).join('')
  return `
<table class="pd-table sef-blank">
  <thead><tr>${head}</tr></thead>
  <tbody>${blankTableRows(minRows, headers.length, { leftColumn: 1 })}</tbody>
</table>`
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
  <p class="sef-line"><strong>a.</strong> Applicant Name :- ${esc(data.applicantName) || '________________'}</p>
  <p class="sef-line"><strong>b.</strong> Plant Layout :- ${esc(data.plantLayout.trim() || 'Enclosed')}</p>

  <p class="sef-section"><strong>2. Raw Material Details</strong></p>
  ${blankStaffTable(4, ['Sr. No', 'Raw Material', 'Name of Supplier', 'BIS Mark', 'Test Certificate', 'Batches / Packaging'])}

  <p class="sef-section"><strong>3. Packaging &amp; Marking</strong></p>
  ${packagingTableHtml(packaging)}

  <div class="cmpf-sign-right">${signatoryHtml({ firmName: data.applicantName, name: sigName, designation: data.signatoryDesignation })}</div>
  <div class="sef-page">Page 01 of 02</div>
</div>`

  const page2 = `
<div class="pd-sheet">
  ${letterheadHtml(data)}
  <p class="sef-section"><strong>4. Details of Quality Control Staff</strong></p>
  ${blankStaffTable(4, ['Sr. No', 'Name of the Person', 'Designation', 'Qualification', 'Experience'])}

  <p class="sef-section"><strong>5. Brand Name</strong></p>
  <p class="sef-sub"><strong>Declaration of Brand Name / Trade – Mark Proposed to be Covered Under Certification</strong></p>
  <p class="sef-sub"><strong>A. Brand Name / Trade – Mark(s) Being Used</strong></p>
  ${blankStaffTable(3, ['Sr. No.', 'Brand Names / Trade – Mark(s)', 'Owned By', 'Registered / Unregistered', 'Date of Registration'])}

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
  <div class="sef-page">Page 02 of 02</div>
</div>`

  return `${page1}${page2}`
}

const STYLES = `
  .sef-section { margin: 10px 0 4px; font-size: 11.5px; }
  .sef-line, .sef-sub { margin: 3px 0; font-size: 11px; }
  .sef-lbl { font-weight: 700; background: #f8fafc; width: 42%; text-align: left; }
  .sef-pack td, .sef-blank td { height: 7mm; font-size: 9.5px; }
  .sef-points p { margin: 4px 0; font-size: 10px; line-height: 1.45; text-align: justify; }
  .sef-page { margin-top: 10px; font-size: 10px; font-weight: 600; text-align: right; }
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
  return {
    ...ctx,
    plantLayout: 'Enclosed',
    packagingMarkingRows: defaultPackagingMarkingRows(),
    brandsWithoutMarkReasons: '',
    signatoryName: printSignatoryDefaults(printData).signatoryName,
    signatoryDesignation: printSignatoryDefaults(printData).signatoryDesignation,
  }
}
