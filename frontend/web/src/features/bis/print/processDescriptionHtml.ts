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
import { parseProcessFlowPayload } from '../projects/processFlowModel'

export type ProcessDescriptionData = PrintApplicantContext & {
  descriptionPoints: string[]
  signatoryName: string
  signatoryDesignation: string
}

export function processDescriptionPointTexts(data: ProcessDescriptionData): string[] {
  const isCode = data.isNumber.trim() || 'the product'
  const company = data.applicantName.trim() || 'Our manufacturing unit'

  return [
    `${company} manufactures ${isCode} as per the applicable Indian Standard. Raw materials are received, inspected, and accepted only against defined specifications before use in production.`,
    'Accepted raw materials are stored in a designated area with proper identification, segregation, and protection from contamination, damage, and deterioration.',
    'The main manufacturing operations are carried out in sequence as per approved standard operating procedures, work instructions, and the process flow chart submitted with this application.',
    'In-process checks and controls are exercised at defined stages to ensure conformity of the product to the specified requirements.',
    'Finished products are inspected/tested as per the relevant Indian Standard before acceptance and are stored in a separate identified area.',
    'Non-conforming products, if any, are identified, segregated, and disposed of in a manner that prevents their unintended use or dispatch.',
    'Relevant production, inspection, and test records are maintained and made available for verification during BIS inspections.',
  ]
}

/** Single A4 sheet body for Process Description (no outer print page wrapper). */
export function buildProcessDescriptionSheetHtml(data: ProcessDescriptionData): string {
  const letterDate = inspectionDateOrToday(data.dateOfInspection)
  const isCode = esc(data.isNumber.trim() || 'the applicable Indian Standard')
  const points =
    data.descriptionPoints.map((p) => p.trim()).filter(Boolean).length > 0
      ? data.descriptionPoints.map((p) => p.trim()).filter(Boolean)
      : processDescriptionPointTexts(data)
  const sigName = data.signatoryName.trim() || data.contactPerson.trim()

  return `
<div class="pd-sheet">
  ${letterheadHtml(data)}
  <h1 class="pd-title">Process Description</h1>

  <div class="pd-to-row">
    <div class="pd-to-block">${toBlockHtml(data.bisBranchName, data.bisBranchState)}</div>
    <div class="pd-date-block">
      <div><strong>Date of Inspection:</strong> ${esc(letterDate)}</div>
      <div><strong>Application No.:</strong> ${esc(applicationNoDisplay(data.applicationNumber))}</div>
    </div>
  </div>

  <p class="pd-body">Respected / Sir,</p>
  <p class="pd-body">
    We hereby submit the following description of the manufacturing process adopted at our unit for
    ${isCode} for your kind reference in connection with our BIS licence application.
  </p>
  <div class="proc-points">
    ${points.map((text, i) => `<p><strong>${i + 1}.</strong> ${esc(text)}</p>`).join('')}
  </div>
  <p class="pd-body">
    We hereby declare that all information furnished above is true and correct to the best of our
    knowledge and belief.
  </p>

  <div class="cmpf-sign-right">${signatoryHtml({ firmName: data.applicantName, name: sigName, designation: data.signatoryDesignation })}</div>
  ${preparedByHtml(data.preparedBy)}
</div>`
}

export const PROCESS_DESCRIPTION_PRINT_STYLES = `
  .proc-points p {
    margin: 6px 0;
    font-size: 12.5px;
    font-weight: 500;
    line-height: 1.55;
    text-align: justify;
    color: #000;
    -webkit-text-fill-color: #000;
    /* Allow long points to split across pages — avoid clips entire block on print/PDF. */
    break-inside: auto;
    page-break-inside: auto;
  }
  .proc-points strong { color: #000; -webkit-text-fill-color: #000; font-weight: 700; }
  .cmpf-sign-right { margin-top: 14px; text-align: right; }
  .cmpf-sign-right .pd-signatory { text-align: left; }
  @media print {
    .proc-points p {
      font-size: 12.5pt !important;
      font-weight: 500 !important;
      color: #000 !important;
      -webkit-text-fill-color: #000 !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
`

export function buildProcessDescriptionHtml(data: ProcessDescriptionData): string {
  return buildPrintPage({
    title: `Process Description — ${data.applicantName || 'Applicant'}`,
    styles: PROCESS_DESCRIPTION_PRINT_STYLES,
    body: buildProcessDescriptionSheetHtml(data),
  })
}

/** Maps a BIS project row + client + IS code + consultancy context into Process Description fields. */
export function processDescriptionDataFromPrintData(printData: BisPrintData): ProcessDescriptionData {
  const ctx = applicantContextFromPrintData(printData)
  const parsed = parseProcessFlowPayload(
    printData.modulePayload && typeof printData.modulePayload === 'object'
      ? (printData.modulePayload as Record<string, unknown>)
      : null,
  )
  const sig = printSignatoryDefaults(printData)
  return {
    ...ctx,
    descriptionPoints: parsed.descriptionPoints,
    signatoryName: sig.signatoryName,
    signatoryDesignation: sig.signatoryDesignation,
  }
}
