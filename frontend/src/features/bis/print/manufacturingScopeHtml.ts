import type { BisPrintData } from './loadBisPrintData'
import { escapeHtml as esc } from './openPrintHtml'
import {
  applicantContextFromPrintData,
  applicationNoDisplay,
  buildPrintPage,
  dateOrNa,
  isStandardRefHtml,
  letterheadHtml,
  preparedByHtml,
  signatoryHtml,
  toBlockHtml,
  type PrintApplicantContext,
} from './printDocumentShared'

export type ManufacturingScopeData = PrintApplicantContext & {
  licenseScope: string
  signatoryName: string
  signatoryDesignation: string
}

function buildBody(data: ManufacturingScopeData): string {
  const letterDate = dateOrNa(data.dateOfInspection.trim() || data.dateOfApplication)
  const isStdRef = isStandardRefHtml(data.isNumber, data.isTitle)
  const scopeText = data.licenseScope.trim() || '—'
  const sigName = data.signatoryName.trim() || data.contactPerson.trim()

  return `
<div class="pd-sheet">
  ${letterheadHtml(data)}
  <h1 class="pd-title">Declaration Regarding Manufacturing Scope</h1>

  <div class="pd-to-row">
    <div class="pd-to-block">${toBlockHtml(data.bisBranchName, data.bisBranchState)}</div>
    <div class="pd-date-block">
      <div><strong>Date of Inspection:</strong> ${esc(letterDate)}</div>
      <div><strong>Application No.:</strong> ${esc(applicationNoDisplay(data.applicationNumber))}</div>
    </div>
  </div>

  <p class="pd-body">
    <strong>Sub:</strong> Declaration regarding manufacturing scope
    ${isStdRef ? ` under Indian Standard ${isStdRef}` : ''}.
  </p>

  <p class="pd-body">
    We, <strong>M/s. ${esc(data.applicantName)}</strong>,
    ${data.applicantAddress ? ` having our factory at <strong>${esc(data.applicantAddress)}</strong>,` : ''}
    hereby declare that our manufacturing scope for BIS certification
    ${isStdRef ? ` under ${isStdRef}` : ''}
    is as follows:
  </p>

  <div class="ms-scope-box">
    <div class="ms-scope-label">License Scope</div>
    <div class="ms-scope-body">${esc(scopeText).replace(/\n/g, '<br/>')}</div>
  </div>

  <p class="pd-body">
    We further declare that the above information is true and correct to the best of our knowledge and belief.
    We undertake to inform BIS of any change in the manufacturing scope covered under the licence.
  </p>

  <div class="cmpf-sign-right">${signatoryHtml({ firmName: data.applicantName, name: sigName, designation: data.signatoryDesignation })}</div>
  ${preparedByHtml(data.preparedBy)}
</div>`
}

const STYLES = `
  .ms-scope-box { margin: 10px 0 14px; padding: 8px 10px; border: 1px solid #cbd5e1; background: #f8fafc; min-height: 28mm; }
  .ms-scope-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #64748b; margin-bottom: 4px; }
  .ms-scope-body { font-size: 11px; line-height: 1.45; white-space: pre-wrap; }
  .cmpf-sign-right { margin-top: 14px; text-align: right; }
  .cmpf-sign-right .pd-signatory { text-align: left; }
`

export function buildManufacturingScopeHtml(data: ManufacturingScopeData): string {
  return buildPrintPage({
    title: `Manufacturing Scope — ${data.applicantName || 'Applicant'}`,
    styles: STYLES,
    body: buildBody(data),
  })
}

/** Maps a BIS project row + client + IS code + consultancy context into Manufacturing Scope fields. */
export function manufacturingScopeDataFromPrintData(printData: BisPrintData): ManufacturingScopeData {
  const ctx = applicantContextFromPrintData(printData)
  const product =
    (printData.row.title ?? '').trim() || printData.isCode.title || printData.isCode.label
  return {
    ...ctx,
    licenseScope: product,
    signatoryName: printData.client.contactPerson,
    signatoryDesignation: '',
  }
}
