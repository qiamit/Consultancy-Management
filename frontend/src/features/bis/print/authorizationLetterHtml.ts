import { formatCmL, formatDisplayDate, todayIsoDate } from '../projects/types'
import type { BisPrintData } from './loadBisPrintData'
import { escapeHtml as esc } from './openPrintHtml'

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
  const contact = [
    data.applicantPhone ? `Tel: ${esc(data.applicantPhone)}` : '',
    data.applicantEmail ? `Email: ${esc(data.applicantEmail)}` : '',
    data.applicantGst ? `GSTIN: ${esc(data.applicantGst)}` : '',
  ]
    .filter(Boolean)
    .join(' &nbsp;|&nbsp; ')

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
  const authorizedName = blank(data.authorizedName || data.signatoryName || data.applicantName)
  const authorizedDesig = blank(data.authorizedDesignation)
  const appNo = data.applicationNumber.trim() || 'CM/A - N/A'
  const sigName = data.signatoryName.trim() || data.authorizedName.trim() || '—'
  const sigDesig = data.signatoryDesignation.trim() || data.authorizedDesignation.trim() || '—'

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

  <div class="al-signatory">
    <div class="al-for">For <strong>${esc(data.applicantName)}</strong></div>
    <div class="al-sign-space"></div>
    <div class="al-sign-line"></div>
    <div><strong>${esc(sigName)}</strong></div>
    <div>${esc(sigDesig)}</div>
    <div class="al-seal-note">(Signature &amp; Seal of the Firm)</div>
  </div>

  ${data.preparedBy ? `<div class="al-prepared">Prepared by ${esc(data.preparedBy)}</div>` : ''}
</div>`
}

const LETTER_STYLES = `
  @page { size: A4 portrait; margin: 12mm 15mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .al-sheet {
    font-family: "Times New Roman", Times, serif;
    color: #111;
    font-size: 12.5px;
    line-height: 1.55;
    max-width: 180mm;
    margin: 0 auto;
    padding: 10mm 8mm;
    position: relative;
  }
  @media print { .al-sheet { max-width: none; padding: 0; } }
  .al-letterhead { text-align: center; border-bottom: 2px solid #b45309; padding-bottom: 8px; margin-bottom: 14px; }
  .al-firm { font-size: 20px; font-weight: 700; letter-spacing: 0.03em; color: #292524; text-transform: uppercase; }
  .al-firm-addr { font-size: 11.5px; margin-top: 3px; color: #44403c; }
  .al-firm-contact { font-size: 10.5px; margin-top: 3px; color: #57534e; }
  .al-title { text-align: center; font-size: 16px; font-weight: 700; text-decoration: underline; margin: 0 0 14px; }
  .al-to-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 14px; }
  .al-to-block { line-height: 1.5; }
  .al-date-block { text-align: right; line-height: 1.6; white-space: nowrap; }
  .al-subject { margin: 0 0 10px; }
  .al-salutation { margin: 0 0 10px; }
  .al-body { margin: 0 0 10px; text-align: justify; }
  .al-thanks { margin: 14px 0 2px; }
  .al-yours { margin: 0 0 6px; }
  .al-signatory { margin-top: 6px; min-width: 70mm; display: inline-block; }
  .al-sign-space { height: 22mm; }
  .al-sign-line { border-top: 1px solid #111; width: 60mm; margin-bottom: 3px; }
  .al-seal-note { font-size: 10px; color: #57534e; margin-top: 2px; }
  .al-prepared { margin-top: 18px; font-size: 9px; color: #78716c; text-align: right; border-top: 1px solid #e7e5e4; padding-top: 4px; }
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
export function authorizationLetterDataFromPrintData({
  row,
  client,
  isCode,
  company,
}: BisPrintData): AuthorizationLetterData {
  const address = [client.address, client.district, client.state, client.pinCode]
    .map((p) => p.trim())
    .filter(Boolean)
    .join(', ')

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
    authorizedName: client.contactPerson,
    authorizedDesignation: '',
    signatoryName: client.contactPerson,
    signatoryDesignation: '',
    preparedBy: company.companyName,
  }
}
