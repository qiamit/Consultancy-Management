import type { BisPrintData } from './loadBisPrintData'
import { printSignatoryDefaults } from './loadBisPrintData'
import { parseCmpf311Payload, type Cmpf311Mode, type Cmpf311Note, type Cmpf311TestRow } from '../projects/cmpf311Model'
import { escapeHtml as esc } from './openPrintHtml'
import {
  applicantContextFromPrintData,
  applicationNoDisplay,
  buildPrintPage,
  CMPF_FORM_STYLES,
  dateOrNa,
  inspectionDateOrToday,
  letterheadHtml,
  preparedByHtml,
  signatoryHtml,
  toBlockHtml,
  type PrintApplicantContext,
} from './printDocumentShared'

export type Cmpf311Data = PrintApplicantContext & {
  mode: Cmpf311Mode
  referenceLetterNo: string
  referenceLetterDate: string
  licenceForStandard: string
  sitDocumentRef: string
  annexureSections: Array<{ title: string; content: string }>
  testRows: Cmpf311TestRow[]
  notes: Cmpf311Note[]
  signatoryName: string
  signatoryDesignation: string
}

const BLANK = '________________'

function buildBody(data: Cmpf311Data): string {
  const letterDate = inspectionDateOrToday(data.dateOfInspection)
  const refDate = data.referenceLetterDate.trim() ? dateOrNa(data.referenceLetterDate) : BLANK
  const licenceFor = data.licenceForStandard.trim() || data.isNumber.trim() || BLANK
  const productManualNo = data.sitDocumentRef.trim() || BLANK
  const sigName = data.signatoryName.trim() || data.contactPerson.trim()

  if (data.mode === 'on-sit') {
    const sections = data.annexureSections
      .map((section, index) => `<section class="cmpf311-annex-section"><h2>${index + 1}. ${esc(section.title)}</h2><p>${esc(section.content).replace(/\n/g, '<br/>') || '&nbsp;'}</p></section>`)
      .join('')
    const rows = data.testRows.map((row) => `<tr><td>${esc(row.clause)}</td><td>${esc(row.requirement)}</td><td>${esc([row.testMethod, row.testMethodClause].filter(Boolean).join(' — '))}</td><td>${esc(row.testEquipmentRequirement)}</td><td>${esc(row.noOfSample)}</td><td>${esc(row.frequency)}</td><td>${esc(row.remarks)}</td></tr>`).join('')
    const notes = data.notes.map((note) => `<p class="cmpf311-note"><strong>${esc(note.title)}${note.title ? '. ' : ''}</strong>${esc(note.description)}</p>`).join('')
    return `
<div class="pd-sheet cmpf311-onsit-page">
  ${letterheadHtml(data)}
  <div class="cmpf-form-id">CMPF - 311</div>
  <h1 class="pd-title">Annexure C — Scheme of Inspection &amp; Testing</h1>
  <div class="pd-to-row"><div class="pd-to-block">${toBlockHtml(data.bisBranchName, data.bisBranchState)}</div><div class="pd-date-block"><div><strong>Date of Inspection:</strong> ${esc(letterDate)}</div><div><strong>Application No.:</strong> ${esc(applicationNoDisplay(data.applicationNumber))}</div><div><strong>Product Manual / SIT No.:</strong> ${esc(productManualNo)}</div></div></div>
  <p class="pd-body">This On-SIT Scheme of Inspection and Testing is prepared for <strong>${esc(data.licenceForStandard)}</strong> with reference to Product Manual / SIT No. <strong>${esc(productManualNo)}</strong>. The extracted requirements below should be checked against the source manual before acceptance.</p>
  ${sections || '<p class="cmpf311-empty">No Annexure C content generated yet.</p>'}
  ${preparedByHtml(data.preparedBy)}
</div>
<div class="pd-sheet cmpf311-onsit-page">
  ${letterheadHtml(data)}
  <h1 class="pd-title">Scheme of Inspection &amp; Testing — Test Requirements</h1>
  <p class="cmpf311-manual-ref"><strong>Product Manual / SIT No.:</strong> ${esc(productManualNo)}</p>
  <table class="pd-table cmpf311-test-table"><colgroup><col style="width:5%"/><col style="width:15%"/><col style="width:10%"/><col style="width:10%"/><col style="width:10%"/><col style="width:10%"/><col style="width:40%"/></colgroup><thead>
    <tr><th colspan="3">Test Details</th><th rowspan="2">Test<br/>Equipment<br/>R / S</th><th colspan="3">Level of Control</th></tr>
    <tr><th>Clause</th><th>Requirements</th><th>Test Method &amp; Clause No</th><th>No of Samples</th><th>Frequency</th><th>Remarks</th></tr>
  </thead><tbody>${rows || '<tr><td colspan="7">No SIT test rows generated yet.</td></tr>'}</tbody></table>
  <h2 class="cmpf311-notes-title">Notes — Subcontracted Laboratory &amp; Process</h2>
  ${notes || '<p class="cmpf311-empty">No notes generated yet.</p>'}
  <div class="cmpf-sign-right">${signatoryHtml({ firmName: data.applicantName, name: sigName, designation: data.signatoryDesignation })}</div>
  ${preparedByHtml(data.preparedBy)}
</div>`
  }

  return `
<div class="pd-sheet">
  ${letterheadHtml(data)}
  <div class="cmpf-form-id">CMPF - 311</div>
  <h1 class="pd-title">Acceptance of Scheme of Inspection &amp; Testing</h1>

  <div class="pd-to-row">
    <div class="pd-to-block">${toBlockHtml(data.bisBranchName, data.bisBranchState)}</div>
    <div class="pd-date-block">
      <div><strong>Date of Inspection:</strong> ${esc(letterDate)}</div>
      <div><strong>Application No.:</strong> ${esc(applicationNoDisplay(data.applicationNumber))}</div>
    </div>
  </div>

  <p class="pd-body">This has reference to your letter No. <strong>${esc(data.referenceLetterNo.trim() || BLANK)}</strong> dated <strong>${esc(refDate)}</strong>.</p>
  <p class="pd-body">
    We hereby undertake that, upon grant of a licence for <strong>${esc(licenceFor)}</strong>,
    we shall faithfully implement the Scheme of Inspection and Testing as specified in Product Manual No.
    <strong>${esc(productManualNo)}</strong>, and shall maintain all prescribed records in accordance with
    the requirements of the Bureau of Indian Standards.
  </p>

  <div class="cmpf-sign-right">${signatoryHtml({ firmName: data.applicantName, name: sigName, designation: data.signatoryDesignation })}</div>
  ${preparedByHtml(data.preparedBy)}
</div>`
}

export function buildCmpf311Html(data: Cmpf311Data): string {
  return buildPrintPage({
    title: `CMPF 311 — ${data.applicantName || 'Applicant'}`,
    styles: `${CMPF_FORM_STYLES}
      .cmpf311-annex-section { margin: 10px 0; break-inside: avoid; }
      .cmpf311-annex-section h2, .cmpf311-notes-title { margin: 8px 0 3px; font-size: 12pt; }
      .cmpf311-annex-section p, .cmpf311-note { margin: 0 0 5px; text-align: justify; line-height: 1.45; }
      .cmpf311-test-table th, .cmpf311-test-table td { font-size: 9.5pt; padding: 4px; }
      .cmpf311-test-table td { vertical-align: top; }
      .cmpf311-test-table { table-layout: fixed; }
      .cmpf311-method-clause { font-size: 8.5pt; }
      .cmpf311-manual-ref { margin: 0 0 8px; }
      .cmpf311-empty { color: #57534e; font-style: italic; }
    `,
    body: buildBody(data),
  })
}

/** Maps a BIS project row + client + IS code + consultancy context into CMPF-311 fields. */
export function cmpf311DataFromPrintData(printData: BisPrintData): Cmpf311Data {
  const payload = parseCmpf311Payload(printData.modulePayload ?? null)
  const defaults = printSignatoryDefaults(printData)
  return {
    ...applicantContextFromPrintData(printData),
    mode: payload.mode,
    referenceLetterNo: payload.referenceLetterNo,
    referenceLetterDate: payload.referenceLetterDate,
    licenceForStandard: printData.isCode.label || printData.isCode.isNumber,
    sitDocumentRef: payload.mode === 'bis-sit'
      ? printData.isCode.productManualNumber || payload.productManualNumber
      : payload.productManualNumber,
    annexureSections: payload.annexureSections,
    testRows: payload.testRows,
    notes: payload.notes,
    signatoryName: defaults.signatoryName,
    signatoryDesignation: defaults.signatoryDesignation,
  }
}
