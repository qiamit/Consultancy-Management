import { formatDisplayDate } from '../projects/types'
import {
  parseOslSampleRequirementsPayload,
  type OslSampleRequirementRow,
} from '../projects/oslSampleRequirementsModel'
import type { BisPrintData } from './loadBisPrintData'
import { printSignatoryDefaults } from './loadBisPrintData'
import { escapeHtml as esc } from './openPrintHtml'
import {
  applicantContextFromPrintData,
  applicationNoDisplay,
  buildPrintPage,
  CONTENT_FIT_TABLE_CSS,
  contentFitTable,
  type ContentFitLayout,
  inspectionDateOrToday,
  isStandardRefHtml,
  letterheadHtml,
  preparedByHtml,
  signatoryHtml,
  toBlockHtml,
  type PrintApplicantContext,
} from './printDocumentShared'

export type OslSampleRequirementsData = PrintApplicantContext & {
  signatoryName: string
  signatoryDesignation: string
  rows: OslSampleRequirementRow[]
}

export function printableOslSampleRows(rows: OslSampleRequirementRow[]): OslSampleRequirementRow[] {
  return rows.filter(
    (r) =>
      r.includeInPrint !== false &&
      (r.gradeTypeVariety.trim() ||
        r.sampleDescription.trim() ||
        r.declaredValue.trim() ||
        r.batchNumber.trim() ||
        r.sampleQuantity.trim() ||
        r.testRequired.trim()),
  )
}

const SAMPLE_HEADERS = ['Sr No', 'Grade / Type / Variety', 'Declared Value', 'Batch No.', 'Date of Manufacturing', 'Batch Quantity']

/** The table's text, one array per sample, in column order. */
function sampleCells(rows: OslSampleRequirementRow[]): string[][] {
  return printableOslSampleRows(rows).map((r, i) => [
    String(i + 1),
    r.gradeTypeVariety.trim() || r.sampleDescription.trim(),
    r.declaredValue.trim(),
    r.batchNumber.trim(),
    r.dateOfManufacturing ? formatDisplayDate(r.dateOfManufacturing) : '',
    (r.batchQuantity || r.sampleQuantity).trim(),
  ])
}

/** A cell as laid out: turned on its side when the layout says so. */
function cellHtml(text: string, column: number, layout: ContentFitLayout, className = ''): string {
  if (!layout.vertical[column]) return `<td${className ? ` class="${className}"` : ''}>${esc(text)}</td>`
  return `<td class="pd-vcell"><span class="pd-vtext">${esc(text)}</span></td>`
}

function headerHtml(layout: ContentFitLayout): string {
  const shown = ['Sr<br/>No', 'Grade / Type / Variety', 'Declared Value', 'Batch No.', 'Date of<br/>Manufacturing', 'Batch Quantity']
  return shown
    .map((label, i) =>
      layout.vertical[i]
        ? `<th class="pd-vcell"><span class="pd-vtext">${layout.verticalHeader[i].map(esc).join('<br/>')}</span></th>`
        : `<th>${label}</th>`,
    )
    .join('')
}

function sampleRows(cells: string[][], layout: ContentFitLayout): string {
  if (cells.length === 0) {
    return `<tr><td colspan="6" class="pd-left">No samples marked for letter.</td></tr>`
  }
  return cells
    .map((c) => `<tr>${c.map((text, i) => cellHtml(text, i, layout, i === 1 ? 'pd-left' : '')).join('')}</tr>`)
    .join('')
}

function buildBody(data: OslSampleRequirementsData): string {
  const appNo = applicationNoDisplay(data.applicationNumber)
  const inspection = inspectionDateOrToday(data.dateOfInspection)
  const stdRef = isStandardRefHtml(data.isNumber, data.isTitle)
  const sigName = data.signatoryName.trim() || data.contactPerson.trim()
  const cells = sampleCells(data.rows)
  const layout = contentFitTable(SAMPLE_HEADERS, cells)

  return `
<div class="pd-sheet">
  ${letterheadHtml(data)}
  <h1 class="pd-title">Sample Offer Letter for Inspection</h1>

  <div class="pd-to-row">
    <div class="pd-to-block">${toBlockHtml(data.bisBranchName, data.bisBranchState)}</div>
    <div class="pd-date-block">
      <div><strong>Date of Inspection:</strong> ${esc(inspection)}</div>
      <div><strong>Application No.:</strong> ${esc(appNo)}</div>
    </div>
  </div>

  <p class="pd-body">
    <strong>Sub:</strong> Offer of samples for testing / inspection${stdRef ? ` under Indian Standard ${stdRef}` : ''}.
  </p>

  <p class="pd-body">
    We, <strong>M/s. ${esc(data.applicantName)}</strong>${data.applicantAddress ? `, having our factory at <strong>${esc(data.applicantAddress)}</strong>,` : ','}
    hereby offer the following samples for testing / inspection${stdRef ? ` in connection with BIS certification under ${stdRef}` : ' in connection with BIS certification'}.
    The particulars are as under:
  </p>

  <table class="pd-table osl-table">
    ${layout.colgroup}
    <thead>
      <tr>${headerHtml(layout)}</tr>
    </thead>
    <tbody>${sampleRows(cells, layout)}</tbody>
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

const STYLES = `${CONTENT_FIT_TABLE_CSS}
  .osl-table td { height: 8mm; }
  .osl-closing { display: block; margin-top: 8px; break-inside: avoid; page-break-inside: avoid; }
  .osl-declaration { width: 100%; margin: 0; font-size: 11px; line-height: 1.4; text-align: justify; }
  .osl-sign { width: fit-content; max-width: 100%; margin: 10px 0 0 auto; }
`

export function buildOslSampleRequirementsHtml(data: OslSampleRequirementsData): string {
  return buildPrintPage({
    title: `Sample Offer Letter — ${data.applicantName || 'Applicant'}`,
    styles: STYLES,
    body: buildBody(data),
  })
}

/** Maps project + saved module payload into Sample Offer Letter fields. */
export function oslSampleRequirementsDataFromPrintData(printData: BisPrintData): OslSampleRequirementsData {
  const ctx = applicantContextFromPrintData(printData)
  const parsed = parseOslSampleRequirementsPayload(
    printData.modulePayload && typeof printData.modulePayload === 'object'
      ? (printData.modulePayload as Record<string, unknown>)
      : null,
  )
  const sig = printSignatoryDefaults(printData)
  return {
    ...ctx,
    signatoryName: parsed.signatoryName || sig.signatoryName,
    signatoryDesignation: parsed.signatoryDesignation || sig.signatoryDesignation,
    rows: parsed.rows,
  }
}
