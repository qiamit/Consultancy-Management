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
  type PrintApplicantContext,
} from './printDocumentShared'
import { formatCmL, formatDisplayDate } from '../projects/types'

export type LegalDocumentsData = PrintApplicantContext & {
  cmLNumber: string
  licenseValidity: string
  signatoryName: string
  signatoryDesignation: string
}

export type FirmPackModuleConfig = {
  title: string
  subject: string
  packLabel: string
  items: string[]
}

const FIRM_PACK_CONFIGS: Record<string, FirmPackModuleConfig> = {
  legal: {
    title: 'Legal Documents',
    subject: 'Submission / record of Legal Documents',
    packLabel: 'Legal Documents Pack',
    items: [
      'Company / firm registration proof (as applicable)',
      'GST registration / tax identity (as applicable)',
      'Factory / unit ownership or lease documents',
      'Authorization / power of attorney for BIS dealings (if any)',
      'Any other statutory / legal papers required for the licence',
    ],
  },
  application: {
    title: 'Application Details',
    subject: 'Submission / record of Application, Licence and Branch Details',
    packLabel: 'Application Details Pack',
    items: [
      'BIS application form / covering papers',
      'Product / IS scope particulars',
      'Applicant / manufacturer particulars',
      'Supporting annexures for the application',
      'BIS licence / grant communication and CM/L validity papers',
      'Endorsements / inclusions / stop marking / revival papers (if any)',
      'Concerned BIS Branch Office particulars and correspondence',
      'Factory / branch address proofs and visit-related branch papers (if any)',
      'Any other application, licence or branch papers required for the record',
    ],
  },
}

function buildBody(data: LegalDocumentsData, config: FirmPackModuleConfig): string {
  const letterDate = inspectionDateOrToday(data.dateOfInspection)
  const isStdRef = isStandardRefHtml(data.isNumber, data.isTitle)
  const sigName = data.signatoryName.trim() || data.contactPerson.trim()
  const cmL = data.cmLNumber.trim() || '—'
  const validity = data.licenseValidity.trim() || '—'
  const itemsHtml = config.items.map((item) => `<li>${esc(item)}</li>`).join('')

  return `
<div class="pd-sheet">
  ${letterheadHtml(data)}
  <h1 class="pd-title">${esc(config.title)}</h1>

  <div class="pd-to-row">
    <div class="pd-to-block">
      To,<br/>
      The Bureau of Indian Standards<br/>
      ${data.bisBranchName ? esc(data.bisBranchName) : 'Concerned Branch Office'}
      ${data.bisBranchState ? `<br/>${esc(data.bisBranchState)}` : ''}
    </div>
    <div class="pd-date-block">
      <div><strong>Date:</strong> ${esc(letterDate)}</div>
      <div><strong>Application / Licence No.:</strong> ${esc(applicationNoDisplay(data.applicationNumber))}</div>
      <div><strong>CM/L No.:</strong> ${esc(cmL)}</div>
    </div>
  </div>

  <p class="pd-body">
    <strong>Sub:</strong> ${esc(config.subject)}
    ${isStdRef ? ` for Indian Standard ${isStdRef}` : ''}.
  </p>

  <p class="pd-body">
    We, <strong>M/s. ${esc(data.applicantName)}</strong>,
    ${data.applicantAddress ? ` having our factory / registered office at <strong>${esc(data.applicantAddress)}</strong>,` : ''}
    hereby enclose / place on record the <strong>${esc(config.title)}</strong> pertaining to our BIS certification
    ${isStdRef ? ` under ${isStdRef}` : ''}
    for the licence bearing CM/L No. <strong>${esc(cmL)}</strong>
    (Validity: <strong>${esc(validity)}</strong>).
  </p>

  <div class="ld-box">
    <div class="ld-box-label">${esc(config.packLabel)}</div>
    <ol class="ld-list">
      ${itemsHtml}
    </ol>
  </div>

  <p class="pd-body">
    We declare that the information and documents furnished are true and correct to the best of our
    knowledge and belief. We undertake to intimate BIS of any change relating to the above licence.
  </p>

  <div class="cmpf-sign-right">${signatoryHtml({
    firmName: data.applicantName,
    name: sigName,
    designation: data.signatoryDesignation,
  })}</div>
  ${preparedByHtml(data.preparedBy)}
</div>`
}

const STYLES = `
  .ld-box { margin: 10px 0 14px; padding: 8px 10px; border: 1px solid #cbd5e1; background: #f8fafc; }
  .ld-box-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #64748b; margin-bottom: 6px; }
  .ld-list { margin: 0; padding-left: 18px; font-size: 11px; line-height: 1.55; }
  .ld-list li { margin: 2px 0; }
  .cmpf-sign-right { margin-top: 14px; text-align: right; }
  .cmpf-sign-right .pd-signatory { text-align: left; }
`

export function buildFirmPackDocumentsHtml(
  data: LegalDocumentsData,
  packKey: keyof typeof FIRM_PACK_CONFIGS = 'legal',
): string {
  const config = FIRM_PACK_CONFIGS[packKey] ?? FIRM_PACK_CONFIGS.legal
  return buildPrintPage({
    title: `${config.title} — ${data.applicantName || 'Applicant'}`,
    styles: STYLES,
    body: buildBody(data, config),
  })
}

export function buildLegalDocumentsHtml(data: LegalDocumentsData): string {
  return buildFirmPackDocumentsHtml(data, 'legal')
}

export function buildApplicationDetailsHtml(data: LegalDocumentsData): string {
  return buildFirmPackDocumentsHtml(data, 'application')
}

/** @deprecated Merged into Application Details. */
export function buildLicenseDetailsHtml(data: LegalDocumentsData): string {
  return buildApplicationDetailsHtml(data)
}

/** @deprecated Merged into Application Details. */
export function buildBranchDetailsHtml(data: LegalDocumentsData): string {
  return buildApplicationDetailsHtml(data)
}

export function legalDocumentsDataFromPrintData(data: BisPrintData): LegalDocumentsData {
  const ctx = applicantContextFromPrintData(data)
  const sig = printSignatoryDefaults(data)
  return {
    ...ctx,
    cmLNumber: data.row.cm_l_digits ? formatCmL(data.row.cm_l_digits) : '',
    licenseValidity: formatDisplayDate(data.row.license_validity_date),
    signatoryName: sig.signatoryName,
    signatoryDesignation: sig.signatoryDesignation,
  }
}
