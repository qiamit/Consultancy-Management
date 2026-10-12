import type { BisPrintData } from './loadBisPrintData'
import { printSignatoryDefaults } from './loadBisPrintData'
import { parseCmpf307Payload } from '../projects/cmpf307Model'
import { escapeHtml as esc } from './openPrintHtml'
import {
  applicantContextFromPrintData,
  blankTableRows,
  buildPrintPage,
  CMPF_FORM_STYLES,
  type PrintApplicantContext,
} from './printDocumentShared'
import { formatDisplayDate } from '../projects/types'

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
  licenseValidUpTo: string
  brandNamesBeingUsed: string
  place: string
  declarationDate: string
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
  const declarationDate = data.declarationDate.trim() ? formatDisplayDate(data.declarationDate) : ''
  const reasons = data.brandsWithoutMarkReasons.trim()
  const rows = data.rows.filter((r) => Object.values(r).some((v) => v.trim()))
  const bodyRows = rows.length ? brandRows(rows) : blankTableRows(MIN_BLANK_ROWS, 5, { leftColumn: 1 })

  return `
<div class="pd-sheet">
  <div class="cmpf307-top"><div><strong>ANNEX G</strong></div><div><strong>CMPF 307</strong><br/>Oct-96</div></div>
  <h1 class="cmpf307-title">APPLICANT’S/LICENSEE’S DECLARATION OF BRAND NAME/<br/>TRADE MARK PROPOSED TO BE COVERED UNDER CERTIFICATION</h1>
  <div class="cmpf307-meta">
    <div><strong>1. Application No./Licence No.:</strong><span>${esc(data.applicationNumber)}</span></div>
    <div><strong>2. Licence Valid Up To:</strong><span>${esc(data.licenseValidUpTo ? formatDisplayDate(data.licenseValidUpTo) : '')}</span></div>
    <div><strong>3. Name/Address:-</strong><span>${esc(data.applicantName)}${data.applicantAddress ? `<br/>${esc(data.applicantAddress)}` : ''}</span></div>
  </div>
  <div class="cmpf307-used"><strong>4. Brand/Trade Names Being Used:-</strong><span>${esc(data.brandNamesBeingUsed)}</span></div>
  <p class="cmpf-heading">5.</p>
  <table class="pd-table cmpf-table">
    <colgroup><col style="width:8%"/><col style="width:46%"/><col style="width:16%"/><col style="width:16%"/><col style="width:14%"/></colgroup>
    <thead>
      <tr>
        <th>Sr. No.</th>
        <th>Brand Names/Trademark(s) which would be marked on the product bearing the BIS Standard Mark (Give actual design depiction of the Brand Name/Trade Mark(s))</th>
        <th>Owned by Self or Others</th>
        <th>Registered / Unregistered</th>
        <th>Date of Introduction</th>
      </tr>
    </thead>
    <tbody>${bodyRows}</tbody>
  </table>
  <p class="cmpf307-clause"><strong>6. Other Brand Names/Trademark(s) used for the same product marketed without BIS Standard Mark. Give reasons.</strong><br/>${reasons ? esc(reasons) : '&nbsp;'}</p>
  <p class="cmpf307-clause"><strong>7.</strong> In case Brand Names/Trademark(s) of any other party/manufacturer is being used for purposes of the above, give the design depiction of the Brand Names/Trademark(s) and copy of the agreement authorizing the use of the same.</p>
  <p class="cmpf307-clause"><strong>8.</strong> I/We undertake to inform BIS in advance as and when we propose to use any other Brand Names/Trademark(s) in conjunction with the operation of the BIS Certification Scheme.</p>
  <p class="cmpf307-clause"><strong>9.</strong> I/We also undertake that, as far as possible, the entire production which conforms to the specification shall be marked with the BIS Mark, irrespective of the Brand Names/Trademark(s) used.</p>
  <p class="cmpf307-clause"><strong>10.</strong> I/We understand that the above has been given only as information to BIS, that BIS has no role in permitting/approving of any Brand Name or Trade Mark, that this is not in any way be interpreted to mean that BIS has permitted/approved the use of the Brand Names and Trade Marks listed above, and that the responsibility is entirely mine/ours.</p>
  <div class="cmpf307-sign"><div><p><strong>Place</strong> - ${esc(data.place)}</p><p><strong>Date</strong> - ${esc(declarationDate)}</p></div><div><div class="cmpf307-sign-space"></div><p><strong>Signature</strong> -</p><p><strong>Name</strong> - ${esc(data.signatoryName || data.contactPerson)}</p><p><strong>Designation</strong> - ${esc(data.signatoryDesignation)}</p><p><strong>Seal of Firm</strong></p></div></div>
</div>`
}

export function buildCmpf307Html(data: Cmpf307Data): string {
  return buildPrintPage({
    title: `CMPF 307 — ${data.applicantName || 'Applicant'}`,
    styles: `${CMPF_FORM_STYLES}\n.cmpf307-top{display:flex;justify-content:space-between;text-align:center;font-family:'Times New Roman',serif;font-size:13px;line-height:1.25;margin-bottom:7px}.cmpf307-title{text-align:center;font:bold 14px/1.25 'Times New Roman',serif;margin:8px 0 12px}.cmpf307-meta{display:grid;gap:5px;font:12px/1.35 'Times New Roman',serif}.cmpf307-meta>div{display:grid;grid-template-columns:62mm 1fr;gap:5px}.cmpf307-meta span,.cmpf307-used span{font-weight:700;text-decoration:underline}.cmpf307-used{display:grid;grid-template-columns:62mm 1fr;gap:5px;margin-top:10px;font:12px/1.35 'Times New Roman',serif}.cmpf307-used span{white-space:pre-wrap}.cmpf307-clause{margin:7px 0;font:11.5px/1.3 'Times New Roman',serif;text-align:justify}.cmpf307-clause strong{font-weight:700}.cmpf307-sign{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px;font:11.5px/1.3 'Times New Roman',serif}.cmpf307-sign p{margin:6px 0}.cmpf307-sign-space{height:10mm}`,
    body: buildBody(data),
  })
}

/** Maps a BIS project row + client + IS code + consultancy context into CMPF-307 fields. */
export function cmpf307DataFromPrintData(printData: BisPrintData): Cmpf307Data {
  const modulePayload = parseCmpf307Payload(printData.modulePayload ?? null)
  const signatory = printSignatoryDefaults(printData)
  return {
    ...applicantContextFromPrintData(printData),
    signatoryName: modulePayload.signatoryName || signatory.signatoryName,
    signatoryDesignation: modulePayload.signatoryDesignation || signatory.signatoryDesignation,
    brandsWithoutMarkReasons: modulePayload.brandsWithoutMarkReasons,
    licenseValidUpTo: modulePayload.licenseValidUpTo || formatDisplayDate(printData.row.license_validity_date),
    brandNamesBeingUsed: modulePayload.brandNamesBeingUsed,
    place: modulePayload.place,
    declarationDate: modulePayload.declarationDate,
    rows: modulePayload.rows,
  }
}
