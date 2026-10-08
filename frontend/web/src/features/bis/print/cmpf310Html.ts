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

export type Cmpf310Data = PrintApplicantContext & {
  referenceLetterNo: string
  referenceLetterDate: string
  unit: string
  firmScale: string
  unitRateRs: string
  markingFeeRs: string
  signatoryName: string
  signatoryDesignation: string
}

const BLANK = '________________'

function rupee(value: string): string {
  const v = value.trim()
  return v ? `Rs. ${v}` : ''
}

function paymentTerms(markingFeeInline: string): string[] {
  return [
    `The marking fee indicated above is ${markingFeeInline}, which shall constitute the minimum marking fee payable in advance for the validity period of the licence.`,
    'During the first year of operation, the actual marking fee shall be calculated by multiplying the unit rate stated above by the quantity of production marked with the Standard Mark during the first nine months of operation.',
    'For subsequent years, the actual marking fee shall be calculated by multiplying the unit rate by the quantity of production marked with the Standard Mark during the full year of operation.',
    'In case the actual marking fee calculated under clauses (B) and (C) above exceeds the advance minimum marking fee paid, we shall pay the difference to BIS within one month of submission of the marking fee return.',
    'We shall accept any variation in the rate of marking fee as may be specified under the revised regulations of the Government, and the same shall be borne by us.',
    'We shall not claim any refund in case the actual marking fee calculated under clauses (B) and (C) above is less than the tentative marking fee indicated above.',
  ]
}

function buildBody(data: Cmpf310Data): string {
  const letterDate = inspectionDateOrToday(data.dateOfInspection)
  const refDate = data.referenceLetterDate.trim() ? dateOrNa(data.referenceLetterDate) : BLANK
  const sigName = data.signatoryName.trim() || data.contactPerson.trim()
  const markingFeeInline = data.markingFeeRs.trim() ? rupee(data.markingFeeRs) : 'Rs. ________________'
  const td = (v: string) => (v.trim() ? esc(v) : '&nbsp;')

  return `
<div class="pd-sheet">
  ${letterheadHtml(data)}
  <div class="cmpf-form-id">CMPF - 310</div>
  <h1 class="pd-title">Acceptance of Rate of Marking Fee</h1>

  <div class="pd-to-row">
    <div class="pd-to-block">${toBlockHtml(data.bisBranchName, data.bisBranchState)}</div>
    <div class="pd-date-block">
      <div><strong>Date of Inspection:</strong> ${esc(letterDate)}</div>
      <div><strong>Application No.:</strong> ${esc(applicationNoDisplay(data.applicationNumber))}</div>
    </div>
  </div>

  <p class="pd-body">This has reference to your letter No. <strong>${esc(data.referenceLetterNo.trim() || BLANK)}</strong> dated <strong>${esc(refDate)}</strong>.</p>
  <p class="pd-body">I/We hereby agree to pay the tentative marking fee to the Bureau of Indian Standards at the rate indicated below, in accordance with Scheme-I of Schedule-II of the BIS (Conformity Assessment) Regulations, 2018.</p>

  <p class="cmpf-heading">1. Rate of Marking Fee</p>
  <table class="pd-table cmpf-table">
    <thead>
      <tr><th>Unit</th><th>Firm Scale</th><th>Unit Rate in Rs</th><th>Marking Fee in Rs</th></tr>
    </thead>
    <tbody>
      <tr>
        <td>${td(data.unit)}</td><td>${td(data.firmScale)}</td>
        <td>${td(data.unitRateRs)}</td><td>${td(data.markingFeeRs)}</td>
      </tr>
    </tbody>
  </table>

  <p class="cmpf-heading">2. The marking fee shall be payable as under:</p>
  <div class="cmpf-terms">
    ${paymentTerms(markingFeeInline)
      .map((text, i) => `<p><strong>${String.fromCharCode(65 + i)})</strong> ${esc(text)}</p>`)
      .join('')}
  </div>

  <div class="cmpf-sign-right">${signatoryHtml({ firmName: data.applicantName, name: sigName, designation: data.signatoryDesignation })}</div>
  ${preparedByHtml(data.preparedBy)}
</div>`
}

export function buildCmpf310Html(data: Cmpf310Data): string {
  return buildPrintPage({
    title: `CMPF 310 — ${data.applicantName || 'Applicant'}`,
    styles: CMPF_FORM_STYLES,
    body: buildBody(data),
  })
}

/** Maps a BIS project row + client + IS code + consultancy context into CMPF-310 fields. */
export function cmpf310DataFromPrintData(printData: BisPrintData): Cmpf310Data {
  return {
    ...applicantContextFromPrintData(printData),
    referenceLetterNo: '',
    referenceLetterDate: '',
    unit: '',
    firmScale: printData.client.scale,
    unitRateRs: '',
    markingFeeRs: '',
    signatoryName: printSignatoryDefaults(printData).signatoryName,
    signatoryDesignation: printSignatoryDefaults(printData).signatoryDesignation,
  }
}
