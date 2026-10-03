import { formatDisplayDate } from '../projects/types'
import type { BisPrintData } from './loadBisPrintData'
import { escapeHtml as esc } from './openPrintHtml'
import {
  applicantContextFromPrintData,
  applicationNoDisplay,
  buildPrintPage,
  isStandardRefHtml,
  letterheadHtml,
  preparedByHtml,
  signatoryHtml,
  toBlockHtml,
  type PrintApplicantContext,
} from './printDocumentShared'

export type OslSampleRow = {
  sampleName: string
  gradeType: string
  batchNo: string
  dateOfManufacture: string
  quantity: string
  testRequired: string
  remarks: string
}

export type OslSampleRequirementsData = PrintApplicantContext & {
  signatoryName: string
  signatoryDesignation: string
  rows: OslSampleRow[]
}

const MIN_BLANK_ROWS = 8

function sampleRows(rows: OslSampleRow[]): string {
  const filled = rows.filter((r) => Object.values(r).some((v) => v.trim()))
  const total = Math.max(MIN_BLANK_ROWS, filled.length)
  const out: string[] = []
  for (let i = 0; i < total; i += 1) {
    const r = filled[i]
    out.push(`<tr>
      <td>${i + 1}</td>
      <td class="pd-left">${r ? esc(r.sampleName) : '&nbsp;'}</td>
      <td>${r ? esc(r.gradeType) : '&nbsp;'}</td>
      <td>${r ? esc(r.batchNo) : '&nbsp;'}</td>
      <td>${r ? esc(r.dateOfManufacture ? formatDisplayDate(r.dateOfManufacture) : '') : '&nbsp;'}</td>
      <td>${r ? esc(r.quantity) : '&nbsp;'}</td>
      <td class="pd-left">${r ? esc(r.testRequired) : '&nbsp;'}</td>
      <td>${r ? esc(r.remarks) : '&nbsp;'}</td>
    </tr>`)
  }
  return out.join('')
}

function buildBody(data: OslSampleRequirementsData): string {
  const appNo = applicationNoDisplay(data.applicationNumber)
  const inspection = data.dateOfInspection.trim() ? formatDisplayDate(data.dateOfInspection) : 'N/A'
  const stdRef = isStandardRefHtml(data.isNumber, data.isTitle)
  const sigName = data.signatoryName.trim() || data.contactPerson.trim()

  return `
<div class="pd-sheet">
  ${letterheadHtml(data)}
  <h1 class="pd-title">OSL Sample Requirements</h1>

  <div class="pd-to-row">
    <div class="pd-to-block">${toBlockHtml(data.bisBranchName, data.bisBranchState)}</div>
    <div class="pd-date-block">
      <div><strong>Date of Inspection:</strong> ${esc(inspection)}</div>
      <div><strong>Application No.:</strong> ${esc(appNo)}</div>
    </div>
  </div>

  <p class="pd-body">
    <strong>Sub:</strong> Submission of samples for testing at Outside Testing Laboratory (OSL)${stdRef ? ` under Indian Standard ${stdRef}` : ''}.
  </p>

  <p class="pd-body">
    We, <strong>M/s. ${esc(data.applicantName)}</strong>${data.applicantAddress ? `, having our factory at <strong>${esc(data.applicantAddress)}</strong>,` : ','}
    are sending the following samples for testing at the designated Outside Testing Laboratory (OSL)${stdRef ? ` in connection with BIS certification under ${stdRef}` : ' in connection with BIS certification'}.
    The details of the samples are as under:
  </p>

  <table class="pd-table osl-table">
    <colgroup>
      <col style="width:5%"/><col style="width:22%"/><col style="width:13%"/><col style="width:12%"/><col style="width:12%"/><col style="width:9%"/><col style="width:17%"/><col style="width:10%"/>
    </colgroup>
    <thead>
      <tr>
        <th>Sr<br/>No</th>
        <th>Sample Description</th>
        <th>Grade / Type / Class</th>
        <th>Batch / Lot No.</th>
        <th>Date of Manufacture</th>
        <th>Quantity</th>
        <th>Tests Required</th>
        <th>Remarks</th>
      </tr>
    </thead>
    <tbody>${sampleRows(data.rows)}</tbody>
  </table>

  <div class="osl-closing">
    <p class="osl-declaration">
      We declare that the above samples have been prepared prior to grant of the BIS licence, are drawn from trial production,
      and are being manufactured for the purpose of obtaining the BIS licence. The information furnished above is true and
      correct to the best of our knowledge and belief.
    </p>
    <div class="osl-sign">${signatoryHtml({ firmName: data.applicantName, name: sigName, designation: data.signatoryDesignation })}</div>
  </div>
  ${preparedByHtml(data.preparedBy)}
</div>`
}

const STYLES = `
  .osl-table td { height: 8mm; }
  .osl-closing { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-top: 8px; break-inside: avoid; page-break-inside: avoid; }
  .osl-declaration { flex: 1; margin: 0; font-size: 11px; line-height: 1.4; text-align: justify; }
  .osl-sign { flex-shrink: 0; }
`

export function buildOslSampleRequirementsHtml(data: OslSampleRequirementsData): string {
  return buildPrintPage({
    title: `OSL Sample Requirements — ${data.applicantName || 'Applicant'}`,
    styles: STYLES,
    body: buildBody(data),
  })
}

/** Maps a BIS project row + client + IS code + consultancy context into OSL sample requirement fields. */
export function oslSampleRequirementsDataFromPrintData(printData: BisPrintData): OslSampleRequirementsData {
  const ctx = applicantContextFromPrintData(printData)
  return {
    ...ctx,
    signatoryName: printData.client.contactPerson,
    signatoryDesignation: '',
    rows: [],
  }
}
