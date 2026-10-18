import type { BisPrintData } from './loadBisPrintData'
import { printSignatoryDefaults } from './loadBisPrintData'
import { cmpf307RowHasContent, parseCmpf307Payload } from '../projects/cmpf307Model'
import { escapeHtml as esc } from './openPrintHtml'
import {
  applicantContextFromPrintData,
  buildPrintPage,
  CMPF_FORM_STYLES,
  inspectionDateOrToday,
  toBlockHtml,
  type PrintApplicantContext,
} from './printDocumentShared'
import { formatDisplayDate, todayIsoDate } from '../projects/types'

export type Cmpf307BrandRow = {
  rowId: string
  brandName: string
  ownedBy: string
  registeredStatus: string
  registrationDate: string
  agreementFileId?: string
  agreementFileName?: string
  agreementStoragePath?: string
  trademarkFileId?: string
  trademarkFileName?: string
  trademarkStoragePath?: string
}

export type Cmpf307Data = PrintApplicantContext & {
  signatoryName: string
  signatoryDesignation: string
  signatureImageUrl?: string
  brandsWithoutMarkReasons: string
  licenseValidUpTo: string
  brandNamesBeingUsed: string
  place: string
  declarationDate: string
  rows: Cmpf307BrandRow[]
}

function brandRows(rows: Cmpf307BrandRow[]): string {
  const out: string[] = []
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i]
    const cell = (v?: string) => (v ? esc(v) : '&nbsp;')
    out.push(`<tr>
      <td>${i + 1}</td>
      <td class="pd-left">${cell(r?.brandName)}</td>
      <td>${cell(r?.ownedBy)}</td><td>${cell(r?.registeredStatus)}</td><td>${cell(r?.registrationDate ? formatDisplayDate(r.registrationDate) : '')}</td>
    </tr>`)
  }
  return out.join('')
}

function buildBody(data: Cmpf307Data): string {
  const dateOfInspection = inspectionDateOrToday(data.dateOfInspection)
  const reasons = data.brandsWithoutMarkReasons.trim()
  const rows = data.rows.filter(cmpf307RowHasContent)
  const bodyRows = brandRows(rows)
  const brandNames = data.brandNamesBeingUsed.trim() || rows.map((row) => row.brandName.trim()).filter(Boolean).join(', ') || 'the brand names listed below'

  return `
<div class="pd-sheet">
  <div class="cmpf307-top"><div><strong>ANNEX G</strong></div><div><strong>CMPF 307</strong></div></div>
  <h1 class="cmpf307-title">APPLICANT’S/LICENSEE’S DECLARATION OF BRAND NAME/<br/>TRADE MARK PROPOSED TO BE COVERED UNDER CERTIFICATION</h1>
  <div class="cmpf307-recipient">
    <div class="cmpf307-to">${toBlockHtml(data.bisBranchName, data.bisBranchState)}</div>
    <div class="cmpf307-project-meta"><div><strong>Date of Inspection:</strong> ${esc(dateOfInspection)}</div><div><strong>Application No.:</strong> ${esc(data.applicationNumber || '—')}</div></div>
  </div>
  <p class="cmpf307-intro">Respected Sir, We hereby submit this application on behalf of M/s. <strong>${esc(data.applicantName || '—')}</strong>, located at <strong>${esc(data.applicantAddress || '—')}</strong>, seeking coverage of <strong>${esc(brandNames)}</strong> under the BIS Standard Mark for IS <strong>${esc(data.isNumber || '—')}</strong>, titled “<strong>${esc(data.isTitle || '—')}</strong>”. We respectfully request your kind consideration of the details and supporting information furnished with this application under the applicable Indian Standard and BIS Certification Scheme.</p>
  <table class="pd-table cmpf-table cmpf307-table">
    <colgroup><col style="width:8%"/><col style="width:34%"/><col style="width:20%"/><col style="width:20%"/><col style="width:18%"/></colgroup>
    <thead>
      <tr>
        <th><span>Sr.</span><br/><span>No.</span></th>
        <th>Brand Name / Trade Mark</th>
        <th>Self / Others</th>
        <th>Registered / Unregistered</th>
        <th>Date of Introduction</th>
      </tr>
    </thead>
    <tbody>${bodyRows}</tbody>
  </table>
  <p class="cmpf307-clause"><strong>1. Other Brand Names/Trademark(s) used for the same product marketed without BIS Standard Mark. Give reasons.</strong><br/>${reasons ? esc(reasons) : '&nbsp;'}</p>
  <p class="cmpf307-clause"><strong>2.</strong> In case Brand Names/Trademark(s) of any other party/manufacturer is being used for purposes of the above, give the design depiction of the Brand Names/Trademark(s) and copy of the agreement authorizing the use of the same.</p>
  <p class="cmpf307-clause"><strong>3.</strong> I/We undertake to inform BIS in advance as and when we propose to use any other Brand Names/Trademark(s) in conjunction with the operation of the BIS Certification Scheme.</p>
  <p class="cmpf307-clause"><strong>4.</strong> I/We also undertake that, as far as possible, the entire production which conforms to the specification shall be marked with the BIS Mark, irrespective of the Brand Names/Trademark(s) used.</p>
  <p class="cmpf307-clause"><strong>5.</strong> I/We understand that the above has been given only as information to BIS, that BIS has no role in permitting/approving of any Brand Name or Trade Mark, that this is not in any way be interpreted to mean that BIS has permitted/approved the use of the Brand Names and Trade Marks listed above, and that the responsibility is entirely mine/ours.</p>
  <div class="cmpf307-sign"><div class="cmpf307-place-date"><p><strong>Place</strong> - ${esc(data.place)}</p><p><strong>Date</strong> - ${esc(dateOfInspection)}</p></div><div class="cmpf307-signature-block"><div class="cmpf307-for">For <strong>${esc(data.applicantName || 'Applicant Firm')}</strong></div>${data.signatureImageUrl?.trim() ? `<img class="cmpf307-sign-image" src="${esc(data.signatureImageUrl.trim())}" alt="Authorized signatory stamp and signature" />` : '<div class="cmpf307-sign-space"></div>'}<div class="cmpf307-sign-line"></div><div class="cmpf307-signatory-name"><strong>${esc(data.signatoryName || data.contactPerson)}</strong>${data.signatoryDesignation ? ` (${esc(data.signatoryDesignation)})` : ''}</div></div></div>
</div>`
}

export function buildCmpf307Html(data: Cmpf307Data): string {
  return buildPrintPage({
    title: `CMPF 307 — ${data.applicantName || 'Applicant'}`,
    styles: `${CMPF_FORM_STYLES}\n.cmpf307-top{display:flex;justify-content:space-between;text-align:center;font-family:'Times New Roman',serif;font-size:13px;line-height:1.25;margin-bottom:7px}.cmpf307-title{text-align:center;font:bold 14px/1.25 'Times New Roman',serif;margin:8px 0 12px}.cmpf307-recipient{display:grid;grid-template-columns:minmax(0,1fr) 67mm;gap:8mm;align-items:start;margin:10px 0 7px;font:11.5px/1.4 'Times New Roman',serif}.cmpf307-to{line-height:1.45}.cmpf307-project-meta{text-align:right;line-height:1.55}.cmpf307-intro{margin:7px 0;font:11.5px/1.35 'Times New Roman',serif;text-align:justify}.pd-sheet.pd-sheet .cmpf307-intro{font-size:13px!important;line-height:1.45!important}.cmpf307-clause{margin:7px 0;font:11.5px/1.3 'Times New Roman',serif;text-align:justify}.cmpf307-clause strong{font-weight:700}.pd-sheet .cmpf307-table th{background:#292524!important;color:#fde68a!important;border-color:#57534e!important;font:700 10px/1.25 Arial,Helvetica,sans-serif!important;padding:6px 5px!important;text-align:center!important}.cmpf307-table td{font:11px/1.3 Arial,Helvetica,sans-serif!important}.cmpf307-sign{display:grid;grid-template-columns:1fr 1fr;align-items:end;gap:10px;margin-top:18px;font:11.5px/1.3 'Times New Roman',serif}.cmpf307-place-date p{margin:6px 0}.cmpf307-signature-block{text-align:right;page-break-inside:avoid;break-inside:avoid}.cmpf307-for{margin-bottom:1mm}.cmpf307-sign-space{height:8mm}.cmpf307-sign-image{display:block;max-width:40mm;max-height:16mm;object-fit:contain;margin:0 0 1mm auto}.cmpf307-sign-line{width:50mm;border-top:1px solid #111;margin:0 0 2px auto}.cmpf307-signatory-name{text-align:right}`,
    body: buildBody(data),
  })
}

/** Maps a BIS project row + client + IS code + consultancy context into CMPF-307 fields. */
export function cmpf307DataFromPrintData(printData: BisPrintData): Cmpf307Data {
  const modulePayload = parseCmpf307Payload(printData.modulePayload ?? null)
  const signatory = printSignatoryDefaults(printData)
  const management = printData.topManagement ?? {}
  const managementRows = Array.isArray(management.rows)
    ? management.rows.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    : []
  const selectedManagement = managementRows.find((item) => Boolean(item.applySignatureToDocuments))
  const firstManagement = managementRows.find((item) => String(item.personName ?? '').trim())
  const managementSignatoryName = String(management.authorizedSignatoryName ?? '').trim() ||
    String(management.signatoryName ?? '').trim() ||
    String(selectedManagement?.personName ?? firstManagement?.personName ?? '').trim()
  const managementSignatoryDesignation = String(management.authorizedSignatoryDesignation ?? '').trim() ||
    String(management.signatoryDesignation ?? '').trim() ||
    String(selectedManagement?.designation ?? firstManagement?.designation ?? '').trim()
  return {
    ...applicantContextFromPrintData(printData),
    signatoryName: managementSignatoryName || signatory.signatoryName,
    signatoryDesignation: managementSignatoryDesignation || signatory.signatoryDesignation,
    signatureImageUrl: signatory.signatureImageUrl,
    brandsWithoutMarkReasons: modulePayload.brandsWithoutMarkReasons,
    licenseValidUpTo: String(printData.row.license_validity_date ?? '').slice(0, 10),
    brandNamesBeingUsed: modulePayload.rows.map((brand) => brand.brandName.trim()).filter(Boolean).join(', '),
    place: printData.client.district || printData.client.state,
    declarationDate: todayIsoDate(),
    rows: modulePayload.rows,
  }
}
