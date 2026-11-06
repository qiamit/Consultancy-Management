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
  contentFitColgroup,
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

function sampleRows(cells: string[][]): string {
  if (cells.length === 0) {
    return `<tr><td colspan="6" class="pd-left">No samples marked for letter.</td></tr>`
  }
  return cells
    .map(
      (c) => `<tr>
      <td>${esc(c[0])}</td>
      <td class="pd-left">${esc(c[1])}</td>
      <td>${esc(c[2])}</td>
      <td>${esc(c[3])}</td>
      <td>${esc(c[4])}</td>
      <td>${esc(c[5])}</td>
    </tr>`,
    )
    .join('')
}

function buildBody(data: OslSampleRequirementsData): string {
  const appNo = applicationNoDisplay(data.applicationNumber)
  const inspection = inspectionDateOrToday(data.dateOfInspection)
  const stdRef = isStandardRefHtml(data.isNumber, data.isTitle)
  const sigName = data.signatoryName.trim() || data.contactPerson.trim()
  const cells = sampleCells(data.rows)

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
    ${contentFitColgroup(SAMPLE_HEADERS, cells)}
    <thead>
      <tr>
        <th>Sr<br/>No</th>
        <th>Grade / Type / Variety</th>
        <th>Declared Value</th>
        <th>Batch No.</th>
        <th>Date of<br/>Manufacturing</th>
        <th>Batch Quantity</th>
      </tr>
    </thead>
    <tbody>${sampleRows(cells)}</tbody>
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
