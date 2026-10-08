import { formatCmL, formatDisplayDate, todayIsoDate } from '../projects/types'
import type { BisPrintData } from './loadBisPrintData'
import { escapeHtml as esc } from './openPrintHtml'
import { PRINT_PAGE_FRAME_CSS } from './printDocumentShared'

export const AUTH_LETTER_REPRESENTATION_PARAGRAPH =
  'The said authorized representative is duly empowered to submit all requisite documents and correspondence, furnish complete and truthful information as may be required by the Bureau of Indian Standards, attend meetings and discussions with BIS officials, offer product samples for verification and independent testing, and to affix signature on behalf of the firm in respect of all matters pertaining to the above application, licence grant proceedings, factory inspection, surveillance visits, and related compliance requirements under the BIS Conformity Assessment Scheme.'

export const AUTH_LETTER_RESPONSIBILITY_PARAGRAPH =
  'We hereby undertake full and unconditional responsibility for all acts, submissions, declarations, representations, and communications made by the authorized representative on our behalf in connection with the aforesaid application. This authorization shall remain in full force and effect unless and until expressly revoked by us by a written communication addressed to the concerned office of the Bureau of Indian Standards.'

export type AuthorizationLetterData = {
  applicantName: string
  applicantAddress: string
  applicantEmail: string
  applicantPhone: string
  applicantGst: string
  bisBranchName: string
  bisBranchState: string
  applicationNumber: string
  letterDate: string
  isNumber: string
  isTitle: string
  authorizedName: string
  authorizedDesignation: string
  signatoryName: string
  signatoryDesignation: string
  preparedBy: string
}

function blank(value: string, fallback = '________________'): string {
  const v = esc(value.trim())
  return v || fallback
}

function addressWithIndia(address: string, state: string): string {
  const line = address.trim()
  if (line) return /\bindia\b/i.test(line) ? esc(line) : `${esc(line)}, INDIA`
  const fallback = state.trim() || '______________________________'
  return `${esc(fallback)}, INDIA`
}

function buildLetterheadHtml(data: AuthorizationLetterData): string {
  const parts: string[] = []
  if (data.applicantPhone.trim()) {
    parts.push(`<span class="pd-lh-phone">Tel: ${esc(data.applicantPhone)}</span>`)
  }
  if (data.applicantEmail.trim()) {
    parts.push(`<span class="pd-lh-email">Email: ${esc(data.applicantEmail)}</span>`)
  }
  if (data.applicantGst.trim()) {
    parts.push(`<span class="pd-lh-gst">GSTIN: ${esc(data.applicantGst)}</span>`)
  }
  const contact = parts.join('')

  return `
<div class="al-letterhead">
  <div class="al-firm">${esc(data.applicantName || 'Applicant Firm')}</div>
  ${data.applicantAddress ? `<div class="al-firm-addr">${esc(data.applicantAddress)}</div>` : ''}
  ${contact ? `<div class="al-firm-contact">${contact}</div>` : ''}
</div>`
}

function buildBody(data: AuthorizationLetterData): string {
  const isNo = data.isNumber.trim()
  const standard = isNo
    ? data.isTitle.trim()
      ? `${esc(isNo)} — ${esc(data.isTitle.trim())}`
      : esc(isNo)
    : '________________'
  const authorizedName = blank(data.authorizedName || data.applicantName)
  const authorizedDesig = blank(data.authorizedDesignation)
  const appNo = data.applicationNumber.trim() || 'CM/A - N/A'
  const personName = (data.authorizedName || '—').trim() || '—'
  const personDesig = data.authorizedDesignation.trim()
  const personLine = personDesig
    ? `<strong>${esc(personName)}</strong> (${esc(personDesig)})`
    : `<strong>${esc(personName)}</strong>`
  const byName = (data.signatoryName || '—').trim() || '—'
  const byDesig = data.signatoryDesignation.trim()
  const byLine = byDesig
    ? `<strong>${esc(byName)}</strong> (${esc(byDesig)})`
    : `<strong>${esc(byName)}</strong>`

  return `
<div class="al-sheet">
  ${buildLetterheadHtml(data)}

  <h1 class="al-title">Authorization Letter</h1>

  <div class="al-to-row">
    <div class="al-to-block">
      To<br/>
      The Director &amp; Head<br/>
      Bureau of Indian Standards<br/>
      ${esc(data.bisBranchName.trim() || '________________')}, ${esc(data.bisBranchState.trim() || '________________')}, INDIA
    </div>
    <div class="al-date-block">
      <div><strong>Date:</strong> ${esc(formatDisplayDate(data.letterDate))}</div>
      <div><strong>Application No.:</strong> ${esc(appNo)}</div>
    </div>
  </div>

  <p class="al-subject"><strong>Subject:</strong> Authorization Letter for BIS Certification</p>
  <p class="al-salutation">Dear Sir,</p>

  <p class="al-body">
    We, <strong>M/s. ${esc(data.applicantName)}</strong>, having our factory / manufacturing unit at
    <strong>${addressWithIndia(data.applicantAddress, data.bisBranchState)}</strong>, hereby authorize
    <strong>${authorizedName}</strong>, <strong>${authorizedDesig}</strong> to represent our firm and to interact with
    the officials of Bureau of Indian Standards in connection with our application for grant of licence for use of
    BIS Standard Mark on our product(s) conforming to <strong>${standard}</strong>.
  </p>

  <p class="al-body">${esc(AUTH_LETTER_REPRESENTATION_PARAGRAPH)}</p>
  <p class="al-body">${esc(AUTH_LETTER_RESPONSIBILITY_PARAGRAPH)}</p>

  <p class="al-thanks">Thanking you,</p>
  <p class="al-yours">Yours faithfully,</p>

  <div class="al-sign-row">
    <div class="al-signatory">
      <div class="al-for">For <strong>${esc(data.applicantName)}</strong></div>
      <div class="al-sign-label">Authorized By</div>
      <div class="al-sign-space al-sign-space-by"></div>
      <div class="al-sign-line"></div>
      <div>${byLine}</div>
    </div>
    <div class="al-signatory al-signatory-right">
      <div class="al-sign-label">Authorized Person</div>
      <div class="al-sign-space al-sign-space-person"></div>
      <div class="al-sign-line"></div>
      <div>${personLine}</div>
    </div>
  </div>

</div>`
}

const LETTER_STYLES = `
  @page { size: A4 portrait; margin: 5mm 8mm 5mm 11mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .al-sheet {
    font-family: Arial, Helvetica, "Liberation Sans", sans-serif;
    color: #000;
    font-size: 13px;
    line-height: 1.45;
    max-width: 180mm;
    margin: 0 auto;
    padding: 2mm;
    position: relative;
  }
  ${PRINT_PAGE_FRAME_CSS}
  .al-letterhead { text-align: center; border-bottom: 2px solid #b45309; padding-bottom: 8px; margin-bottom: 14px; }
  .al-firm { font-family: "Times New Roman", Times, serif; font-size: 20px; font-weight: 700; letter-spacing: 0.03em; color: #000; text-transform: uppercase; }
  .al-firm-addr { font-size: 12.5px; margin-top: 3px; color: #111; font-weight: 500; }
  .al-firm-contact { font-size: 11.5px; margin-top: 3px; color: #111; font-weight: 500; }
  .al-title { text-align: center; font-size: 16px; font-weight: 700; text-decoration: underline; margin: 0 0 14px; color: #000; }
  .al-to-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 14px; }
  .al-to-block { line-height: 1.5; }
  .al-date-block { text-align: right; line-height: 1.6; white-space: nowrap; }
  .al-subject { margin: 0 0 10px; }
  .al-salutation { margin: 0 0 10px; }
  .al-body { margin: 0 0 10px; text-align: justify; }
  .al-thanks { margin: 14px 0 2px; }
  .al-yours { margin: 0 0 6px; }
  .al-sign-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 18px;
    margin-top: 6px;
  }
  .al-signatory { margin-top: 0; min-width: 70mm; flex: 1 1 70mm; display: inline-block; line-height: 1.35; text-align: left; }
  .al-signatory-right { text-align: right; margin-left: auto; }
  .al-signatory-right .al-sign-space { justify-content: flex-end; }
  .al-signatory-right .al-sign-line { margin-left: auto; margin-right: 0; }
  .al-sign-label { font-size: 11px; color: #222; margin: 0 0 2px; font-weight: 700; }
  .al-for { margin: 0 0 1px; }
  .al-sign-space { height: 12mm; display: flex; align-items: flex-end; justify-content: flex-start; }
  .al-sign-space .pd-sign-img {
    max-height: 11mm;
    max-width: 48mm;
    object-fit: contain;
    background: transparent;
    mix-blend-mode: multiply;
  }
  .al-sign-line {
    display: block;
    border-top: 1px solid #111;
    width: 48mm;
    max-width: 100%;
    margin: 1px 0 2px 0;
    box-sizing: border-box;
  }
  .al-seal-note { font-size: 11px; color: #222; margin: 2px 0 4px; }
  .al-prepared { display: none !important; }
  .pd-page-num {
    position: absolute;
    left: 2mm;
    right: 2mm;
    bottom: 2mm;
    margin: 0;
    font-size: 10.5px;
    color: #222;
    text-align: right;
    border-top: 1.25px solid #666;
    padding-top: 4px;
    background: #fff;
    z-index: 2;
    font-weight: 600;
  }
  .al-signatory, .al-body { break-inside: avoid; page-break-inside: avoid; }
`

export function buildAuthorizationLetterHtml(data: AuthorizationLetterData): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Authorization Letter — ${esc(data.applicantName || 'Applicant')}</title>
  <style>${LETTER_STYLES}</style>
</head>
<body>
${buildBody(data)}
</body>
</html>`
}

/** Maps a BIS project row + client + IS code + consultancy context into Authorization Letter fields. */
export function authorizationLetterDataFromPrintData(printData: BisPrintData): AuthorizationLetterData {
  const { row, client, isCode, company } = printData
  const address = [client.address, client.district, client.state, client.pinCode]
    .map((p) => p.trim())
    .filter(Boolean)
    .join(', ')
  const tm = printData.topManagement
  const authName = String(tm?.authorizedSignatoryName ?? '').trim()
  const authDesig = String(tm?.authorizedSignatoryDesignation ?? '').trim()
  const authorizedBy = String(tm?.authorizedBy ?? '').trim()
  const tmRows = Array.isArray(tm?.rows) ? tm.rows : []
  const byRow = tmRows.find(
    (item) =>
      item &&
      typeof item === 'object' &&
      String((item as Record<string, unknown>).personName ?? '').trim() === authorizedBy,
  ) as Record<string, unknown> | undefined
  // Authorized By must stay the TM "Authorized By" person (not the authorized person overlay).
  const firmSigName = authorizedBy || client.contactPerson
  const firmSigDesig = String(byRow?.designation ?? '').trim()

  return {
    applicantName: client.companyName,
    applicantAddress: address,
    applicantEmail: client.email,
    applicantPhone: client.mobile,
    applicantGst: client.gstNumber,
    bisBranchName: '',
    bisBranchState: client.state,
    applicationNumber: (row.license_number ?? '').trim() || (row.cm_l_digits ? formatCmL(row.cm_l_digits) : ''),
    letterDate: todayIsoDate(),
    isNumber: isCode.label,
    isTitle: isCode.title,
    // 1) Person being authorized (Top Management → Authorized Signatory).
    authorizedName: authName || client.contactPerson,
    authorizedDesignation: authDesig,
    // 2) Person who authorizes / signs for the firm (Top Management → Authorized By).
    signatoryName: firmSigName,
    signatoryDesignation: firmSigDesig,
    preparedBy: company.companyName,
  }
}
