import type { BisPrintData } from './loadBisPrintData'
import { parseUndertakingLongDurationPayload } from '../projects/undertakingPayloadModels'
import { printSignatoryDefaults } from './loadBisPrintData'
import { escapeHtml as esc } from './openPrintHtml'
import {
  addressWithIndia,
  applicantContextFromPrintData,
  applicationNoDisplay,
  buildPrintPage,
  dateOrNa,
  letterheadHtml,
  preparedByHtml,
  signatoryHtml,
  toBlockHtml,
  type PrintApplicantContext,
} from './printDocumentShared'

export type LongDurationTestRow = {
  typeOfTest: string
  durationOfTest: string
  dateOfCompletion: string
}

export type UndertakingLongDurationData = PrintApplicantContext & {
  declarantName: string
  productForMark: string
  isStandard: string
  factoryAddress: string
  signatoryName: string
  signatoryDesignation: string
  place: string
  testRows: LongDurationTestRow[]
}

function blankOr(value: string): string {
  const v = value.trim()
  return v || '________________'
}

function testTableHtml(rows: LongDurationTestRow[]): string {
  const source = rows.filter((row) =>
    [row.typeOfTest, row.durationOfTest, row.dateOfCompletion].some((value) => value.trim()),
  )

  const body = source
    .map((row, i) => {
      const type = row.typeOfTest.trim() ? esc(row.typeOfTest) : '&nbsp;'
      const duration = row.durationOfTest.trim() ? esc(row.durationOfTest) : '&nbsp;'
      const done = row.dateOfCompletion.trim() ? esc(dateOrNa(row.dateOfCompletion)) : '&nbsp;'
      return `<tr><td>${i + 1}</td><td class="pd-left">${type}</td><td>${duration}</td><td>${done}</td></tr>`
    })
    .join('')

  return `
<table class="pd-table ldt-table">
  <thead>
    <tr>
      <th style="width:8%">Sr.<br>No.</th>
      <th>Type of Test</th>
      <th>Duration of Test</th>
      <th>Date of Completion of Test</th>
    </tr>
  </thead>
  <tbody>${body}</tbody>
</table>`
}

function buildBody(data: UndertakingLongDurationData): string {
  const declarant = blankOr(data.declarantName || data.contactPerson || data.applicantName)
  const product = blankOr(data.productForMark)
  const standard = blankOr(data.isStandard || data.isNumber)
  const factory = addressWithIndia(data.factoryAddress || data.applicantAddress)
  const sigName = data.signatoryName.trim() || data.declarantName.trim() || data.contactPerson.trim()

  return `
<div class="pd-sheet">
  ${letterheadHtml(data)}
  <h1 class="pd-title">Undertaking for Long Duration Test</h1>

  <div class="pd-to-row ldt-to-row">
    <div class="pd-to-block">${toBlockHtml(data.bisBranchName, data.bisBranchState)}</div>
    <div class="pd-date-block">
      <div><strong>Date of Application:</strong> ${esc(dateOrNa(data.dateOfApplication))}</div>
      <div><strong>Application Number:</strong> ${esc(applicationNoDisplay(data.applicationNumber))}</div>
    </div>
  </div>
  <p class="ldt-salutation">Respected / Sir,</p>
  <p class="pd-body">
    I, <strong>${esc(declarant)}</strong> have applied for a license under Option 2 to you for use of BIS standard mark on
    <strong>${esc(product)}</strong> according to <strong>${esc(standard)}</strong> being manufactured at our factory at
    <strong>${esc(factory)}</strong>
  </p>
  <p class="pd-body">
    I Understand &amp; Agree that in Event of Failure of the Sample Drawn for the Purpose of Grant of Licence to Use
    &amp; Apply Standard Mark in the Following Type Tests or My Inability to Submit the Test Report for Following Tests
    within 30 Days (One Month) of the Date of Completion of the Test(s) as Confirmed by the Laboratory*, The Licence if
    Granted to Me, shall be Processed for Cancellation:
  </p>

  ${testTableHtml(data.testRows)}

  <p class="pd-body">
    Further, I duly Undertake that I shall Abide by all the Directions Issued by the Bureau in this Regard.
  </p>

  <div class="cmpf-sign-right">${signatoryHtml({ firmName: data.applicantName, name: sigName, designation: data.signatoryDesignation })}</div>
  ${preparedByHtml(data.preparedBy)}
</div>`
}

const STYLES = `
  .ldt-to-row { margin: 8px 0 12px; }
  .ldt-salutation { margin: 0 0 8px; }
  .ldt-table td { height: 8mm; }
  .cmpf-sign-right { margin-top: 14px; text-align: right; }
  .cmpf-sign-right .pd-signatory { text-align: left; }
`

export function buildUndertakingLongDurationHtml(data: UndertakingLongDurationData): string {
  return buildPrintPage({
    title: `Undertaking Long Duration Test — ${data.applicantName || 'Applicant'}`,
    styles: STYLES,
    body: buildBody(data),
  })
}

/** Maps a BIS project row + client + IS code + consultancy context into Long Duration Test fields. */
export function undertakingLongDurationDataFromPrintData(
  printData: BisPrintData,
): UndertakingLongDurationData {
  const ctx = applicantContextFromPrintData(printData)
  const payload = parseUndertakingLongDurationPayload(printData.modulePayload ?? null)
  const product =
    (printData.row.title ?? '').trim() || printData.isCode.title || printData.isCode.label
  return {
    ...ctx,
    declarantName: payload.declarantName || printData.client.contactPerson || printData.client.companyName,
    productForMark: product,
    isStandard: printData.isCode.label || printData.isCode.isNumber,
    factoryAddress: ctx.applicantAddress,
    signatoryName: printSignatoryDefaults(printData).signatoryName,
    signatoryDesignation: printSignatoryDefaults(printData).signatoryDesignation,
    place: payload.place || printData.client.district || printData.client.state,
    testRows: step6LongDurationRows(printData.modulePayload) ?? payload.testRows,
  }
}

/** Step 6 → Long Duration Tests rows (attached by the document builder as __longDurationTests), when any exist. */
function step6LongDurationRows(modulePayload: unknown): LongDurationTestRow[] | null {
  const raw = modulePayload && typeof modulePayload === 'object' ? (modulePayload as Record<string, unknown>).__longDurationTests : null
  if (!Array.isArray(raw)) return null
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim())
  const rows = raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object' && Boolean(text((r as Record<string, unknown>).testName)))
    .map((r) => ({
      typeOfTest: text(r.clauseNo) ? `${text(r.testName)} (Clause ${text(r.clauseNo)})` : text(r.testName),
      durationOfTest: text(r.duration),
      dateOfCompletion: text(r.expectedDate),
    }))
  return rows.length ? rows : null
}
