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
  signatureImageUrl?: string
}

const BLANK = '________________'
const CMPF311_TABLE_PAGE_BUDGET_MM = 170
const CMPF311_TABLE_COLUMN_WIDTHS_MM = [9, 27, 18, 18, 18, 18, 72]

function estimatedCmpf311RowHeightMm(row: Cmpf311TestRow): number {
  const values = [row.clause, row.requirement, [row.testMethod, row.testMethodClause].filter(Boolean).join(' — '), row.testEquipmentRequirement, row.noOfSample, row.frequency, row.remarks]
  const lineCount = values.reduce((maximum, value, index) => {
    const charsPerLine = Math.max(4, Math.floor((CMPF311_TABLE_COLUMN_WIDTHS_MM[index] ?? 8) * 0.55))
    return Math.max(maximum, Math.ceil(String(value ?? '').length / charsPerLine))
  }, 1)
  return lineCount * 5.6 + 3
}

function paginateCmpf311TestRows(rows: Cmpf311TestRow[], reserveMm = 0): Cmpf311TestRow[][] {
  const pageBudget = Math.max(80, CMPF311_TABLE_PAGE_BUDGET_MM - reserveMm)
  const pages: Cmpf311TestRow[][] = []
  let page: Cmpf311TestRow[] = []
  let usedMm = 0
  for (const row of rows) {
    const rowHeight = estimatedCmpf311RowHeightMm(row)
    if (page.length && usedMm + rowHeight > pageBudget) {
      pages.push(page)
      page = []
      usedMm = 0
    }
    page.push(row)
    usedMm += rowHeight
  }
  if (page.length || pages.length === 0) pages.push(page)
  return pages
}

function cmpf311TestTable(rows: Cmpf311TestRow[]): string {
  const bodyRows = rows.map((row) => `<tr><td>${esc(row.clause)}</td><td>${esc(row.requirement)}</td><td>${esc([row.testMethod, row.testMethodClause].filter(Boolean).join(' — '))}</td><td>${esc(row.testEquipmentRequirement)}</td><td>${esc(row.noOfSample)}</td><td>${esc(row.frequency)}</td><td>${esc(row.remarks)}</td></tr>`).join('')
  return `<table class="pd-table cmpf311-test-table"><colgroup><col style="width:5%"/><col style="width:15%"/><col style="width:10%"/><col style="width:10%"/><col style="width:10%"/><col style="width:10%"/><col style="width:40%"/></colgroup><thead>
    <tr><th colspan="3">Test Details</th><th rowspan="2">Test<br/>Equipment<br/>R / S</th><th colspan="3">Level of Control</th></tr>
    <tr><th>Clause</th><th>Requirements</th><th>Test Method &amp; Clause No</th><th>No of Samples</th><th>Frequency</th><th>Remarks</th></tr>
  </thead><tbody>${bodyRows || '<tr><td colspan="7">No SIT test rows generated yet.</td></tr>'}</tbody></table>`
}

function buildBody(data: Cmpf311Data): string {
  const letterDate = inspectionDateOrToday(data.dateOfInspection)
  const refDate = data.referenceLetterDate.trim() ? dateOrNa(data.referenceLetterDate) : BLANK
  const licenceFor = data.licenceForStandard.trim() || data.isNumber.trim() || BLANK
  const productManualNo = data.sitDocumentRef.trim() || BLANK
  const sigName = data.signatoryName.trim() || data.contactPerson.trim()
  const signature = signatoryHtml({
    firmName: data.applicantName,
    name: sigName,
    designation: data.signatoryDesignation,
    signatureImageUrl: data.signatureImageUrl,
  })

  if (data.mode === 'on-sit') {
    const sections = data.annexureSections
      .map((section, index) => `<p class="cmpf311-annex-section"><strong>${index + 1}. ${esc(section.title)}:</strong> ${esc(section.content).replace(/\n/g, '<br/>') || '&nbsp;'}</p>`)
      .join('')
    const notes = data.notes.map((note) => `<p class="cmpf311-note"><strong>${esc(note.title)}${note.title ? '. ' : ''}</strong>${esc(note.description)}</p>`).join('')
    const reserveForSign = notes ? 0 : 45
    const tablePages = paginateCmpf311TestRows(data.testRows, reserveForSign)
    const tablePageHtml = tablePages.map((rows, index) => `
<div class="pd-sheet cmpf311-onsit-page cmpf311-table-page">
  ${letterheadHtml(data)}
  <h1 class="pd-title">Scheme of Inspection &amp; Testing</h1>
  <p class="cmpf311-manual-ref"><strong>SIT No.:</strong> ${esc(productManualNo)}</p>
  ${cmpf311TestTable(rows)}
  ${!notes && index === tablePages.length - 1 ? `<div class="cmpf-sign-right">${signatoryHtml({ firmName: data.applicantName, name: sigName, designation: data.signatoryDesignation })}</div>${preparedByHtml(data.preparedBy)}` : ''}
</div>`).join('')
    const notesPageHtml = notes ? `
<div class="pd-sheet cmpf311-onsit-page cmpf311-notes-page">
  ${letterheadHtml(data)}
  <h1 class="pd-title">Notes — Subcontracted Laboratory &amp; Process</h1>
  ${notes}
  <div class="cmpf-sign-right">${signatoryHtml({ firmName: data.applicantName, name: sigName, designation: data.signatoryDesignation })}</div>
  ${preparedByHtml(data.preparedBy)}
</div>` : ''
    return `
<div class="pd-sheet cmpf311-onsit-page">
  ${letterheadHtml(data)}
  <div class="cmpf-form-id">CMPF - 311</div>
  <h1 class="pd-title">Scheme of Inspection &amp; Testing</h1>
  <div class="pd-to-row"><div class="pd-to-block">${toBlockHtml(data.bisBranchName, data.bisBranchState)}</div><div class="pd-date-block"><div><strong>Date of Inspection:</strong> ${esc(letterDate)}</div><div><strong>Application No.:</strong> ${esc(applicationNoDisplay(data.applicationNumber))}</div><div><strong>SIT No.:</strong> ${esc(productManualNo)}</div></div></div>
  <p class="pd-body cmpf311-declaration">This independently prepared Scheme of Inspection and Testing (SIT) sets out the inspection controls, control-unit definition, sampling, test methods, equipment requirements, frequency, records and responsibilities proposed by <strong>${esc(data.applicantName || 'the applicant firm')}</strong> for products conforming to <strong>${esc(licenceFor)}</strong>. It has been prepared with reference to SIT No. <strong>${esc(productManualNo)}</strong>, the applicable Indian Standard and the firm’s manufacturing and quality-control processes. Annexure C, the test table and the accompanying notes form an integral part of this proposal and shall be read together. The firm undertakes to implement the stated controls, maintain complete and traceable inspection and test records, ensure measuring and test equipment remains suitable and calibrated, and make relevant facilities, records and samples available to BIS during assessment or surveillance. Proposed controls shall be reviewed whenever changes may affect product conformity. Any change requiring BIS review or approval shall be submitted in accordance with applicable requirements. This On-SIT is submitted for BIS review and shall be followed as approved.</p>
  <div class="cmpf311-cover-sign">${signature}</div>
</div>
<div class="pd-sheet cmpf311-onsit-page cmpf311-annex-page">
  ${letterheadHtml(data)}
  <h1 class="pd-title">Annexure C</h1>
  ${sections || '<p class="cmpf311-empty">No Annexure C content generated yet.</p>'}
  <div class="cmpf311-cover-sign cmpf311-annex-sign">${signature}</div>
  ${preparedByHtml(data.preparedBy)}
</div>
${tablePageHtml}${notesPageHtml}`
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
  <p class="pd-body cmpf311-declaration">With reference to the Scheme of Inspection and Testing prescribed by BIS for <strong>${esc(licenceFor)}</strong>, <strong>${esc(data.applicantName || 'the applicant firm')}</strong> accepts and undertakes to comply with the applicable inspection, sampling, testing, control-unit, frequency, equipment, record-keeping and reporting requirements stated in SIT No. <strong>${esc(productManualNo)}</strong>. Following grant of a licence, the firm shall implement the prescribed controls at its manufacturing premises, ensure tests are performed using suitable facilities and calibrated equipment or permitted subcontracted laboratories, maintain complete and traceable production, inspection and test records, and make the premises, records and samples available to BIS officers during assessment and surveillance. The firm shall investigate non-conformities, prevent dispatch of non-conforming product and take corrective action in accordance with the applicable Indian Standard and BIS requirements. Any change affecting product conformity, process controls or licensed scope shall be reported to BIS, and prior approval shall be obtained wherever required. This undertaking applies to the licensed product and remains subject to the prevailing BIS licence conditions.</p>

  <div class="cmpf-sign-right">${signature}<div class="cmpf311-seal-label">Company Seal &amp; Authorized Signature</div></div>
  ${preparedByHtml(data.preparedBy)}
</div>`
}

export function buildCmpf311Html(data: Cmpf311Data): string {
  return buildPrintPage({
    title: `CMPF 311 — ${data.applicantName || 'Applicant'}`,
    styles: `${CMPF_FORM_STYLES}
      .cmpf311-annex-section { margin: 7px 0; text-align: justify; line-height: 1.45; break-inside: avoid; }
      .cmpf311-annex-page, .cmpf311-table-page { page-break-before: always; break-before: page; }
      .cmpf311-declaration { text-align: justify; }
      .cmpf311-cover-sign { width: 78mm; max-width: 78mm; margin: 8mm 0 0 auto; text-align: right; page-break-inside: avoid; break-inside: avoid; }
      .cmpf311-cover-sign .pd-signatory { width: 100%; text-align: right; margin-left: auto; }
      .cmpf311-cover-sign .pd-sign-space { justify-content: flex-end; }
      .cmpf311-cover-sign .pd-sign-line { margin-left: auto; }
      .cmpf311-annex-sign { margin-top: 10mm; }
      .cmpf311-seal-label { font-size: 9pt; font-weight: 700; margin-top: 2px; }
      .cmpf311-note { display: block; margin: 0 0 5px; text-align: justify; line-height: 1.45; }
      .cmpf311-notes-title { margin: 8px 0 3px; font-size: 12pt; }
      .cmpf311-test-table th, .cmpf311-test-table td { font-size: 9.5pt; padding: 4px; }
      .cmpf311-test-table td { vertical-align: top; }
      .cmpf311-test-table td:nth-child(2) { text-align: left; }
      .cmpf311-test-table { table-layout: fixed; }
      .cmpf311-method-clause { font-size: 8.5pt; }
      .cmpf311-manual-ref { margin: 0 0 8px; text-align: right; }
      @media screen { .cmpf311-onsit-page + .cmpf311-onsit-page { margin-top: 2mm; } }
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
    signatureImageUrl: defaults.signatureImageUrl,
  }
}
