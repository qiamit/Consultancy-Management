import type { BisPrintData } from './loadBisPrintData'
import { printSignatoryDefaults } from './loadBisPrintData'
import { escapeHtml as esc } from './openPrintHtml'
import {
  applicantContextFromPrintData,
  applicationNoDisplay,
  blankTableRows,
  buildPrintPage,
  CMPF_FORM_STYLES,
  inspectionDateOrToday,
  letterheadHtml,
  preparedByHtml,
  signatoryHtml,
  toBlockHtml,
  type PrintApplicantContext,
} from './printDocumentShared'

export type Cmpf307BrandRow = {
  brandName: string
  ownedBy: string
  registeredStatus: string
  registrationDate: string
}

export type Cmpf307Data = PrintApplicantContext & {
  signatoryName: string
  signatoryDesignation: string
  brandsWithoutMarkReasons: string
  rows: Cmpf307BrandRow[]
}

const MIN_BLANK_ROWS = 10

function brandRows(rows: Cmpf307BrandRow[]): string {
  const filled = rows.filter((r) => Object.values(r).some((v) => v.trim()))
  if (filled.length === 0) return blankTableRows(MIN_BLANK_ROWS, 5, { leftColumn: 1 })
  const total = Math.max(MIN_BLANK_ROWS, filled.length)
  const out: string[] = []
  for (let i = 0; i < total; i += 1) {
    const r = filled[i]
    const cell = (v?: string) => (v ? esc(v) : '&nbsp;')
    out.push(`<tr>
      <td>${i + 1}</td>
      <td class="pd-left">${cell(r?.brandName)}</td>
      <td>${cell(r?.ownedBy)}</td><td>${cell(r?.registeredStatus)}</td><td>${cell(r?.registrationDate)}</td>
    </tr>`)
  }
  return out.join('')
}

function buildBody(data: Cmpf307Data): string {
  const letterDate = inspectionDateOrToday(data.dateOfInspection)
  const sigName = data.signatoryName.trim() || data.contactPerson.trim()
  const reasons = data.brandsWithoutMarkReasons.trim()

  return `
<div class="pd-sheet">
  ${letterheadHtml(data)}
  <div class="cmpf-form-id">CMPF - 307</div>
  <h1 class="pd-title">Declaration of Brand Names Proposed to be Covered Under Certification</h1>

  <div class="pd-to-row">
    <div class="pd-to-block">${toBlockHtml(data.bisBranchName, data.bisBranchState)}</div>
    <div class="pd-date-block">
      <div><strong>Date of Inspection:</strong> ${esc(letterDate)}</div>
      <div><strong>Application No.:</strong> ${esc(applicationNoDisplay(data.applicationNumber))}</div>
    </div>
  </div>

  <p class="cmpf-heading">4. Brand / Trade Names Being Used:-</p>
  <table class="pd-table cmpf-table">
    <colgroup><col style="width:6%"/><col style="width:40%"/><col style="width:16%"/><col style="width:17%"/><col style="width:21%"/></colgroup>
    <thead>
      <tr>
        <th>Sr.</th>
        <th>Brand Names / Trade-Mark(s) which would be marked on the product bearing the BIS Standard Mark<br/>(Give actual design depiction of the Brand Name / Trade-Mark(s))</th>
        <th>Owned by Self or Others</th>
        <th>Registered / Unregistered</th>
        <th>Date of Registration / Introduction</th>
      </tr>
    </thead>
    <tbody>${brandRows(data.rows)}</tbody>
  </table>

  <div class="cmpf-terms">
    <p><strong>Note-1:-</strong> In case the brand name is registered in your name, enclose copies of the Registration Certificate / document.</p>
    <p><strong>Note-2:-</strong> In case the brand name is not registered in your name, enclose copies of the agreement authorizing use of this / these brand name(s).</p>
  </div>

  <p class="cmpf-heading"><span>5.</span> Brand / Trade Names which will not carry the BIS Certification Mark. Give reasons.</p>
  <div class="cmpf-box">${reasons ? esc(reasons) : '&nbsp;'}</div>

  <div class="cmpf-decls">
    <p><strong>6.</strong> I/We understand that in the event of a dispute with any other party over the use of the above Brand Names / Trade Marks, the responsibility is entirely ours and BIS would not be involved in such disputes.</p>
    <p><strong>7.</strong> I/We also understand that in the event of any change, I/We will submit a revised declaration in the prescribed proforma before introducing the change in brand use, including deletion or addition.</p>
    <p><strong>8.</strong> I/We also understand to maintain production and dispatch records of the product covered under the licence under each brand separately.</p>
    <p><strong>9.</strong> I/We also understand that, as far as possible, the entire production under the above brands which conforms to the specification shall be marked with the Standard Mark.</p>
  </div>

  <div class="cmpf-sign-right">${signatoryHtml({ firmName: data.applicantName, name: sigName, designation: data.signatoryDesignation })}</div>
  ${preparedByHtml(data.preparedBy)}
</div>`
}

export function buildCmpf307Html(data: Cmpf307Data): string {
  return buildPrintPage({
    title: `CMPF 307 — ${data.applicantName || 'Applicant'}`,
    styles: CMPF_FORM_STYLES,
    body: buildBody(data),
  })
}

/** Maps a BIS project row + client + IS code + consultancy context into CMPF-307 fields. */
export function cmpf307DataFromPrintData(printData: BisPrintData): Cmpf307Data {
  return {
    ...applicantContextFromPrintData(printData),
    signatoryName: printSignatoryDefaults(printData).signatoryName,
    signatoryDesignation: printSignatoryDefaults(printData).signatoryDesignation,
    brandsWithoutMarkReasons: '',
    rows: [],
  }
}
