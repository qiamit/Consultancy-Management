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

export type RawMaterialRow = {
  rawMaterial: string
  supplierName: string
  bisCertificationMark: string
  testCertificate: string
  batchesPackaging: string
}

export type RawMaterialDetailsData = PrintApplicantContext & {
  rows: RawMaterialRow[]
  signatoryName: string
  signatoryDesignation: string
}

const MIN_ROWS = 10

function tableHtml(rows: RawMaterialRow[]): string {
  const filled = rows.filter((r) => Object.values(r).some((v) => v.trim()))
  const body = filled
    .map(
      (r, i) => `<tr>
      <td>${i + 1}</td>
      <td class="pd-left">${esc(r.rawMaterial) || '&nbsp;'}</td>
      <td>${esc(r.supplierName) || '&nbsp;'}</td>
      <td>${esc(r.bisCertificationMark) || '&nbsp;'}</td>
      <td>${esc(r.testCertificate) || '&nbsp;'}</td>
      <td>${esc(r.batchesPackaging) || '&nbsp;'}</td>
    </tr>`,
    )
    .join('')

  let pad = ''
  for (let i = filled.length; i < MIN_ROWS; i += 1) {
    pad += `<tr><td>${i + 1}</td><td class="pd-left">&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>`
  }

  return `
<table class="pd-table rmd-table">
  <thead>
    <tr>
      <th style="width:6%">Sr. No.</th>
      <th>Raw Material</th>
      <th>Name of Supplier</th>
      <th>With OR Without BIS Certification Mark</th>
      <th>Test Certificate of The Supplier</th>
      <th>How Received Batches / Lots Nature of Packaging</th>
    </tr>
  </thead>
  <tbody>${body}${pad}</tbody>
</table>`
}

function buildBody(data: RawMaterialDetailsData): string {
  const letterDate = inspectionDateOrToday(data.dateOfInspection)
  const isStdRef = isStandardRefHtml(data.isNumber, data.isTitle)
  const sigName = data.signatoryName.trim() || data.contactPerson.trim()

  return `
<div class="pd-sheet">
  ${letterheadHtml(data)}
  <h1 class="pd-title">Raw Material Details</h1>

  <div class="pd-to-row">
    <div class="pd-to-block">${toBlockHtml(data.bisBranchName, data.bisBranchState)}</div>
    <div class="pd-date-block">
      <div><strong>Date of Inspection:</strong> ${esc(letterDate)}</div>
      <div><strong>Application No.:</strong> ${esc(applicationNoDisplay(data.applicationNumber))}</div>
    </div>
  </div>

  <p class="pd-body">
    <strong>Sub:</strong> Details of Raw Materials used in the manufacture of product(s) covered under
    BIS licence application${isStdRef ? ` for Indian Standard ${isStdRef}` : ''}.
  </p>
  <p class="pd-body">
    We, <strong>M/s. ${esc(data.applicantName)}</strong>,
    ${data.applicantAddress ? ` having our factory at <strong>${esc(data.applicantAddress)}</strong>,` : ''}
    hereby furnish the following details of raw materials used in our manufacturing process
    ${isStdRef ? ` in connection with BIS certification under ${isStdRef}` : ' in connection with BIS certification'}.
    The particulars regarding the name of supplier, with or without BIS Certification Mark on raw material,
    test certificate of the supplier, and how received batches/lots with nature of packaging are as under:
  </p>

  ${tableHtml(data.rows)}

  <p class="pd-body">
    We declare that the information furnished above is true and correct to the best of our knowledge and belief.
    We undertake to maintain records of raw material receipts, supplier test certificates and batch/lot details,
    and to inform BIS of any change in raw material source, supplier or specifications.
  </p>

  <div class="cmpf-sign-right">${signatoryHtml({ firmName: data.applicantName, name: sigName, designation: data.signatoryDesignation })}</div>
  ${preparedByHtml(data.preparedBy)}
</div>`
}

const STYLES = `
  .rmd-table td { height: 7.5mm; font-size: 9.5px; }
  .cmpf-sign-right { margin-top: 14px; text-align: right; }
  .cmpf-sign-right .pd-signatory { text-align: left; }
`

export function buildRawMaterialDetailsHtml(data: RawMaterialDetailsData): string {
  return buildPrintPage({
    title: `Raw Material Details — ${data.applicantName || 'Applicant'}`,
    styles: STYLES,
    body: buildBody(data),
  })
}

/** Maps a BIS project row + client + consultancy context into Raw Material Details fields. */
export function rawMaterialDetailsDataFromPrintData(printData: BisPrintData): RawMaterialDetailsData {
  const ctx = applicantContextFromPrintData(printData)
  return {
    ...ctx,
    rows: [],
    signatoryName: printSignatoryDefaults(printData).signatoryName,
    signatoryDesignation: printSignatoryDefaults(printData).signatoryDesignation,
  }
}
