import type { BisPrintData } from './loadBisPrintData'
import { escapeHtml as esc } from './openPrintHtml'
import {
  addressWithIndia,
  applicantContextFromPrintData,
  applicationNoDisplay,
  buildPrintPage,
  dateOrNa,
  letterheadHtml,
  preparedByHtml,
  signatoryHtml,
  toBlockHtml,
  type PrintApplicantContext,
} from './printDocumentShared'

export type UndertakingOption2Data = PrintApplicantContext & {
  declarantName: string
  productForMark: string
  isStandard: string
  factoryAddress: string
  signatoryName: string
  signatoryDesignation: string
}

const CONDITIONS = [
  'The licence, if granted against the above application shall be put under suspension by BIS, if the sample drawn during the verification visit fails to conform to the relevant Indian Standard',
  'In such case of suspension, I shall take necessary corrective actions and inform the same to BIS within one month and offer fresh lot of products manufactured after taking corrective actions, from which sample(s) will be drawn by BIS for third party testing',
  'The revocation of suspension will be considered only based on complete test report(s) of the fresh sample(s) offered, from third party testing laboratory',
  'The testing fee for testing of sample drawn for consideration of revocation of suspension shall be borne by me',
  'In case, the fresh sample drawn by BIS for considering revocation of suspension shows non-conformity, or I fail to inform corrective actions within 30 days from the date of suspension, the licence will be processed for cancellation',
]

function blankOr(value: string): string {
  const v = value.trim()
  return v || '________________'
}

function buildBody(data: UndertakingOption2Data): string {
  const letterDate = dateOrNa(data.dateOfInspection.trim() || data.dateOfApplication)
  const declarant = blankOr(data.declarantName || data.contactPerson || data.applicantName)
  const product = blankOr(data.productForMark)
  const standard = blankOr(data.isStandard || data.isNumber)
  const factory = addressWithIndia(data.factoryAddress || data.applicantAddress)
  const sigName = data.signatoryName.trim() || data.declarantName.trim() || data.contactPerson.trim()

  return `
<div class="pd-sheet">
  ${letterheadHtml(data)}
  <h1 class="pd-title">Undertaking for Simplified Procedure (Option 2)</h1>

  <div class="pd-to-row">
    <div class="pd-to-block">${toBlockHtml(data.bisBranchName, data.bisBranchState)}</div>
    <div class="pd-date-block">
      <div><strong>Date of Inspection:</strong> ${esc(letterDate)}</div>
      <div><strong>Application No.:</strong> ${esc(applicationNoDisplay(data.applicationNumber))}</div>
    </div>
  </div>

  <p class="u2-salutation">Dear Sir</p>
  <p class="pd-body">
    I, <strong>${esc(declarant)}</strong> have applied for a license under Option 2 to you for use of BIS standard mark on
    <strong>${esc(product)}</strong> according to <strong>${esc(standard)}</strong> being manufactured at our factory at
    <strong>${esc(factory)}</strong>
  </p>
  <p class="pd-body"><strong>I clearly understand and agree to the conditions that-</strong></p>
  <div class="u2-conditions">
    ${CONDITIONS.map((text, i) => `<p><strong>${i + 1}.</strong> ${esc(text)}</p>`).join('')}
  </div>

  <div class="cmpf-sign-right">${signatoryHtml({ firmName: data.applicantName, name: sigName, designation: data.signatoryDesignation })}</div>
  ${preparedByHtml(data.preparedBy)}
</div>`
}

const STYLES = `
  .u2-salutation { margin: 0 0 8px; }
  .u2-conditions p { margin: 5px 0; font-size: 11px; line-height: 1.5; text-align: justify; break-inside: avoid; page-break-inside: avoid; }
  .cmpf-sign-right { margin-top: 14px; text-align: right; }
  .cmpf-sign-right .pd-signatory { text-align: left; }
`

export function buildUndertakingOption2Html(data: UndertakingOption2Data): string {
  return buildPrintPage({
    title: `Undertaking Option 2 — ${data.applicantName || 'Applicant'}`,
    styles: STYLES,
    body: buildBody(data),
  })
}

/** Maps a BIS project row + client + IS code + consultancy context into Option-2 undertaking fields. */
export function undertakingOption2DataFromPrintData(printData: BisPrintData): UndertakingOption2Data {
  const ctx = applicantContextFromPrintData(printData)
  const product =
    (printData.row.title ?? '').trim() || printData.isCode.title || printData.isCode.label
  return {
    ...ctx,
    declarantName: printData.client.contactPerson || printData.client.companyName,
    productForMark: product,
    isStandard: printData.isCode.label || printData.isCode.isNumber,
    factoryAddress: ctx.applicantAddress,
    signatoryName: printData.client.contactPerson,
    signatoryDesignation: '',
  }
}
