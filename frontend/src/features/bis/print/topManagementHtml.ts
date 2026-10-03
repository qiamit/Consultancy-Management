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

export type TopManagementRow = {
  personName: string
  designation: string
  email: string
  mobile: string
}

export type TopManagementData = PrintApplicantContext & {
  rows: TopManagementRow[]
  signatoryName: string
  signatoryDesignation: string
}

const MIN_ROWS = 5

function tableHtml(rows: TopManagementRow[]): string {
  const filled = rows.filter((r) => Object.values(r).some((v) => v.trim()))
  const body =
    filled.length > 0
      ? filled
          .map(
            (r, i) => `<tr>
      <td>${String(i + 1).padStart(2, '0')}</td>
      <td class="pd-left">${esc(r.personName) || '&nbsp;'}</td>
      <td>${esc(r.designation) || '&nbsp;'}</td>
      <td>${esc(r.email) || '&nbsp;'}</td>
      <td>${esc(r.mobile) || '&nbsp;'}</td>
    </tr>`,
          )
          .join('')
      : ''

  let pad = ''
  for (let i = filled.length; i < MIN_ROWS; i += 1) {
    pad += `<tr><td>${String(i + 1).padStart(2, '0')}</td><td class="pd-left">&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>`
  }

  return `
<table class="pd-table tm-table">
  <thead>
    <tr>
      <th style="width:8%">Sr.</th>
      <th>Name</th>
      <th>Designation</th>
      <th>Email</th>
      <th>Mobile</th>
    </tr>
  </thead>
  <tbody>${body}${pad}</tbody>
</table>`
}

function buildBody(data: TopManagementData): string {
  const letterDate = dateOrNa(data.dateOfInspection.trim() || data.dateOfApplication)
  const isStdRef = isStandardRefHtml(data.isNumber, data.isTitle)
  const sigName = data.signatoryName.trim() || data.contactPerson.trim()

  return `
<div class="pd-sheet">
  ${letterheadHtml(data)}
  <h1 class="pd-title">Top Management Details</h1>

  <div class="pd-to-row">
    <div class="pd-to-block">${toBlockHtml(data.bisBranchName, data.bisBranchState)}</div>
    <div class="pd-date-block">
      <div><strong>Date of Inspection:</strong> ${esc(letterDate)}</div>
      <div><strong>Application No.:</strong> ${esc(applicationNoDisplay(data.applicationNumber))}</div>
    </div>
  </div>

  <p class="pd-body">
    <strong>Sub:</strong> Details of Top Management for BIS licence application
    ${isStdRef ? ` under Indian Standard ${isStdRef}` : ''}.
  </p>
  <p class="pd-body">
    We, <strong>M/s. ${esc(data.applicantName)}</strong>,
    ${data.applicantAddress ? ` having our factory at <strong>${esc(data.applicantAddress)}</strong>,` : ''}
    hereby furnish the following details of our Top Management
    ${isStdRef ? ` in connection with BIS certification under ${isStdRef}` : ' in connection with BIS certification'}.
    The particulars are as under:
  </p>

  <div class="tm-box">${tableHtml(data.rows)}</div>

  <p class="pd-body">
    We declare that the information furnished above is true and correct to the best of our knowledge and belief.
    The persons listed above are responsible for the overall management and compliance of the unit with respect to
    BIS certification requirements.
  </p>

  <div class="cmpf-sign-right">${signatoryHtml({ firmName: data.applicantName, name: sigName, designation: data.signatoryDesignation })}</div>
  ${preparedByHtml(data.preparedBy)}
</div>`
}

const STYLES = `
  .tm-box { margin: 10px 0 14px; padding: 8px 10px; border: 1px solid #cbd5e1; background: #f8fafc; }
  .tm-table td { height: 8mm; }
  .cmpf-sign-right { margin-top: 14px; text-align: right; }
  .cmpf-sign-right .pd-signatory { text-align: left; }
`

export function buildTopManagementHtml(data: TopManagementData): string {
  return buildPrintPage({
    title: `Top Management — ${data.applicantName || 'Applicant'}`,
    styles: STYLES,
    body: buildBody(data),
  })
}

/** Maps a BIS project row + client + consultancy context into Top Management fields. */
export function topManagementDataFromPrintData(printData: BisPrintData): TopManagementData {
  const ctx = applicantContextFromPrintData(printData)
  const contact = printData.client.contactPerson.trim()
  return {
    ...ctx,
    rows: contact
      ? [
          {
            personName: contact,
            designation: '',
            email: printData.client.email,
            mobile: printData.client.mobile,
          },
        ]
      : [],
    signatoryName: contact,
    signatoryDesignation: '',
  }
}
