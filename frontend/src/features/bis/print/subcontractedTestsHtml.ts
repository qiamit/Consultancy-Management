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

export type SubcontractedTestRow = {
  testName: string
  clauseNo: string
  testMethod: string
  unit: string
  laboratoryName: string
}

export type SubcontractedTestsData = PrintApplicantContext & {
  rows: SubcontractedTestRow[]
  signatoryName: string
  signatoryDesignation: string
}

const MIN_ROWS = 8

function tableHtml(rows: SubcontractedTestRow[]): string {
  const filled = rows.filter((r) => Object.values(r).some((v) => v.trim()))
  const body = filled
    .map(
      (r, i) => `<tr>
      <td>${i + 1}</td>
      <td class="pd-left">${esc(r.testName) || '&nbsp;'}</td>
      <td>${esc(r.clauseNo) || '&nbsp;'}</td>
      <td>${esc(r.testMethod) || '&nbsp;'}</td>
      <td>${esc(r.unit) || '&nbsp;'}</td>
      <td class="pd-left">${esc(r.laboratoryName) || '&nbsp;'}</td>
    </tr>`,
    )
    .join('')

  let pad = ''
  for (let i = filled.length; i < MIN_ROWS; i += 1) {
    pad += `<tr><td>${i + 1}</td><td class="pd-left">&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td class="pd-left">&nbsp;</td></tr>`
  }

  return `
<table class="pd-table sct-table">
  <thead>
    <tr>
      <th style="width:5%">Sr</th>
      <th style="width:22%">Test Parameter</th>
      <th style="width:10%">Clause</th>
      <th style="width:18%">Test Method</th>
      <th style="width:8%">Unit</th>
      <th style="width:37%">Subcontract Laboratory</th>
    </tr>
  </thead>
  <tbody>${body}${pad}</tbody>
</table>`
}

function buildBody(data: SubcontractedTestsData): string {
  const letterDate = dateOrNa(data.dateOfInspection.trim() || data.dateOfApplication)
  const isStdRef = isStandardRefHtml(data.isNumber, data.isTitle)
  const sigName = data.signatoryName.trim() || data.contactPerson.trim()

  return `
<div class="pd-sheet">
  ${letterheadHtml(data)}
  <h1 class="pd-title">Declaration Regarding Test Parameters Subcontracted</h1>

  <div class="pd-to-row">
    <div class="pd-to-block">${toBlockHtml(data.bisBranchName, data.bisBranchState)}</div>
    <div class="pd-date-block">
      <div><strong>Date of Inspection:</strong> ${esc(letterDate)}</div>
      <div><strong>Application No.:</strong> ${esc(applicationNoDisplay(data.applicationNumber))}</div>
    </div>
  </div>

  <p class="pd-body">
    <strong>Sub:</strong> Declaration regarding test parameters subcontracted to accredited laboratories
    ${isStdRef ? ` for Indian Standard ${isStdRef}` : ''}.
  </p>
  <p class="pd-body">
    We, <strong>M/s. ${esc(data.applicantName)}</strong>,
    ${data.applicantAddress ? ` having our factory at <strong>${esc(data.applicantAddress)}</strong>,` : ''}
    hereby declare that the following test parameters required for BIS certification
    ${isStdRef ? ` under ${isStdRef}` : ''}
    are not available in our in-house testing facility and are being carried out through
    BIS Recognized / ISO/IEC 17025 accredited laboratories:
  </p>

  ${tableHtml(data.rows)}

  <p class="pd-body">
    We further declare that the above particulars are true and correct to the best of our knowledge and belief.
    We undertake to maintain proper records of subcontracted testing and to inform BIS of any change in the
    list of subcontracted test parameters or laboratories.
  </p>

  <div class="cmpf-sign-right">${signatoryHtml({ firmName: data.applicantName, name: sigName, designation: data.signatoryDesignation })}</div>
  ${preparedByHtml(data.preparedBy)}
</div>`
}

const STYLES = `
  .sct-table td { height: 7.5mm; font-size: 9.5px; }
  .cmpf-sign-right { margin-top: 14px; text-align: right; }
  .cmpf-sign-right .pd-signatory { text-align: left; }
`

export function buildSubcontractedTestsHtml(data: SubcontractedTestsData): string {
  return buildPrintPage({
    title: `Subcontracted Tests — ${data.applicantName || 'Applicant'}`,
    styles: STYLES,
    body: buildBody(data),
  })
}

/** Maps a BIS project row + client + consultancy context into Subcontracted Tests fields. */
export function subcontractedTestsDataFromPrintData(printData: BisPrintData): SubcontractedTestsData {
  const ctx = applicantContextFromPrintData(printData)
  return {
    ...ctx,
    rows: [],
    signatoryName: printData.client.contactPerson,
    signatoryDesignation: '',
  }
}
