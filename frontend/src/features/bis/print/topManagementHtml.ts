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

export type TopManagementRow = {
  personName: string
  designation: string
  email: string
  mobile: string
  /** Attached signature file meta (bis_project_files). */
  signatureFileId: string
  signatureFileName: string
  signatureStoragePath: string
  /** When true, this person's signature is applied on all BIS documents. */
  applySignatureToDocuments: boolean
}

export type TopManagementData = PrintApplicantContext & {
  rows: TopManagementRow[]
  signatoryName: string
  signatoryDesignation: string
  includeAuthorizedSignatory: boolean
  authorizedSignatoryName: string
  authorizedSignatoryDesignation: string
  authorizedSignatoryEmail: string
  authorizedSignatoryMobile: string
  authorizedBy: string
  authorizedSignatureFileId: string
  authorizedSignatureFileName: string
  authorizedSignatureStoragePath: string
  applyAuthorizedSignatureToDocuments: boolean
}

function rowHasPersonData(r: TopManagementRow): boolean {
  return Boolean(
    r.personName.trim() ||
      r.designation.trim() ||
      r.email.trim() ||
      r.mobile.trim(),
  )
}

/** TM rows + Authorized Person (merged / appended). */
function rowsForPrintTable(data: TopManagementData): TopManagementRow[] {
  const filled = data.rows.filter(rowHasPersonData)
  const authName = data.authorizedSignatoryName.trim()
  if (!authName) return filled

  const key = authName.toLowerCase()
  const existingIdx = filled.findIndex((r) => r.personName.trim().toLowerCase() === key)
  if (existingIdx >= 0) {
    const row = filled[existingIdx]
    const next = [...filled]
    next[existingIdx] = {
      ...row,
      designation: data.authorizedSignatoryDesignation.trim() || row.designation,
      email: data.authorizedSignatoryEmail.trim() || row.email,
      mobile: data.authorizedSignatoryMobile.trim() || row.mobile,
    }
    return next
  }

  const match = data.rows.find((r) => r.personName.trim().toLowerCase() === key)
  const contactMatch = data.contactPerson.trim().toLowerCase() === key

  return [
    ...filled,
    {
      personName: authName,
      designation:
        data.authorizedSignatoryDesignation.trim() ||
        match?.designation.trim() ||
        '',
      email: (
        data.authorizedSignatoryEmail ||
        match?.email ||
        (contactMatch ? data.applicantEmail : '')
      ).trim(),
      mobile: (
        data.authorizedSignatoryMobile ||
        match?.mobile ||
        (contactMatch ? data.applicantPhone : '')
      ).trim(),
      signatureFileId: '',
      signatureFileName: '',
      signatureStoragePath: '',
      applySignatureToDocuments: false,
    },
  ]
}

function tableHtml(rows: TopManagementRow[]): string {
  const filled = rows.filter(rowHasPersonData)
  const body =
    filled.length > 0
      ? filled
          .map(
            (r, i) => `<tr>
      <td>${String(i + 1).padStart(2, '0')}</td>
      <td class="pd-left">${esc(r.personName) || '&nbsp;'}</td>
      <td>${esc(r.designation) || '&nbsp;'}</td>
      <td>${esc(r.email) || '&nbsp;'}</td>
      <td>${esc(r.mobile) || '&nbsp;'}</td>
    </tr>`,
          )
          .join('')
      : `<tr><td colspan="5" class="pd-left">No top management details entered.</td></tr>`

  return `
<table class="pd-table tm-table">
  <thead>
    <tr>
      <th style="width:8%">Sr.</th>
      <th>Name</th>
      <th>Designation</th>
      <th>Email</th>
      <th>Mobile</th>
    </tr>
  </thead>
  <tbody>${body}</tbody>
</table>`
}

function buildBody(data: TopManagementData): string {
  const letterDate = inspectionDateOrToday(data.dateOfInspection)
  const isStdRef = isStandardRefHtml(data.isNumber, data.isTitle)
  const authName = data.authorizedSignatoryName.trim()
  const authDesig = data.authorizedSignatoryDesignation.trim()
  const sigName =
    authName || data.signatoryName.trim() || data.contactPerson.trim()
  const sigDesig = authDesig || data.signatoryDesignation.trim()

  return `
<div class="pd-sheet">
  ${letterheadHtml(data)}
  <h1 class="pd-title">Top Management Details</h1>

  <div class="pd-to-row">
    <div class="pd-to-block">${toBlockHtml(data.bisBranchName, data.bisBranchState)}</div>
    <div class="pd-date-block">
      <div><strong>Date of Inspection:</strong> ${esc(letterDate)}</div>
      <div><strong>Application No.:</strong> ${esc(applicationNoDisplay(data.applicationNumber))}</div>
    </div>
  </div>

  <p class="pd-body">
    <strong>Sub:</strong> Details of Top Management for BIS licence application
    ${isStdRef ? ` under Indian Standard ${isStdRef}` : ''}.
  </p>
  <p class="pd-body">
    We, <strong>M/s. ${esc(data.applicantName)}</strong>,
    ${data.applicantAddress ? ` having our factory at <strong>${esc(data.applicantAddress)}</strong>,` : ''}
    hereby furnish the following details of our Top Management
    ${isStdRef ? ` in connection with BIS certification under ${isStdRef}` : ' in connection with BIS certification'}.
    The particulars are as under:
  </p>

  <div class="tm-box">${tableHtml(rowsForPrintTable(data))}</div>

  <p class="pd-body">
    We declare that the information furnished above is true and correct to the best of our knowledge and belief.
    The persons listed above are responsible for the overall management and compliance of the unit with respect to
    BIS certification requirements.
  </p>

  <div class="cmpf-sign-right">${signatoryHtml({
    firmName: data.applicantName,
    name: sigName,
    designation: sigDesig,
  })}</div>
  ${preparedByHtml(data.preparedBy)}
</div>`
}

const STYLES = `
  .tm-box { margin: 10px 0 14px; padding: 8px 10px; border: 1px solid #cbd5e1; background: #f8fafc; }
  .tm-table td { height: 8mm; }
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

export function buildTopManagementHtml(data: TopManagementData): string {
  return buildPrintPage({
    title: `Top Management — ${data.applicantName || 'Applicant'}`,
    styles: STYLES,
    body: buildBody(data),
  })
}

/** Maps a BIS project row + client + consultancy context into Top Management fields. */
export function topManagementDataFromPrintData(printData: BisPrintData): TopManagementData {
  const ctx = applicantContextFromPrintData(printData)
  const contact = printData.client.contactPerson.trim()
  const payload = printData.modulePayload
  const savedRows = Array.isArray(payload?.rows) ? payload.rows : null
  if (savedRows && savedRows.length > 0) {
    const rows: TopManagementRow[] = savedRows.map((item) => {
      const r = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
      return {
        personName: String(r.personName ?? '').trim(),
        designation: String(r.designation ?? '').trim(),
        email: String(r.email ?? '').trim(),
        mobile: String(r.mobile ?? '').trim(),
        signatureFileId: String(r.signatureFileId ?? '').trim(),
        signatureFileName: String(r.signatureFileName ?? '').trim(),
        signatureStoragePath: String(r.signatureStoragePath ?? '').trim(),
        applySignatureToDocuments: Boolean(r.applySignatureToDocuments),
      }
    })
    const authorizedSignatoryName = String(payload?.authorizedSignatoryName ?? '').trim()
    const authorizedSignatoryDesignation = String(
      payload?.authorizedSignatoryDesignation ?? '',
    ).trim()
    const authorizedSignatoryEmail = String(
      payload?.authorizedSignatoryEmail ?? '',
    ).trim()
    const authorizedSignatoryMobile = String(
      payload?.authorizedSignatoryMobile ?? '',
    ).trim()
    const authorizedBy = String(payload?.authorizedBy ?? '').trim()
    const authorizedSignatureStoragePath = String(
      payload?.authorizedSignatureStoragePath ?? '',
    ).trim()
    const applyAuthorizedSignatureToDocuments = Boolean(
      payload?.applyAuthorizedSignatureToDocuments,
    )
    return {
      ...ctx,
      rows,
      signatoryName: String(payload?.signatoryName ?? '').trim() || contact,
      signatoryDesignation: String(payload?.signatoryDesignation ?? '').trim(),
      includeAuthorizedSignatory:
        Boolean(payload?.includeAuthorizedSignatory) ||
        Boolean(authorizedSignatoryName) ||
        Boolean(authorizedSignatoryDesignation) ||
        Boolean(authorizedSignatoryEmail) ||
        Boolean(authorizedSignatoryMobile) ||
        Boolean(authorizedBy) ||
        Boolean(authorizedSignatureStoragePath) ||
        applyAuthorizedSignatureToDocuments,
      authorizedSignatoryName,
      authorizedSignatoryDesignation,
      authorizedSignatoryEmail,
      authorizedSignatoryMobile,
      authorizedBy,
      authorizedSignatureFileId: String(
        payload?.authorizedSignatureFileId ?? '',
      ).trim(),
      authorizedSignatureFileName: String(
        payload?.authorizedSignatureFileName ?? '',
      ).trim(),
      authorizedSignatureStoragePath,
      applyAuthorizedSignatureToDocuments,
    }
  }
  const sig = printSignatoryDefaults(printData)
  return {
    ...ctx,
    rows: contact
      ? [
          {
            personName: contact,
            designation: '',
            email: printData.client.email,
            mobile: printData.client.mobile,
            signatureFileId: '',
            signatureFileName: '',
            signatureStoragePath: '',
            applySignatureToDocuments: false,
          },
        ]
      : [],
    signatoryName: sig.signatoryName,
    signatoryDesignation: sig.signatoryDesignation,
    includeAuthorizedSignatory: false,
    authorizedSignatoryName: '',
    authorizedSignatoryDesignation: '',
    authorizedSignatoryEmail: '',
    authorizedSignatoryMobile: '',
    authorizedBy: '',
    authorizedSignatureFileId: '',
    authorizedSignatureFileName: '',
    authorizedSignatureStoragePath: '',
    applyAuthorizedSignatureToDocuments: false,
  }
}
