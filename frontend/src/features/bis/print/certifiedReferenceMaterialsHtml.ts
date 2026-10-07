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

export type CrmRow = {
  crmName: string
  supplierName: string
  accreditedRmp: string
  certificateLotNo: string
  validityPeriod: string
}

export type CertifiedReferenceMaterialsData = PrintApplicantContext & {
  rows: CrmRow[]
  signatoryName: string
  signatoryDesignation: string
}

const MIN_ROWS = 10

function tableHtml(rows: CrmRow[]): string {
  const filled = rows.filter((r) => Object.values(r).some((v) => v.trim()))
  const body = filled
    .map(
      (r, i) => `<tr>
      <td>${i + 1}</td>
      <td class="pd-left">${esc(r.crmName) || '&nbsp;'}</td>
      <td>${esc(r.supplierName) || '&nbsp;'}</td>
      <td>${esc(r.accreditedRmp) || '&nbsp;'}</td>
      <td>${esc(r.certificateLotNo) || '&nbsp;'}</td>
      <td>${esc(r.validityPeriod) || '&nbsp;'}</td>
    </tr>`,
    )
    .join('')

  let pad = ''
  for (let i = filled.length; i < MIN_ROWS; i += 1) {
    pad += `<tr><td>${i + 1}</td><td class="pd-left">&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>`
  }

  return `
<table class="pd-table crm-table">
  <thead>
    <tr>
      <th style="width:6%">Sr. No.</th>
      <th>Certified Reference Material</th>
      <th>Name of Supplier / Manufacturer</th>
      <th>From Accredited RMP (Yes / No)</th>
      <th>CRM Certificate / Lot No.</th>
      <th>Validity / Expiry Period</th>
    </tr>
  </thead>
  <tbody>${body}${pad}</tbody>
</table>`
}

function buildBody(data: CertifiedReferenceMaterialsData): string {
  const letterDate = inspectionDateOrToday(data.dateOfInspection)
  const isStdRef = isStandardRefHtml(data.isNumber, data.isTitle)
  const sigName = data.signatoryName.trim() || data.contactPerson.trim()

  return `
<div class="pd-sheet">
  ${letterheadHtml(data)}
  <h1 class="pd-title">List of Certified Reference Material</h1>

  <div class="pd-to-row">
    <div class="pd-to-block">${toBlockHtml(data.bisBranchName, data.bisBranchState)}</div>
    <div class="pd-date-block">
      <div><strong>Date of Inspection:</strong> ${esc(letterDate)}</div>
      <div><strong>Application No.:</strong> ${esc(applicationNoDisplay(data.applicationNumber))}</div>
    </div>
  </div>

  <p class="pd-body">
    <strong>Sub:</strong> List of Certified Reference Materials (CRMs) used in the testing /
    calibration activities in connection with BIS licence application
    ${isStdRef ? ` for Indian Standard ${isStdRef}` : ''}.
  </p>
  <p class="pd-body">
    We, <strong>M/s. ${esc(data.applicantName)}</strong>,
    ${data.applicantAddress ? ` having our factory / laboratory at <strong>${esc(data.applicantAddress)}</strong>,` : ''}
    hereby furnish the list of Certified Reference Materials (CRMs) used in our in-house testing
    activities ${isStdRef ? ` in connection with BIS certification under ${isStdRef}` : ' in connection with BIS certification'}.
    The particulars regarding the name of CRM, supplier / manufacturer, whether procured from an
    accredited Reference Material Producer (RMP), CRM certificate / lot number, and validity /
    expiry period are as under:
  </p>

  ${tableHtml(data.rows)}

  <p class="pd-body">
    We declare that the information furnished above is true and correct to the best of our knowledge
    and belief. We undertake to maintain records of CRM procurement, certificates of analysis,
    traceability and validity, and to inform BIS of any change in CRM source, supplier or specifications.
  </p>

  <div class="cmpf-sign-right">${signatoryHtml({ firmName: data.applicantName, name: sigName, designation: data.signatoryDesignation })}</div>
  ${preparedByHtml(data.preparedBy)}
</div>`
}

const STYLES = `
  .crm-table td { height: 7.5mm; font-size: 9.5px; }
  .cmpf-sign-right { margin-top: 14px; text-align: right; }
  .cmpf-sign-right .pd-signatory { text-align: left; }
`

export function buildCertifiedReferenceMaterialsHtml(data: CertifiedReferenceMaterialsData): string {
  return buildPrintPage({
    title: `CRM List — ${data.applicantName || 'Applicant'}`,
    styles: STYLES,
    body: buildBody(data),
  })
}

/** Maps a BIS project row + client + consultancy context into CRM list fields. */
export function certifiedReferenceMaterialsDataFromPrintData(
  printData: BisPrintData,
): CertifiedReferenceMaterialsData {
  const ctx = applicantContextFromPrintData(printData)
  return {
    ...ctx,
    rows: [],
    signatoryName: printSignatoryDefaults(printData).signatoryName,
    signatoryDesignation: printSignatoryDefaults(printData).signatoryDesignation,
  }
}
