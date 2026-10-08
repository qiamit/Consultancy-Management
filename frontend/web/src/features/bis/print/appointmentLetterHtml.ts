import type { BisPrintData } from './loadBisPrintData'
import { printSignatoryDefaults } from './loadBisPrintData'
import { escapeHtml as esc } from './openPrintHtml'
import {
  applicantContextFromPrintData,
  buildPrintPage,
  dateOrNa,
  letterheadHtml,
  preparedByHtml,
  signatoryHtml,
  type PrintApplicantContext,
} from './printDocumentShared'

export type AppointmentLetterData = PrintApplicantContext & {
  personName: string
  designation: string
  educationalQualification: string
  experienceYears: string
  appointmentDate: string
  referenceNo: string
  signatoryName: string
  signatoryDesignation: string
}

function formatAppointmentDate(raw: string): string {
  const v = raw.trim()
  if (!v) return '_______________________'
  return dateOrNa(v)
}

function qualificationPhrase(data: AppointmentLetterData): string {
  const qual = data.educationalQualification.trim()
  const exp = data.experienceYears.trim()
  if (qual && exp) {
    return `who holds <strong>${esc(qual)}</strong> and possesses approximately <strong>${esc(exp)}</strong> year${exp === '1' ? '' : 's'} of relevant experience`
  }
  if (qual) return `who holds <strong>${esc(qual)}</strong>`
  if (exp) {
    return `who possesses approximately <strong>${esc(exp)}</strong> year${exp === '1' ? '' : 's'} of relevant experience`
  }
  return 'who is suitably qualified and experienced'
}

function buildBody(data: AppointmentLetterData): string {
  const personName = esc(data.personName.trim() || '_______________________')
  const designation = esc(data.designation.trim() || 'Technical Staff')
  const factoryLine = data.applicantAddress.trim()
    ? `, having its registered office / manufacturing unit at <strong>${esc(data.applicantAddress.trim())}</strong>`
    : ''
  const salutation = data.personName.trim()
    ? `Dear ${esc(data.personName.trim())},`
    : 'Dear Sir/Madam,'
  const sigName = data.signatoryName.trim() || data.contactPerson.trim()

  return `
<div class="pd-sheet">
  ${letterheadHtml(data)}
  <h1 class="al-title">Appointment Letter</h1>
  ${data.referenceNo.trim() ? `<div class="al-ref">Ref. No.: ${esc(data.referenceNo.trim())}</div>` : ''}

  <p class="al-to">
    To,<br/>
    <strong>${personName}</strong><br/>
    ${designation}
  </p>

  <p class="pd-body"><strong>Subject:</strong> Appointment as ${designation}</p>
  <p class="pd-body">${salutation}</p>

  <p class="pd-body">
    We are pleased to inform you that <strong>M/s. ${esc(data.applicantName)}</strong>${factoryLine},
    has appointed you to the position of <strong>${designation}</strong>, with effect from
    <strong>${esc(formatAppointmentDate(data.appointmentDate))}</strong>.
  </p>

  <p class="pd-body">
    You ${qualificationPhrase(data)}. Based on your credentials, the Management is confident that you will
    discharge your responsibilities with competence and integrity.
  </p>

  <p class="pd-body"><strong>Your duties and responsibilities shall include, inter alia:</strong></p>
  <ul class="al-duties">
    <li>Ensuring adherence to applicable quality standards, process controls, and internal procedures of the unit;</li>
    <li>Maintaining technical records, documentation, and correspondence in proper order;</li>
    <li>Assisting the Management in matters relating to certification, inspection, and liaison with concerned authorities; and</li>
    <li>Performing such other duties as may be assigned to you from time to time by the Management.</li>
  </ul>

  <p class="pd-body">
    You shall report to the Management and conduct yourself in accordance with the rules, policies,
    and instructions of the Company. You are expected to devote your full attention to the duties
    entrusted to you and to act in the best interests of the organisation at all times.
  </p>

  <p class="pd-body">
    Your remuneration, leave, and other terms and conditions of service shall be as mutually agreed
    and communicated to you separately, unless otherwise specified in writing by the Company.
  </p>

  <p class="pd-body">
    This appointment shall continue unless terminated or modified by the Management through written
    intimation. Either party may terminate this arrangement in accordance with the applicable policy
    or applicable law, as the case may be.
  </p>

  <p class="pd-body">
    We welcome you to our organisation and look forward to a long and mutually rewarding association.
  </p>

  <p class="pd-body">Thanking you,</p>
  <p class="pd-body">Yours faithfully,</p>

  <div class="cmpf-sign-right">${signatoryHtml({ firmName: data.applicantName, name: sigName, designation: data.signatoryDesignation })}</div>
  ${preparedByHtml(data.preparedBy)}
</div>`
}

const STYLES = `
  .al-title { text-align: center; font-size: 17px; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; margin: 0 0 10px; text-decoration: none; }
  .al-ref { text-align: center; font-size: 11px; color: #57534e; margin: -4px 0 14px; }
  .al-to { margin: 0 0 14px; line-height: 1.65; }
  .al-duties { margin: 0 0 12px; padding-left: 22px; line-height: 1.7; }
  .al-duties li { margin-bottom: 4px; }
  .cmpf-sign-right { margin-top: 14px; text-align: right; }
  .cmpf-sign-right .pd-signatory { text-align: left; }
`

export function buildAppointmentLetterHtml(data: AppointmentLetterData): string {
  return buildPrintPage({
    title: `Appointment Letter — ${data.personName || data.applicantName || 'Staff'}`,
    styles: STYLES,
    body: buildBody(data),
  })
}

/** Maps a BIS project row + client + consultancy context into Appointment Letter fields. */
export function appointmentLetterDataFromPrintData(printData: BisPrintData): AppointmentLetterData {
  const ctx = applicantContextFromPrintData(printData)
  return {
    ...ctx,
    personName: '',
    designation: 'Technical Staff / Quality Control',
    educationalQualification: '',
    experienceYears: '',
    appointmentDate: '',
    referenceNo: '',
    signatoryName: printSignatoryDefaults(printData).signatoryName,
    signatoryDesignation: printSignatoryDefaults(printData).signatoryDesignation,
  }
}

/** Builds Appointment Letter fields for one Technical Staff person. */
export function appointmentLetterDataForTechnicalStaff(
  printData: BisPrintData,
  staff: {
    personName: string
    designation: string
    educationalQualification: string
    experienceYears: string
    appointmentDate: string
    appointmentReferenceNo: string
  },
): AppointmentLetterData {
  const base = appointmentLetterDataFromPrintData(printData)
  const sig = printData.documentSignatory
  return {
    ...base,
    personName: staff.personName.trim(),
    designation: staff.designation.trim() || base.designation,
    educationalQualification: staff.educationalQualification.trim(),
    experienceYears: staff.experienceYears.trim(),
    appointmentDate: staff.appointmentDate.trim(),
    referenceNo: staff.appointmentReferenceNo.trim(),
    signatoryName: sig?.name.trim() || base.signatoryName,
    signatoryDesignation: sig?.designation.trim() || base.signatoryDesignation,
  }
}
