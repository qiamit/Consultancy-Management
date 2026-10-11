import { parseCmpf305Payload } from '../projects/cmpf305Model'
import { formatDisplayDate } from '../projects/types'
import type { BisPrintData } from './loadBisPrintData'
import { printSignatoryDefaults } from './loadBisPrintData'
import { escapeHtml as esc } from './openPrintHtml'
import {
  addressWithIndia,
  applicantContextFromPrintData,
  applicationNoDisplay,
  buildPrintPage,
  inspectionDateOrToday,
  letterheadHtml,
  preparedByHtml,
  toBlockHtml,
  type PrintApplicantContext,
} from './printDocumentShared'

export type Cmpf305MachineryRow = {
  machineryName: string
  make: string
  capacityPerDay: string
  number: string
  remarks: string
}

export type Cmpf305Data = PrintApplicantContext & {
  firmRepName: string
  firmRepDesignation: string
  inspectionOfficerName: string
  inspectionOfficerDesignation: string
  rows: Cmpf305MachineryRow[]
}

const MIN_BLANK_ROWS = 15

function dateOrNa(raw: string): string {
  const v = (raw ?? '').trim()
  return v ? formatDisplayDate(v) : 'N/A'
}

function machineryRows(rows: Cmpf305MachineryRow[]): string {
  const filled = rows.filter((r) => Object.values(r).some((v) => v.trim()))
  const total = Math.max(MIN_BLANK_ROWS, filled.length)
  const out: string[] = []
  for (let i = 0; i < total; i += 1) {
    const r = filled[i]
    out.push(`<tr>
      <td>${i + 1}</td>
      <td class="pd-left">${r ? esc(r.machineryName) : '&nbsp;'}</td>
      <td>${r ? esc(r.make) : '&nbsp;'}</td>
      <td>${r ? esc(r.capacityPerDay) : '&nbsp;'}</td>
      <td>${r ? esc(r.number) : '&nbsp;'}</td>
      <td>${r ? esc(r.remarks) : '&nbsp;'}</td>
    </tr>`)
  }
  return out.join('')
}

function buildBody(data: Cmpf305Data): string {
  const appNo = applicationNoDisplay(data.applicationNumber)
  const dateApp = dateOrNa(data.dateOfApplication)
  const dateInsp = inspectionDateOrToday(data.dateOfInspection)
  const repName = data.firmRepName.trim() || data.contactPerson.trim() || '—'
  const repDesig = data.firmRepDesignation.trim() || '—'
  const bisName = data.inspectionOfficerName.trim() || '----'
  const bisDesig = data.inspectionOfficerDesignation.trim() || '----'

  return `
<div class="pd-sheet c305-page-one">
  ${letterheadHtml(data)}
  <div class="c305-form-id">Form - I</div>
  <h1 class="pd-title">Declaration Regarding Manufacturing Machinery</h1>

  <table class="pd-meta">
    <tr><td class="pd-lbl">Applicant Name</td><td colspan="3"><strong>${esc(data.applicantName || '—')}</strong></td></tr>
    <tr><td class="pd-lbl">Applicant Address</td><td colspan="3">${esc(addressWithIndia(data.applicantAddress))}</td></tr>
    <tr>
      <td class="pd-lbl">Application No.</td><td>${esc(appNo)}</td>
      <td class="pd-lbl">Date of Application</td><td>${esc(dateApp)}</td>
    </tr>
    <tr>
      <td class="pd-lbl">IS Code</td><td>${esc(data.isNumber || '—')}</td>
      <td class="pd-lbl">Date of Inspection</td><td>${esc(dateInsp)}</td>
    </tr>
  </table>

  <div class="c305-to">${toBlockHtml(data.bisBranchName, data.bisBranchState)}</div>
</div>

<div class="pd-sheet c305-page-two">
  ${letterheadHtml(data)}
  <div class="c305-form-id">Form - I (Continued)</div>
  <h1 class="pd-title">Declaration Regarding Manufacturing Machinery</h1>
  <p class="c305-no-cross">No entry to be crossed</p>

  <table class="pd-meta c305-reference">
    <tr><td class="pd-lbl">Application/Licence No.</td><td>${esc(appNo)}</td></tr>
    <tr><td class="pd-lbl">Name/Address</td><td><strong>${esc(data.applicantName || '—')}</strong><br/>${esc(addressWithIndia(data.applicantAddress))}</td></tr>
  </table>

  <table class="pd-table c305-table">
    <colgroup>
      <col style="width:7%"/><col style="width:25%"/><col style="width:20%"/><col style="width:20%"/><col style="width:10%"/><col style="width:18%"/>
    </colgroup>
    <thead>
      <tr>
        <th>Sr.<br/>No.</th>
        <th>Machinery</th>
        <th>Make /<br/>Identification No.</th>
        <th>Production capacity per day,<br/>if applicable</th>
        <th>Number</th>
        <th>Remarks</th>
      </tr>
    </thead>
    <tbody>${machineryRows(data.rows)}</tbody>
  </table>
  <p class="pd-note">Note: Attach extra sheet, if required.</p>

  <table class="c305-decl">
    <tr>
      <td>
        <p>I hereby declare that the machinery details given above are available with us.</p>
        <p>I also declare that I will send prior intimation to Bureau of Indian Standards whenever any machinery is not available due to any reason.</p>
        <div class="c305-sig">
          <div>Signature of Firm's Representative</div>
          <div class="c305-sig-gap"></div>
          <div>Name: ${esc(repName)}</div>
          <div>Designation: ${esc(repDesig)}</div>
          <div>Date: ${esc(dateApp)}</div>
        </div>
      </td>
      <td>
        <p>I have verified the availability of the above mentioned machinery during my inspection.</p>
        <div class="c305-sig">
          <div>Signature of BIS Certification Officer</div>
          <div class="c305-sig-gap"></div>
          <div>Name: ${esc(bisName)}</div>
          <div>Designation: ${esc(bisDesig)}</div>
          <div>Date of verification: ${esc(dateInsp)}</div>
        </div>
      </td>
    </tr>
  </table>
  <p class="c305-footnote">* If any part of the manufacturing activity is outsourced, details of machinery used for the outsourced activity shall be indicated in a separate form along with the complete address of the outsourced premises.</p>
  ${preparedByHtml(data.preparedBy)}
</div>`
}

const STYLES = `
  .c305-form-id { text-align: right; font-weight: 700; font-size: 11px; margin-bottom: 4px; }
  .c305-to { font-size: 11.5px; line-height: 1.45; margin: 6px 0 4px; }
  .c305-no-cross { text-align: center; font-size: 11px; font-weight: 700; margin: -6px 0 6px; }
  .c305-reference { margin-bottom: 6px; }
  .c305-table td { height: 7mm; }
  .c305-decl { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 6px; page-break-inside: avoid; break-inside: avoid; }
  .c305-decl > tbody > tr > td, .c305-decl > tr > td { border: 1px solid #111; vertical-align: top; padding: 6px 8px; width: 50%; font-size: 11px; line-height: 1.4; }
  .c305-decl p { margin: 0 0 6px; text-align: justify; }
  .c305-sig { margin-top: 10px; font-size: 11px; line-height: 1.5; }
  .c305-sig-gap { height: 14mm; }
  .c305-footnote { font-size: 10px; font-weight: 700; line-height: 1.4; text-align: justify; margin: 6px 0 0; }
`

export function buildCmpf305Html(data: Cmpf305Data): string {
  return buildPrintPage({
    title: `CMPF 305 — ${data.applicantName || 'Applicant'}`,
    styles: STYLES,
    body: buildBody(data),
  })
}

/** Maps project + saved CMPF-305 module payload into print fields. */
export function cmpf305DataFromPrintData(printData: BisPrintData): Cmpf305Data {
  const ctx = applicantContextFromPrintData(printData)
  const parsed = parseCmpf305Payload(
    printData.modulePayload && typeof printData.modulePayload === 'object'
      ? (printData.modulePayload as Record<string, unknown>)
      : null,
  )
  const sig = printSignatoryDefaults(printData)
  return {
    ...ctx,
    firmRepName:
      parsed.firmRepName || sig.signatoryName || printData.client.contactPerson,
    firmRepDesignation: parsed.firmRepDesignation || sig.signatoryDesignation,
    inspectionOfficerName:
      parsed.inspectionOfficerName ||
      (printData.row.inspection_officer_name ?? '').trim(),
    inspectionOfficerDesignation:
      parsed.inspectionOfficerDesignation ||
      (printData.row.inspection_officer_designation ?? '').trim(),
    rows: parsed.rows.filter((r) => Object.values(r).some((v) => v.trim())),
  }
}
