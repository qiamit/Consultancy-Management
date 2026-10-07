import {
  flattenBisNotesColumns,
  parseBisNotesScope,
  sanitizeBisLicenseScopeNotes,
} from '../projects/types'
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

export type ManufacturingScopeData = PrintApplicantContext & {
  /** Raw notes field (plain or @@BIS_SCOPE_TABLE@@ JSON) — synced with Add Application/Licence. */
  licenseScopeNotes: string
  signatoryName: string
  signatoryDesignation: string
}

function licenseScopeBodyHtml(notes: string): string {
  const scope = parseBisNotesScope(notes)
  if (scope.mode === 'plain') {
    const text = scope.text.trim() || '—'
    return `<div class="ms-scope-body">${esc(text).replace(/\n/g, '<br/>')}</div>`
  }
  const headerCells = scope.headers
    .map((h) => `<th>${esc(h.trim() || '—')}</th>`)
    .join('')
  const bodyRows = scope.rows
    .filter((row) => row.some((cell) => cell.trim()))
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td>${esc(cell.trim() || '—')}</td>`).join('')}</tr>`,
    )
    .join('')
  if (!bodyRows) {
    return `<div class="ms-scope-body">—</div>`
  }
  return `
<table class="ms-scope-table">
  <thead><tr>${headerCells}</tr></thead>
  <tbody>${bodyRows}</tbody>
</table>`
}

function buildBody(data: ManufacturingScopeData): string {
  const letterDate = inspectionDateOrToday(data.dateOfInspection)
  const isStdRef = isStandardRefHtml(data.isNumber, data.isTitle)
  const sigName = data.signatoryName.trim() || data.contactPerson.trim()

  return `
<div class="pd-sheet">
  ${letterheadHtml(data)}
  <h1 class="pd-title">Declaration Regarding Manufacturing Scope</h1>

  <div class="pd-to-row">
    <div class="pd-to-block">${toBlockHtml(data.bisBranchName, data.bisBranchState)}</div>
    <div class="pd-date-block">
      <div><strong>Date of Inspection:</strong> ${esc(letterDate)}</div>
      <div><strong>Application No.:</strong> ${esc(applicationNoDisplay(data.applicationNumber))}</div>
    </div>
  </div>

  <p class="pd-body">
    <strong>Sub:</strong> Declaration regarding manufacturing scope
    ${isStdRef ? ` under Indian Standard ${isStdRef}` : ''}.
  </p>

  <p class="pd-body">
    We, <strong>M/s. ${esc(data.applicantName)}</strong>,
    ${data.applicantAddress ? ` having our factory at <strong>${esc(data.applicantAddress)}</strong>,` : ''}
    hereby declare that our manufacturing scope for BIS certification
    ${isStdRef ? ` under ${isStdRef}` : ''}
    is as follows:
  </p>

  <div class="ms-scope-box">
    <div class="ms-scope-label">License Scope</div>
    ${licenseScopeBodyHtml(data.licenseScopeNotes)}
  </div>

  <p class="pd-body">
    We further declare that the above information is true and correct to the best of our knowledge and belief.
    We undertake to inform BIS of any change in the manufacturing scope covered under the licence.
  </p>

  <div class="cmpf-sign-right">${signatoryHtml({ firmName: data.applicantName, name: sigName, designation: data.signatoryDesignation })}</div>
  ${preparedByHtml(data.preparedBy)}
</div>`
}

const STYLES = `
  .ms-scope-box { margin: 10px 0 14px; padding: 8px 10px; border: 1px solid #cbd5e1; background: #f8fafc; min-height: 28mm; }
  .ms-scope-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #64748b; margin-bottom: 4px; }
  .ms-scope-body { font-size: 11px; line-height: 1.45; white-space: pre-wrap; }
  .ms-scope-table { width: 100%; border-collapse: collapse; font-size: 11px; }
  .ms-scope-table th, .ms-scope-table td { border: 1px solid #111; padding: 4px 6px; text-align: left; vertical-align: top; }
  .ms-scope-table th { background: #f1f5f9; font-weight: 700; text-transform: uppercase; font-size: 10px; letter-spacing: .04em; }
  .cmpf-sign-right { margin-top: 14px; text-align: right; }
  .cmpf-sign-right .pd-signatory { text-align: left; }
`

export function buildManufacturingScopeHtml(data: ManufacturingScopeData): string {
  return buildPrintPage({
    title: `Manufacturing Scope — ${data.applicantName || 'Applicant'}`,
    styles: STYLES,
    body: buildBody(data),
  })
}

/** Maps a BIS project row + client + IS code + consultancy context into Manufacturing Scope fields. */
export function manufacturingScopeDataFromPrintData(printData: BisPrintData): ManufacturingScopeData {
  const ctx = applicantContextFromPrintData(printData)
  const notes = sanitizeBisLicenseScopeNotes(String(printData.row.notes ?? ''))
  const fromNotes = flattenBisNotesColumns(notes)
  const fallback =
    (printData.row.title ?? '').trim() || printData.isCode.title || printData.isCode.label
  return {
    ...ctx,
    licenseScopeNotes: fromNotes ? notes : fallback,
    signatoryName: printSignatoryDefaults(printData).signatoryName,
    signatoryDesignation: printSignatoryDefaults(printData).signatoryDesignation,
  }
}
