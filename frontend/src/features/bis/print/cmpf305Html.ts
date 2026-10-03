import { formatDisplayDate } from '../projects/types'
import type { BisPrintData } from './loadBisPrintData'
import { escapeHtml as esc } from './openPrintHtml'
import {
  addressWithIndia,
  applicantContextFromPrintData,
  applicationNoDisplay,
  buildPrintPage,
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
  const dateInsp = dateOrNa(data.dateOfInspection)
  const repName = data.firmRepName.trim() || data.contactPerson.trim() || '—'
  const repDesig = data.firmRepDesignation.trim() || '—'
  const bisName = data.inspectionOfficerName.trim() || '----'
  const bisDesig = data.inspectionOfficerDesignation.trim() || '----'

  return `
<div class="pd-sheet">
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

  <table class="pd-table c305-table">
    <colgroup>
      <col style="width:6%"/><col style="width:30%"/><col style="width:16%"/><col style="width:20%"/><col style="width:10%"/><col style="width:18%"/>
    </colgroup>
    <thead>
      <tr>
        <th>Sr<br/>No</th>
        <th>Machinery Name</th>
        <th>Make</th>
        <th>Production Capacity / Day<br/>(If Applicable)</th>
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
        <p>I hereby declare that the machinery of which details are given above is owned by me and is actually installed in the premises.*</p>
        <p>I also declare that in case of grant of licence, I will send prior intimation to BIS whenever any machinery is taken out of the premises of the firm due to any reason.</p>
        <div class="c305-sig">
          <div>Sig. of Firm's Representative :-</div>
          <div class="c305-sig-gap"></div>
          <div>Name :- ${esc(repName)}</div>
          <div>Designation :- ${esc(repDesig)}</div>
          <div>Date :- ${esc(dateInsp)}</div>
        </div>
      </td>
      <td>
        <p style="text-align:right">I have checked and found that the machinery of which details are given above was available during my inspection.</p>
        <div class="c305-sig" style="text-align:right">
          <div>Sig. of BIS Certification Officer :-</div>
          <div class="c305-sig-gap"></div>
          <div>Name :- ${esc(bisName)}</div>
          <div>Designation :- ${esc(bisDesig)}</div>
          <div>Date :- ${esc(dateInsp)}</div>
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

/** Maps a BIS project row + client + IS code + consultancy context into CMPF-305 fields. */
export function cmpf305DataFromPrintData(printData: BisPrintData): Cmpf305Data {
  const ctx = applicantContextFromPrintData(printData)
  return {
    ...ctx,
    firmRepName: printData.client.contactPerson,
    firmRepDesignation: '',
    inspectionOfficerName: '',
    inspectionOfficerDesignation: '',
    rows: [],
  }
}
