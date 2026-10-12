import { printSignatoryDefaults, type BisPrintData } from './loadBisPrintData'
import { escapeHtml as esc } from './openPrintHtml'
import {
  addressWithIndia,
  applicantContextFromPrintData,
  applicationNoDisplay,
  buildPrintPage,
  CMPF_FORM_STYLES,
  dateOrNa,
  inspectionDateOrToday,
  letterheadHtml,
  toBlockHtml,
  type PrintApplicantContext,
} from './printDocumentShared'
import { parseCmpf306Payload } from '../projects/cmpf306Model'

export type Cmpf306EquipmentRow = {
  equipmentName: string
  make: string
  leastCount: string
  range: string
  calibrationStatus: string
  clauseNo: string
  quantity: string
}

export type Cmpf306Data = PrintApplicantContext & {
  firmRepName: string
  firmRepDesignation: string
  signatureImageUrl?: string
  inspectionOfficerName: string
  inspectionOfficerDesignation: string
  rows: Cmpf306EquipmentRow[]
}

const MIN_BLANK_ROWS = 15
const ROWS_PER_CONTINUATION_PAGE = 18

function equipmentRows(rows: Cmpf306EquipmentRow[], startIndex: number): string {
  const out: string[] = []
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i]
    const cell = (v?: string) => (v ? esc(v) : '&nbsp;')
    out.push(`<tr>
      <td>${startIndex + i + 1}</td>
      <td class="pd-left">${cell(r?.equipmentName)}</td>
      <td>${cell(r?.make)}</td><td>${cell(r?.leastCount)}</td><td>${cell(r?.range)}</td>
      <td>${cell(r?.calibrationStatus)}</td><td>${cell(r?.clauseNo)}</td><td>${cell(r?.quantity)}</td>
    </tr>`)
  }
  return out.join('')
}

function equipmentTable(rows: string, attachment = false): string {
  return `<table class="pd-table cmpf-table c306-table">
    <colgroup>
      <col style="width:5%"/><col style="width:27%"/><col style="width:11%"/><col style="width:11%"/>
      <col style="width:11%"/><col style="width:14%"/><col style="width:11%"/><col style="width:10%"/>
    </colgroup>
    <thead>
      <tr>
        <th>Sr<br/>No</th><th>Test Equipments / Chemicals</th><th>Make</th><th>Least Count</th>
        <th>Range</th><th>Calibration Status</th><th>Clause No.</th><th>Quantity</th>
      </tr>
    </thead>
    <tbody>${rows || (attachment ? '<tr><td colspan="8" class="c306-attached">Separate Sheet Attached</td></tr>' : '')}</tbody>
  </table>`
}

function firstPageDeclarations(data: Cmpf306Data, inspectionDate: string): string {
  const firmName = data.firmRepName.trim() || data.contactPerson.trim() || '—'
  const firmDesignation = data.firmRepDesignation.trim() || '—'
  const officerName = data.inspectionOfficerName.trim() || '----'
  const officerDesignation = data.inspectionOfficerDesignation.trim() || '----'
  const signature = data.signatureImageUrl?.trim()
  const stamp = signature
    ? `<div class="c306-stamp"><img src="${esc(signature)}" alt="Authorized signatory stamp and signature" /></div>`
    : '<div class="c306-stamp"></div>'
  return `<div class="c306-declarations">
    <section class="c306-declaration">
      <p>I hereby declare that the testing equipment listed in the attached sheet is owned by me and is installed and available at the premises.*</p>
      <p>I also declare that, if a licence is granted, I will inform BIS before any testing equipment is removed from the firm’s premises.</p>
      <div class="c306-panel-signature"><div class="c306-sign-title">Sig. of Firm’s Representative :-</div>${stamp}
        <div><span>Name</span><span>:-</span><strong>${esc(firmName)}</strong></div>
        <div><span>Designation</span><span>:-</span><strong>${esc(firmDesignation)}</strong></div>
        <div><span>Date of Inspection</span><span>:-</span><strong>${esc(inspectionDate)}</strong></div>
      </div>
    </section>
    <section class="c306-declaration">
      <p>I have checked and found that the testing equipment listed in the attached sheet was available during my inspection.</p>
      <div class="c306-panel-signature c306-officer-signature"><div class="c306-sign-title">Sig. of BIS Certification Officer :-</div>
        <div class="c306-stamp"></div>
        <div><span>Name</span><span>:-</span><strong>${esc(officerName)}</strong></div>
        <div><span>Designation</span><span>:-</span><strong>${esc(officerDesignation)}</strong></div>
        <div><span>Date of Inspection</span><span>:-</span><strong>${esc(inspectionDate)}</strong></div>
      </div>
    </section>
  </div>
  <p class="c306-footnote">* If any part of the testing activity is outsourced, details of test equipment used for the outsourced activity shall be indicated in a separate form along with the complete address of the outsourced premises.</p>`
}

function firstPage(data: Cmpf306Data, dateApp: string, dateInsp: string): string {
  const appNo = applicationNoDisplay(data.applicationNumber)
  return `<div class="pd-sheet c306-page-one">
    <div class="c306-form-id">Form - II</div>
    <h1 class="pd-title">Declaration Regarding Testing Equipment</h1>
    <div class="pd-to-row c306-recipient">
      <div class="pd-to-block">${toBlockHtml(data.bisBranchName, data.bisBranchState)}</div>
      <div class="pd-date-block"><div>Date of Inspection: <strong>${esc(dateInsp)}</strong></div><div>Application No.: <strong>${esc(appNo)}</strong></div></div>
    </div>
    <p class="c306-application-paragraph"><span>Respected Sir,</span><br/><span>we, <strong>M/s. ${esc(data.applicantName || '—')}</strong>, submit the declaration for testing equipment required for <strong>${esc(data.isNumber || 'the applicable Indian Standard')}</strong>, Application No. <strong>${esc(appNo)}</strong>, dated <strong>${esc(dateApp)}</strong>. The equipment is installed at <strong>${esc(addressWithIndia(data.applicantAddress))}</strong> and is available for inspection. Inspection date: <strong>${esc(dateInsp)}</strong>.</span></p>
    ${equipmentTable('', true)}
    <p class="pd-note c306-note">Note: Attach extra sheet, if required.</p>
    ${firstPageDeclarations(data, dateInsp)}
  </div>`
}

function continuationPage(data: Cmpf306Data, rows: Cmpf306EquipmentRow[], startIndex: number, dateInsp: string): string {
  const visibleRows = [...rows]
  while (visibleRows.length < Math.max(MIN_BLANK_ROWS, rows.length)) {
    visibleRows.push({ equipmentName: '', make: '', leastCount: '', range: '', calibrationStatus: '', clauseNo: '', quantity: '' })
  }
  const signature = data.signatureImageUrl?.trim()
  const signArea = signature
    ? `<img class="c306-cont-sign-image" src="${esc(signature)}" alt="Authorized signatory stamp and signature" />`
    : '<div class="c306-cont-sign-gap"></div>'
  const designation = data.firmRepDesignation.trim()
  return `<div class="pd-sheet c306-continuation">
    ${letterheadHtml(data)}
    <div class="pd-to-row c306-recipient">
      <div class="pd-to-block">${toBlockHtml(data.bisBranchName, data.bisBranchState)}</div>
      <div class="pd-date-block"><div>Date of Inspection: <strong>${esc(dateInsp)}</strong></div><div>Application No.: <strong>${esc(applicationNoDisplay(data.applicationNumber))}</strong></div></div>
    </div>
    ${equipmentTable(equipmentRows(visibleRows, startIndex))}
    <div class="c306-cont-signature">
      <div>For <strong>${esc(data.applicantName || 'Applicant Firm')}</strong></div>
      ${signArea}
      <div class="c306-cont-sign-line"></div>
      <div><strong>${esc(data.firmRepName || data.contactPerson || '—')}</strong>${designation ? ` (${esc(designation)})` : ''}</div>
      <div>Firm Representative Seal &amp; Signature</div>
      <div>Date of Inspection: ${esc(dateInsp)}</div>
    </div>
  </div>`
}

function buildBody(data: Cmpf306Data): string {
  const dateApp = dateOrNa(data.dateOfApplication)
  const dateInsp = inspectionDateOrToday(data.dateOfInspection)
  const rows = data.rows.filter((row) => Object.values(row).some((value) => value.trim()))
  const pages = Math.max(1, Math.ceil(rows.length / ROWS_PER_CONTINUATION_PAGE))
  const parts = [firstPage(data, dateApp, dateInsp)]
  for (let index = 0; index < pages; index += 1) {
    const startIndex = index * ROWS_PER_CONTINUATION_PAGE
    parts.push(continuationPage(data, rows.slice(startIndex, startIndex + ROWS_PER_CONTINUATION_PAGE), startIndex, dateInsp))
  }
  return parts.join('')
}

const CMPF306_STYLES = `${CMPF_FORM_STYLES}
  .c306-form-id { text-align: right; font-weight: 700; font-size: 10.5pt; margin-bottom: 4px; }
  .c306-recipient { margin: 7px 0; }
  .c306-application-paragraph { margin: 6px 0; font-size: 10.5pt !important; line-height: 1.5 !important; text-align: justify !important; text-align-last: left; text-justify: inter-word; }
  .c306-table th, .c306-table td { font-size: 9.5pt !important; line-height: 1.35 !important; padding: 4px 5px !important; }
  .c306-table td { height: 6mm; }
  .c306-table .c306-attached { height: 80mm; vertical-align: middle; text-align: center; font-size: 11pt !important; font-weight: 700; }
  .c306-note { margin: 4px 0; font-size: 10pt !important; }
  .c306-declarations { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; margin-top: 2mm; }
  .c306-declaration { min-width: 0; min-height: 62mm; border: 1.5px solid #111; padding: 2.5mm; display: flex; flex-direction: column; font-size: 10pt !important; line-height: 1.5 !important; }
  .c306-declaration p { margin: 0 0 5mm; text-align: justify; text-justify: inter-word; }
  .c306-panel-signature { margin-top: auto; font-size: 9.5pt !important; line-height: 1.45 !important; }
  .c306-sign-title { margin-bottom: 1mm; }
  .c306-stamp { height: 14mm; display: flex; justify-content: flex-end; align-items: center; }
  .c306-stamp img, .c306-cont-sign-image { max-width: 38mm; max-height: 13mm; object-fit: contain; }
  .c306-panel-signature > div:not(.c306-sign-title):not(.c306-stamp) { display: grid; grid-template-columns: 26mm 6mm minmax(0,1fr); border-bottom: 1px solid #bbb; }
  .c306-officer-signature { margin-top: auto; }
  .c306-footnote { margin: 2mm 0 0; font-size: 9.5pt !important; font-weight: 700; line-height: 1.4 !important; text-align: justify; }
  .c306-continuation .pd-letterhead { margin-bottom: 7px; padding-bottom: 5px; }
  .c306-continuation .pd-firm { font-size: 17px; }
  .c306-continuation .c306-table td { height: 6mm; }
  .c306-cont-signature { width: 72mm; margin: 2mm 0 0 auto; text-align: center; font-size: 9.5pt !important; line-height: 1.35 !important; break-inside: avoid; page-break-inside: avoid; }
  .c306-cont-sign-image { display: block; margin: 0 5mm 1mm auto; }
  .c306-cont-sign-gap { height: 12mm; }
  .c306-cont-sign-line { border-top: 1px solid #111; margin: 0 5mm 2px; }
`

export function buildCmpf306Html(data: Cmpf306Data): string {
  return buildPrintPage({
    title: `CMPF 306 — ${data.applicantName || 'Applicant'}`,
    styles: CMPF306_STYLES,
    body: buildBody(data),
  })
}

/** Maps a BIS project row + client + IS code + consultancy context into CMPF-306 fields. */
export function cmpf306DataFromPrintData(printData: BisPrintData): Cmpf306Data {
  const parsed = parseCmpf306Payload(
    printData.modulePayload && typeof printData.modulePayload === 'object'
      ? (printData.modulePayload as Record<string, unknown>)
      : null,
  )
  const sig = printSignatoryDefaults(printData)
  return {
    ...applicantContextFromPrintData(printData),
    firmRepName: parsed.firmRepName || sig.signatoryName || printData.client.contactPerson,
    firmRepDesignation: parsed.firmRepDesignation || sig.signatoryDesignation,
    signatureImageUrl: sig.signatureImageUrl,
    inspectionOfficerName: parsed.inspectionOfficerName,
    inspectionOfficerDesignation: parsed.inspectionOfficerDesignation,
    rows: parsed.rows,
  }
}
