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
  signatureImageUrl?: string
  inspectionOfficerName: string
  inspectionOfficerDesignation: string
  rows: Cmpf305MachineryRow[]
}

const ROWS_PER_CONTINUATION_PAGE = 18
const MIN_ROWS_ON_CONTINUATION_PAGE = 15

function dateOrNa(raw: string): string {
  const value = (raw ?? '').trim()
  return value ? formatDisplayDate(value) : 'N/A'
}

function machineryRows(rows: Cmpf305MachineryRow[], startIndex: number): string {
  return rows.map((row, index) => `<tr>
    <td>${startIndex + index + 1}</td>
    <td class="pd-left">${row.machineryName ? esc(row.machineryName) : '&nbsp;'}</td>
    <td>${row.make ? esc(row.make) : '&nbsp;'}</td>
    <td>${row.capacityPerDay ? esc(row.capacityPerDay) : '&nbsp;'}</td>
    <td>${row.number ? esc(row.number) : '&nbsp;'}</td>
    <td>${row.remarks ? esc(row.remarks) : '&nbsp;'}</td>
  </tr>`).join('')
}

function machineryTable(rows: string, attachmentRows = false): string {
  return `<table class="pd-table c305-table">
    <colgroup>
      <col style="width:7%"/><col style="width:25%"/><col style="width:20%"/><col style="width:20%"/><col style="width:10%"/><col style="width:18%"/>
    </colgroup>
    <thead><tr>
      <th>Sr.<br/>No.</th><th>Name of the Machinery</th><th>Make</th>
      <th>Production Capacity</th><th>Number</th><th>Remarks</th>
    </tr></thead>
    <tbody>${rows || (attachmentRows
      ? '<tr><td colspan="6" class="c305-attached">Separate Sheet Attached</td></tr>'
      : '')}</tbody>
  </table>`
}

function pageSignature(data: Cmpf305Data, dateApp: string): string {
  const name = data.firmRepName.trim() || data.contactPerson.trim() || '—'
  const designation = data.firmRepDesignation.trim()
  const signatureImage = data.signatureImageUrl?.trim()
  return `<div class="c305-page-signature">
    <div>For <strong>${esc(data.applicantName || 'Applicant Firm')}</strong></div>
    ${signatureImage ? `<img class="c305-sign-image" src="${esc(signatureImage)}" alt="Authorized signatory stamp and signature" />` : '<div class="c305-sign-gap"></div>'}
    <div class="c305-sign-line"></div>
    <div><strong>${esc(name)}</strong>${designation ? ` (${esc(designation)})` : ''}</div>
    <div>Firm Representative Seal &amp; Signature</div>
    <div>Date: ${esc(dateApp)}</div>
  </div>`
}

function firstPageDeclarations(data: Cmpf305Data, dateInsp: string): string {
  const firmName = data.firmRepName.trim() || data.contactPerson.trim() || '—'
  const firmDesignation = data.firmRepDesignation.trim() || '—'
  const officerName = data.inspectionOfficerName.trim() || '----'
  const officerDesignation = data.inspectionOfficerDesignation.trim() || '----'
  const signatureImage = data.signatureImageUrl?.trim()
  return `<div class="c305-declaration-panels">
    <section class="c305-declaration-panel">
      <p>I hereby declare that the machinery of which details are given overleaf is owned by me and are actually installed in the premises.*</p>
      <p>I also declare that in case of grant of licence, I will send prior intimation to BIS whenever any machinery is taken out of the premises of the firm due to any reason.</p>
      <div class="c305-panel-signature">
        <div class="c305-panel-signature-title">Sig. of Firm’s Representative :-</div>
        <div class="c305-panel-stamp">${signatureImage ? `<img src="${esc(signatureImage)}" alt="Authorized signatory stamp and signature" />` : ''}</div>
        <div><span>Name</span><span>:-</span><strong>${esc(firmName)}</strong></div>
        <div><span>Designation</span><span>:-</span><strong>${esc(firmDesignation)}</strong></div>
        <div><span>Date</span><span>:-</span><strong>${esc(dateInsp)}</strong></div>
      </div>
    </section>
    <section class="c305-declaration-panel">
      <p>I have checked and found that machinery of which details are given overleaf was available during my inspection.</p>
      <div class="c305-panel-signature c305-officer-signature">
        <div class="c305-panel-signature-title">Sig. of BIS Certification Officer :-</div>
        <div class="c305-panel-stamp"></div>
        <div><span>Name</span><span>:-</span><strong>${esc(officerName)}</strong></div>
        <div><span>Designation</span><span>:-</span><strong>${esc(officerDesignation)}</strong></div>
        <div><span>Date</span><span>:-</span><strong>${esc(dateInsp)}</strong></div>
      </div>
    </section>
  </div>
  <p class="c305-outsourced-note">* If any part of the manufacturing activity is outsourced, details of machinery used for the outsourced activity shall be indicated in a separate form along with the complete address of the outsourced premises.</p>`
}

function firstPage(data: Cmpf305Data, appNo: string, dateApp: string, dateInsp: string): string {
  return `<div class="pd-sheet c305-page-one">
    <div class="c305-form-id">Form - I</div>
    <h1 class="pd-title">Declaration Regarding Manufacturing Machinery</h1>
    <div class="pd-to-row c305-recipient">
      <div class="pd-to-block">${toBlockHtml(data.bisBranchName, data.bisBranchState)}</div>
      <div class="pd-date-block"><div>Date of Inspection: <strong>${esc(dateInsp)}</strong></div><div>Application No.: <strong>${esc(appNo)}</strong></div></div>
    </div>
    <p class="c305-application-paragraph"><span>Respected Sir,</span><br/><span>we, <strong>M/s. ${esc(data.applicantName || '—')}</strong>, submit the machinery declaration for <strong>${esc(data.isNumber || 'the applicable Indian Standard')}</strong>, Application No. <strong>${esc(appNo)}</strong>, dated <strong>${esc(dateApp)}</strong>. The required machinery is installed at <strong>${esc(addressWithIndia(data.applicantAddress))}</strong>, available for inspection, and recorded in the attached sheet. Inspection date: <strong>${esc(dateInsp)}</strong>.</span></p>
    ${machineryTable('', true)}
    <p class="pd-note c305-note">Note: Attach extra sheet, if required.</p>
    ${firstPageDeclarations(data, dateInsp)}
  </div>`
}

function continuationPage(
  data: Cmpf305Data,
  appNo: string,
  dateApp: string,
  dateInsp: string,
  rows: Cmpf305MachineryRow[],
  startIndex: number,
): string {
  const visibleRows = [...rows]
  const targetRows = Math.max(MIN_ROWS_ON_CONTINUATION_PAGE, visibleRows.length)
  while (visibleRows.length < targetRows) {
    visibleRows.push({ machineryName: '', make: '', capacityPerDay: '', number: '', remarks: '' })
  }
  return `<div class="pd-sheet c305-continuation">
    ${letterheadHtml(data)}
    <div class="pd-to-row c305-recipient">
      <div class="pd-to-block">${toBlockHtml(data.bisBranchName, data.bisBranchState)}</div>
      <div class="pd-date-block"><div>Date of Inspection: <strong>${esc(dateInsp)}</strong></div><div>Application No.: <strong>${esc(appNo)}</strong></div></div>
    </div>
    ${machineryTable(machineryRows(visibleRows, startIndex))}
    ${pageSignature(data, dateApp)}
  </div>`
}

function buildBody(data: Cmpf305Data): string {
  const appNo = applicationNoDisplay(data.applicationNumber)
  const dateApp = dateOrNa(data.dateOfApplication)
  const dateInsp = inspectionDateOrToday(data.dateOfInspection)
  const rows = data.rows.filter((row) => Object.values(row).some((value) => value.trim()))
  const chunks: Cmpf305MachineryRow[][] = []
  const continuationCount = Math.max(1, Math.ceil(rows.length / ROWS_PER_CONTINUATION_PAGE))
  for (let i = 0; i < continuationCount; i += 1) {
    chunks.push(rows.slice(i * ROWS_PER_CONTINUATION_PAGE, (i + 1) * ROWS_PER_CONTINUATION_PAGE))
  }
  return firstPage(data, appNo, dateApp, dateInsp) + chunks.map((chunk, index) => continuationPage(
    data,
    appNo,
    dateApp,
    dateInsp,
    chunk,
    index * ROWS_PER_CONTINUATION_PAGE,
  )).join('')
}

const STYLES = `
  .c305-page-one, .c305-continuation { font-size: 11pt !important; line-height: 1.45 !important; }
  .c305-page-one *, .c305-continuation * { overflow-wrap: break-word; word-break: normal; }
  .c305-page-one .pd-title { font-size: 14pt !important; line-height: 1.3 !important; margin-bottom: 8px; }
  .c305-form-id { text-align: right; font-weight: 700; font-size: 10.5pt; margin-bottom: 4px; }
  .c305-recipient { margin: 7px 0; }
  .c305-recipient .pd-to-block, .c305-recipient .pd-date-block { font-size: 10.5pt !important; line-height: 1.45 !important; }
  .c305-application-paragraph { width: 100%; margin: 6px 0; font-size: 10.5pt !important; line-height: 1.5 !important; text-align: justify !important; text-align-last: left; text-justify: inter-word; }
  .c305-table th, .c305-table td { font-size: 10pt !important; line-height: 1.35 !important; padding: 4px 5px !important; }
  .c305-table .c305-attached { font-size: 11pt !important; }
  .c305-table td { height: 7mm; }
  .c305-table .c305-attached { height: 80mm; vertical-align: middle; text-align: center; font-weight: 700; }
  .c305-note { margin: 4px 0; font-size: 10pt !important; line-height: 1.4 !important; }
  .c305-declaration-panels { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; margin-top: 2mm; }
  .c305-declaration-panel { min-width: 0; min-height: 70mm; border: 1.5px solid #111; padding: 2.5mm; display: flex; flex-direction: column; font-family: Arial, Helvetica, sans-serif; font-size: 10pt !important; line-height: 1.5 !important; }
  .c305-declaration-panel p { margin: 0 0 7mm; text-align: justify; text-justify: inter-word; }
  .c305-panel-signature { margin-top: auto; font-size: 9.5pt !important; line-height: 1.5 !important; }
  .c305-panel-signature-title { margin-bottom: 1mm; }
  .c305-panel-stamp { height: 15mm; display: flex; justify-content: flex-end; align-items: center; }
  .c305-panel-stamp img { max-width: 38mm; max-height: 14mm; object-fit: contain; }
  .c305-sign-image { max-width: 52mm; max-height: 21mm; object-fit: contain; }
  .c305-panel-signature > div:not(.c305-panel-signature-title) { display: grid; grid-template-columns: 24mm 7mm minmax(0, 1fr); border-bottom: 1px solid #bbb; }
  .c305-officer-signature { margin-top: auto; }
  .c305-outsourced-note { margin: 2mm 0 0; font-size: 9.5pt !important; font-weight: 700; line-height: 1.45 !important; }
  .c305-page-signature { position: static; width: 78mm; max-width: 78mm; margin: 2mm 0 0 auto; text-align: center; font-size: 9.5pt !important; line-height: 1.35 !important; page-break-inside: avoid; break-inside: avoid; }
  .c305-sign-gap { height: 12mm; }
  .c305-sign-image { display: block; margin: 0 4mm 1mm auto; }
  .c305-sign-line { border-top: 1px solid #111; margin: 0 5mm 2px; }
  .c305-continuation .pd-letterhead { margin-bottom: 7px; padding-bottom: 5px; }
  .c305-continuation .pd-firm { font-size: 17px; }
  .c305-continuation .c305-table td { height: 6mm; }
  .c305-continuation .pd-table th, .c305-continuation .pd-table td { padding: 3px 4px !important; font-size: 10pt !important; }
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
    firmRepName: parsed.firmRepName || sig.signatoryName || printData.client.contactPerson,
    firmRepDesignation: parsed.firmRepDesignation || sig.signatoryDesignation,
    signatureImageUrl: sig.signatureImageUrl,
    inspectionOfficerName: parsed.inspectionOfficerName || (printData.row.inspection_officer_name ?? '').trim(),
    inspectionOfficerDesignation: parsed.inspectionOfficerDesignation || (printData.row.inspection_officer_designation ?? '').trim(),
    rows: parsed.rows.filter((row) => Object.values(row).some((value) => value.trim())),
  }
}
