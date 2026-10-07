import type { BisPrintData } from './loadBisPrintData'
import { printSignatoryDefaults } from './loadBisPrintData'
import { escapeHtml as esc } from './openPrintHtml'
import {
  addressWithIndia,
  applicantContextFromPrintData,
  applicationMetaTableHtml,
  applicationNoDisplay,
  buildPrintPage,
  dateOrNa,
  inspectionDateOrToday,
  preparedByHtml,
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
  const source =
    rows.length > 0
      ? rows
      : [
          { typeOfTest: '', durationOfTest: '', dateOfCompletion: '' },
          { typeOfTest: '', durationOfTest: '', dateOfCompletion: '' },
          { typeOfTest: '', durationOfTest: '', dateOfCompletion: '' },
        ]

  const body = source
    .map((row, i) => {
      const type = row.typeOfTest.trim() ? esc(row.typeOfTest) : '&nbsp;'
      const duration = row.durationOfTest.trim() ? esc(row.durationOfTest) : '&nbsp;'
      const done = row.dateOfCompletion.trim() ? esc(dateOrNa(row.dateOfCompletion)) : '&nbsp;'
      return `<tr><td>${i + 1}</td><td class="pd-left">${type}</td><td>${duration}</td><td>${done}</td></tr>`
    })
    .join('')

  let pad = ''
  for (let i = source.length; i < 5; i += 1) {
    pad += `<tr><td>${i + 1}</td><td class="pd-left">&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>`
  }

  return `
<table class="pd-table ldt-table">
  <thead>
    <tr>
      <th style="width:8%">Sr. No.</th>
      <th>Type of Test</th>
      <th>Duration of Test</th>
      <th>Date of Completion of Test</th>
    </tr>
  </thead>
  <tbody>${body}${pad}</tbody>
</table>`
}

function buildBody(data: UndertakingLongDurationData): string {
  const declarant = blankOr(data.declarantName || data.contactPerson || data.applicantName)
  const product = blankOr(data.productForMark)
  const standard = blankOr(data.isStandard || data.isNumber)
  const factory = addressWithIndia(data.factoryAddress || data.applicantAddress)
  const place = data.place.trim() || data.bisBranchState.trim() || '________________'
  const dateVal = inspectionDateOrToday(data.dateOfInspection)
  const sigName = data.signatoryName.trim() || data.declarantName.trim() || data.contactPerson.trim()

  return `
<div class="pd-sheet">
  <h1 class="pd-title">Undertaking for Long Duration Test</h1>
  ${applicationMetaTableHtml(data)}

  <div class="ldt-to">${toBlockHtml(data.bisBranchName, data.bisBranchState)}</div>
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

  <table class="ldt-sign-row">
    <tr>
      <td>
        <div>Place :- ${esc(place)}</div>
        <div>Date :- ${esc(dateVal)}</div>
        <div class="ldt-appno">Application No.: ${esc(applicationNoDisplay(data.applicationNumber))}</div>
      </td>
      <td class="ldt-sig">
        <div class="ldt-sig-gap"></div>
        <div>Signature</div>
        <div>Name:- <strong>${esc(sigName || '—')}</strong></div>
        <div>Designation:- ${esc(data.signatoryDesignation.trim() || '—')}</div>
        <div class="ldt-seal">Seal of the Firm</div>
      </td>
    </tr>
  </table>
  ${preparedByHtml(data.preparedBy)}
</div>`
}

const STYLES = `
  .ldt-to { margin: 8px 0 10px; line-height: 1.5; }
  .ldt-salutation { margin: 0 0 8px; }
  .ldt-table td { height: 8mm; }
  .ldt-sign-row { width: 100%; border-collapse: collapse; margin-top: 18px; }
  .ldt-sign-row td { width: 50%; vertical-align: top; font-size: 11px; line-height: 1.7; border: none; padding: 0; }
  .ldt-sig { text-align: right; }
  .ldt-sig-gap { height: 18mm; }
  .ldt-seal { margin-top: 10px; font-weight: 700; }
  .ldt-appno { margin-top: 8px; font-size: 10px; color: #57534e; }
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
  const product =
    (printData.row.title ?? '').trim() || printData.isCode.title || printData.isCode.label
  return {
    ...ctx,
    declarantName: printData.client.contactPerson || printData.client.companyName,
    productForMark: product,
    isStandard: printData.isCode.label || printData.isCode.isNumber,
    factoryAddress: ctx.applicantAddress,
    signatoryName: printSignatoryDefaults(printData).signatoryName,
    signatoryDesignation: printSignatoryDefaults(printData).signatoryDesignation,
    place: printData.client.district || printData.client.state,
    testRows: [],
  }
}
