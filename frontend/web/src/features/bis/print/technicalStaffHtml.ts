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

export type TechnicalStaffRow = {
  personName: string
  designation: string
  educationalQualification: string
  experienceYears: string
  appointmentDate: string
  appointmentReferenceNo: string
  appointmentLetterFileId: string
  appointmentLetterFileName: string
  appointmentLetterStoragePath: string
  educationCertificateFileId: string
  educationCertificateFileName: string
  educationCertificateStoragePath: string
  photoFileId: string
  photoFileName: string
  photoStoragePath: string
  signatureFileId: string
  signatureFileName: string
  signatureStoragePath: string
  /** When true, this person's signature is applied on all BIS documents. */
  applySignatureToDocuments: boolean
}

export type TechnicalStaffData = PrintApplicantContext & {
  rows: TechnicalStaffRow[]
  signatoryName: string
  signatoryDesignation: string
}

function tableHtml(rows: TechnicalStaffRow[]): string {
  const filled = rows.filter(
    (r) =>
      String(r.personName ?? '').trim() ||
      String(r.designation ?? '').trim() ||
      String(r.educationalQualification ?? '').trim() ||
      String(r.experienceYears ?? '').trim(),
  )
  // Only submitted staff rows — no blank padding rows.
  const body = filled
    .map(
      (r, i) => `<tr>
      <td>${String(i + 1).padStart(2, '0')}</td>
      <td class="pd-left">${esc(r.personName) || '&nbsp;'}</td>
      <td>${esc(r.designation) || '&nbsp;'}</td>
      <td>${esc(r.educationalQualification) || '&nbsp;'}</td>
      <td>${esc(r.experienceYears) || '&nbsp;'}</td>
    </tr>`,
    )
    .join('')

  return `
<table class="pd-table ts-table">
  <thead>
    <tr>
      <th style="width:8%">Sr.</th>
      <th>Name</th>
      <th>Designation</th>
      <th>Qualification</th>
      <th>Experience (Years)</th>
    </tr>
  </thead>
  <tbody>${body}</tbody>
</table>`
}

function buildBody(data: TechnicalStaffData): string {
  const letterDate = inspectionDateOrToday(data.dateOfInspection)
  const isStdRef = isStandardRefHtml(data.isNumber, data.isTitle)
  const sigName = data.signatoryName.trim() || data.contactPerson.trim()

  return `
<div class="pd-sheet">
  ${letterheadHtml(data)}
  <h1 class="pd-title">Technical Staff Details</h1>

  <div class="pd-to-row">
    <div class="pd-to-block">${toBlockHtml(data.bisBranchName, data.bisBranchState)}</div>
    <div class="pd-date-block">
      <div><strong>Date of Inspection:</strong> ${esc(letterDate)}</div>
      <div><strong>Application No.:</strong> ${esc(applicationNoDisplay(data.applicationNumber))}</div>
    </div>
  </div>

  <p class="pd-body">
    <strong>Sub:</strong> Details of Technical Staff for BIS licence application
    ${isStdRef ? ` under Indian Standard ${isStdRef}` : ''}.
  </p>
  <p class="pd-body">
    We, <strong>M/s. ${esc(data.applicantName)}</strong>,
    ${data.applicantAddress ? ` having our factory at <strong>${esc(data.applicantAddress)}</strong>,` : ''}
    hereby furnish the following details of our Technical Staff
    ${isStdRef ? ` in connection with BIS certification under ${isStdRef}` : ' in connection with BIS certification'}.
    The particulars are as under:
  </p>

  <div class="ts-box">${tableHtml(data.rows)}</div>

  <p class="pd-body">
    We declare that the information furnished above is true and correct to the best of our knowledge and belief.
    The persons listed above are responsible for technical operations and compliance of the unit with respect to
    BIS certification requirements.
  </p>

  <div class="cmpf-sign-right">${signatoryHtml({ firmName: data.applicantName, name: sigName, designation: data.signatoryDesignation })}</div>
  ${preparedByHtml(data.preparedBy)}
</div>`
}

const STYLES = `
  .ts-box { margin: 10px 0 14px; padding: 8px 10px; border: 1px solid #cbd5e1; background: #f8fafc; }
  .ts-table td { height: 8mm; }
  .cmpf-sign-right {
    margin-top: 14px;
    width: 100%;
    display: flex;
    justify-content: flex-end;
    text-align: right;
  }
  .cmpf-sign-right .pd-signatory { text-align: right; margin-left: auto; }
  .cmpf-sign-right .pd-sign-space { justify-content: flex-end; }
  .cmpf-sign-right .pd-sign-line { margin-left: auto; }
`

export function buildTechnicalStaffHtml(data: TechnicalStaffData): string {
  return buildPrintPage({
    title: `Technical Staff — ${data.applicantName || 'Applicant'}`,
    styles: STYLES,
    body: buildBody(data),
  })
}

/** Staff rows that have at least one identity field filled (print / annex order). */
export function filledTechnicalStaffRows(rows: TechnicalStaffRow[]): TechnicalStaffRow[] {
  return rows.filter(
    (r) =>
      String(r.personName ?? '').trim() ||
      String(r.designation ?? '').trim() ||
      String(r.educationalQualification ?? '').trim() ||
      String(r.experienceYears ?? '').trim(),
  )
}

function isImageFileName(fileName: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(fileName.trim())
}

const ATTACH_STYLES = `
  .ts-attach-sheet .ts-attach-heading {
    margin: 0 0 4px;
    font-size: 13px;
    font-weight: 700;
    text-align: center;
    color: #1c1917;
  }
  .ts-attach-sheet .ts-attach-meta {
    margin: 0 0 8px;
    font-size: 11px;
    text-align: center;
    color: #57534e;
  }
  .ts-attach-sheet .ts-attach-img {
    display: block;
    max-width: 100%;
    max-height: 230mm;
    margin: 0 auto;
    object-fit: contain;
  }
  .ts-attach-sheet .ts-attach-frame {
    display: block;
    width: 100%;
    height: 230mm;
    border: 1px solid #cbd5e1;
    background: #fff;
  }
`

/** One annex page for an uploaded staff file (appointment / certificate / photo). */
export function buildTechnicalStaffAttachmentSheetHtml(opts: {
  title: string
  personName: string
  fileName: string
  viewUrl: string
}): string {
  const person = opts.personName.trim() || 'Technical Staff'
  const safeSrc = opts.viewUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  const content = isImageFileName(opts.fileName)
    ? `<img class="ts-attach-img" src="${safeSrc}" alt="${esc(opts.title)}" />`
    : `<iframe class="ts-attach-frame" src="${safeSrc}" title="${esc(opts.title)}"></iframe>`

  return buildPrintPage({
    title: opts.title,
    styles: ATTACH_STYLES,
    body: `
<div class="pd-sheet ts-attach-sheet">
  <p class="ts-attach-heading">${esc(opts.title)}</p>
  <p class="ts-attach-meta">${esc(person)}${opts.fileName.trim() ? ` · ${esc(opts.fileName.trim())}` : ''}</p>
  ${content}
</div>`,
  })
}

/** Maps a BIS project row + client + consultancy context into Technical Staff fields. */
export function technicalStaffDataFromPrintData(printData: BisPrintData): TechnicalStaffData {
  const ctx = applicantContextFromPrintData(printData)
  const contact = printData.client.contactPerson.trim()
  const payload = printData.modulePayload
  const savedRows = Array.isArray(payload?.rows) ? payload.rows : null
  if (savedRows && savedRows.length > 0) {
    const rows: TechnicalStaffRow[] = savedRows.map((item) => {
      const r = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
      return {
        personName: String(r.personName ?? '').trim(),
        designation: String(r.designation ?? '').trim(),
        educationalQualification: String(r.educationalQualification ?? '').trim(),
        experienceYears: String(r.experienceYears ?? '').trim(),
        appointmentDate: String(r.appointmentDate ?? '').trim(),
        appointmentReferenceNo: String(r.appointmentReferenceNo ?? '').trim(),
        appointmentLetterFileId: String(r.appointmentLetterFileId ?? '').trim(),
        appointmentLetterFileName: String(r.appointmentLetterFileName ?? '').trim(),
        appointmentLetterStoragePath: String(r.appointmentLetterStoragePath ?? '').trim(),
        educationCertificateFileId: String(r.educationCertificateFileId ?? '').trim(),
        educationCertificateFileName: String(r.educationCertificateFileName ?? '').trim(),
        educationCertificateStoragePath: String(
          r.educationCertificateStoragePath ?? '',
        ).trim(),
        photoFileId: String(r.photoFileId ?? '').trim(),
        photoFileName: String(r.photoFileName ?? '').trim(),
        photoStoragePath: String(r.photoStoragePath ?? '').trim(),
        signatureFileId: String(r.signatureFileId ?? '').trim(),
        signatureFileName: String(r.signatureFileName ?? '').trim(),
        signatureStoragePath: String(r.signatureStoragePath ?? '').trim(),
        applySignatureToDocuments: Boolean(r.applySignatureToDocuments),
      }
    })
    return {
      ...ctx,
      rows,
      signatoryName: String(payload?.signatoryName ?? '').trim() || contact,
      signatoryDesignation: String(payload?.signatoryDesignation ?? '').trim(),
    }
  }
  return {
    ...ctx,
    rows: [],
    signatoryName: printSignatoryDefaults(printData).signatoryName,
    signatoryDesignation: printSignatoryDefaults(printData).signatoryDesignation,
  }
}
