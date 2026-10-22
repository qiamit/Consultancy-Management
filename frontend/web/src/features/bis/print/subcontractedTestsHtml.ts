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

export type SubcontractedTestRow = {
  clauseNo: string
  testName: string
  laboratoryName: string
}

export type SubcontractedTestsData = PrintApplicantContext & {
  rows: SubcontractedTestRow[]
  signatoryName: string
  signatoryDesignation: string
}

function tableHtml(rows: SubcontractedTestRow[]): string {
  const filled = rows.filter((r) => r.testName.trim() || r.clauseNo.trim())
  const body = filled.length
    ? filled
        .map(
          (r, i) => `<tr>
      <td>${i + 1}</td>
      <td>${esc(r.clauseNo) || '&nbsp;'}</td>
      <td class="pd-left">${esc(r.testName) || '&nbsp;'}</td>
      <td class="pd-left">${esc(r.laboratoryName) || '&nbsp;'}</td>
    </tr>`,
        )
        .join('')
    : '<tr><td colspan="4">No test is sub-contracted.</td></tr>'

  return `
<table class="pd-table sct-table">
  <thead>
    <tr>
      <th style="width:6%">Sr. No.</th>
      <th style="width:16%">Clause No. of IS</th>
      <th style="width:39%">Test to be Sub-Contracted</th>
      <th style="width:39%">Name of Lab (BIS Recognised / Empanelled)</th>
    </tr>
  </thead>
  <tbody>${body}</tbody>
</table>`
}

function buildBody(data: SubcontractedTestsData): string {
  const letterDate = inspectionDateOrToday(data.dateOfInspection)
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
  .cmpf-sign-right .pd-signatory { text-align: right; margin-left: auto; }
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
    rows: subcontractedRowsFrom(printData.modulePayload),
    signatoryName: printSignatoryDefaults(printData).signatoryName,
    signatoryDesignation: printSignatoryDefaults(printData).signatoryDesignation,
  }
}

function subcontractedRowsFrom(payload: unknown): SubcontractedTestRow[] {
  const rows = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).rows : null
  if (!Array.isArray(rows)) return []
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim())
  return rows
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map((r) => ({ clauseNo: text(r.clauseNo), testName: text(r.testName), laboratoryName: text(r.laboratoryName) }))
    .filter((r) => r.testName || r.clauseNo)
}
