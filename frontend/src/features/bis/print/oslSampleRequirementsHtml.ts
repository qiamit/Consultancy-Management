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

function printableRows(rows: OslSampleRequirementRow[]): OslSampleRequirementRow[] {
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

function sampleRows(rows: OslSampleRequirementRow[]): string {
  const filled = printableRows(rows)
  if (filled.length === 0) {
    return `<tr><td colspan="6" class="pd-left">No samples marked for letter.</td></tr>`
  }
  return filled
    .map((r, i) => {
      const grade = r.gradeTypeVariety.trim() || r.sampleDescription.trim()
      return `<tr>
      <td>${i + 1}</td>
      <td class="pd-left">${esc(grade)}</td>
      <td>${esc(r.declaredValue)}</td>
      <td>${esc(r.batchNumber)}</td>
      <td>${esc(r.dateOfManufacturing ? formatDisplayDate(r.dateOfManufacturing) : '')}</td>
      <td>${esc(r.batchQuantity || r.sampleQuantity)}</td>
    </tr>`
    })
    .join('')
}

function buildBody(data: OslSampleRequirementsData): string {
  const appNo = applicationNoDisplay(data.applicationNumber)
  const inspection = inspectionDateOrToday(data.dateOfInspection)
  const stdRef = isStandardRefHtml(data.isNumber, data.isTitle)
  const sigName = data.signatoryName.trim() || data.contactPerson.trim()

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
    <colgroup>
      <col style="width:6%"/><col style="width:28%"/><col style="width:16%"/><col style="width:16%"/><col style="width:16%"/><col style="width:18%"/>
    </colgroup>
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
    <tbody>${sampleRows(data.rows)}</tbody>
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
  .osl-closing { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-top: 8px; break-inside: avoid; page-break-inside: avoid; }
  .osl-declaration { flex: 1; margin: 0; font-size: 11px; line-height: 1.4; text-align: justify; }
  .osl-sign { flex-shrink: 0; }
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
