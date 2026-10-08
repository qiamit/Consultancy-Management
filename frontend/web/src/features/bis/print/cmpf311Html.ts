import type { BisPrintData } from './loadBisPrintData'
import { printSignatoryDefaults } from './loadBisPrintData'
import { escapeHtml as esc } from './openPrintHtml'
import {
  applicantContextFromPrintData,
  applicationNoDisplay,
  buildPrintPage,
  CMPF_FORM_STYLES,
  dateOrNa,
  inspectionDateOrToday,
  letterheadHtml,
  preparedByHtml,
  signatoryHtml,
  toBlockHtml,
  type PrintApplicantContext,
} from './printDocumentShared'

export type Cmpf311Data = PrintApplicantContext & {
  referenceLetterNo: string
  referenceLetterDate: string
  licenceForStandard: string
  sitDocumentRef: string
  signatoryName: string
  signatoryDesignation: string
}

const BLANK = '________________'

function buildBody(data: Cmpf311Data): string {
  const letterDate = inspectionDateOrToday(data.dateOfInspection)
  const refDate = data.referenceLetterDate.trim() ? dateOrNa(data.referenceLetterDate) : BLANK
  const licenceFor = data.licenceForStandard.trim() || data.isNumber.trim() || BLANK
  const productManualNo = data.sitDocumentRef.trim() || BLANK
  const sigName = data.signatoryName.trim() || data.contactPerson.trim()

  return `
<div class="pd-sheet">
  ${letterheadHtml(data)}
  <div class="cmpf-form-id">CMPF - 311</div>
  <h1 class="pd-title">Acceptance of Scheme of Inspection &amp; Testing</h1>

  <div class="pd-to-row">
    <div class="pd-to-block">${toBlockHtml(data.bisBranchName, data.bisBranchState)}</div>
    <div class="pd-date-block">
      <div><strong>Date of Inspection:</strong> ${esc(letterDate)}</div>
      <div><strong>Application No.:</strong> ${esc(applicationNoDisplay(data.applicationNumber))}</div>
    </div>
  </div>

  <p class="pd-body">This has reference to your letter No. <strong>${esc(data.referenceLetterNo.trim() || BLANK)}</strong> dated <strong>${esc(refDate)}</strong>.</p>
  <p class="pd-body">
    We hereby undertake that, upon grant of a licence for <strong>${esc(licenceFor)}</strong>,
    we shall faithfully implement the Scheme of Inspection and Testing as specified in Product Manual No.
    <strong>${esc(productManualNo)}</strong>, and shall maintain all prescribed records in accordance with
    the requirements of the Bureau of Indian Standards.
  </p>

  <div class="cmpf-sign-right">${signatoryHtml({ firmName: data.applicantName, name: sigName, designation: data.signatoryDesignation })}</div>
  ${preparedByHtml(data.preparedBy)}
</div>`
}

export function buildCmpf311Html(data: Cmpf311Data): string {
  return buildPrintPage({
    title: `CMPF 311 — ${data.applicantName || 'Applicant'}`,
    styles: CMPF_FORM_STYLES,
    body: buildBody(data),
  })
}

/** Maps a BIS project row + client + IS code + consultancy context into CMPF-311 fields. */
export function cmpf311DataFromPrintData(printData: BisPrintData): Cmpf311Data {
  return {
    ...applicantContextFromPrintData(printData),
    referenceLetterNo: '',
    referenceLetterDate: '',
    licenceForStandard: printData.isCode.label || printData.isCode.isNumber,
    sitDocumentRef: '',
    signatoryName: printSignatoryDefaults(printData).signatoryName,
    signatoryDesignation: printSignatoryDefaults(printData).signatoryDesignation,
  }
}
