import { formatIsCodeLabel } from '@/features/masters/is-codes/formatIsCodeLabel'
import { EMPTY_CLIENT_IS_LICENSE, type ClientIsLicenseValue } from '../shared/ClientIsLicenseFields'
import type { OslSampleRequirementRow } from '../projects/oslSampleRequirementsModel'

export const STOP_MARKING_STATUS_OPTIONS = [
  { value: 'open', label: 'Report Awaited' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'replied', label: 'Reply Sent' },
  { value: 'closed', label: 'Closed' },
] as const

/**
 * What BIS has issued to the licensee. Only the notices that prohibit use of the Standard Mark
 * (`holdsMarking`) put the licence into Stop Marking status while the case is open.
 */
export const NOTICE_TYPE_OPTIONS = [
  { value: 'sample_failure', label: 'Sample Failure Notice', holdsMarking: false },
  { value: 'consecutive_nc', label: 'Consecutive Non-Conformity Notice', holdsMarking: false },
  { value: 'show_cause', label: 'Show Cause Notice', holdsMarking: false },
  { value: 'product_recall', label: 'Product Recall Notice', holdsMarking: false },
  { value: 'stop_marking', label: 'Stop Marking Notice', holdsMarking: true },
  { value: 'suspension', label: 'Suspension Notice', holdsMarking: true },
  { value: 'cancellation', label: 'Cancellation Notice', holdsMarking: false },
  { value: 'warning', label: 'Warning Letter', holdsMarking: false },
  { value: 'other', label: 'Other Notice', holdsMarking: false },
] as const

export function noticeTypeLabel(value: string | null | undefined): string {
  return NOTICE_TYPE_OPTIONS.find((o) => o.value === (value ?? '').trim())?.label ?? '—'
}

export const noticeHoldsMarking = (value: string | null | undefined) => NOTICE_TYPE_OPTIONS.some((o) => o.value === (value ?? '').trim() && o.holdsMarking)

/** Notices that concern a tested sample, so the sample code and QR code are asked. */
export const noticeHasSample = (value: string | null | undefined) => ['sample_failure', 'consecutive_nc', 'product_recall'].includes((value ?? '').trim())

/** The non-conformity BIS gives as the ground, from BIS (Conformity Assessment) Regulations 2018 and its non-conformity guidelines. */
export const STOP_MARKING_REASON_OPTIONS = [
  'Sample Failure — PI Sample',
  'Sample Failure — Market Sample',
  'Sample Failure — Surveillance Sample',
  'Sample Failure — Verification Sample',
  'Sample Failure — Factory Testing',
  'Consecutive Sample Failure',
  'Labelling / Marking Deviation',
  'Misuse of Standard Mark',
  'Non-submission of Reply',
  'Non-submission of Production Returns on Time',
  'Non-payment of Marking Fee',
  'Non-compliance of Scheme of Testing & Inspection',
  'Testing Equipment Not Calibrated / Out of Order',
  'Complaint Against Product Quality',
  'Incorrect Records / False Declaration',
  'Change in Premises / Ownership Without Approval',
  'Breach of Licence Conditions',
  'Licence Under Suspension for More Than a Year',
  'Other',
] as const

export function stopMarkingStatusLabel(value: string | null | undefined): string {
  const v = (value ?? '').trim()
  return STOP_MARKING_STATUS_OPTIONS.find((o) => o.value === v)?.label ?? (v || '—')
}

export const STOP_MARKING_STATUS_STYLES: Record<string, string> = {
  open: 'bg-red-50 text-red-800 ring-red-200',
  reviewed: 'bg-amber-50 text-amber-900 ring-amber-200',
  replied: 'bg-sky-50 text-sky-800 ring-sky-200',
  closed: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
}

/** A supporting document uploaded for the submission (corrective action evidence, test reports, calibration …). */
export type StopMarkingDocument = { id: string; label: string; name: string; path: string }

/** One parameter line of the test report: ticked rows go into the reply. */
export type StopMarkingFinding = { id: string; selected: boolean; parameter: string; specified: string; observed: string; remark: string }

/** The ticked findings (all when none is ticked) as plain lines, for the reply draft. */
export function findingsToText(rows: StopMarkingFinding[]): string {
  const picked = rows.some((r) => r.selected) ? rows.filter((r) => r.selected) : rows
  return picked.map((r, i) => `${i + 1}. ${r.parameter} — Specified: ${r.specified || '—'}; Observed: ${r.observed || '—'}; ${r.remark || '—'}`).join('\n')
}

/** Details read from the test report (step 2). Sample code and QR code live in their own columns. */
export type StopMarkingReportDetails = { reportNumber: string; batchNumber: string; manufactureDate: string; description: string; declaredValue: string }
export const EMPTY_REPORT_DETAILS: StopMarkingReportDetails = { reportNumber: '', batchNumber: '', manufactureDate: '', description: '', declaredValue: '' }

/** The case's own Test Report - Details (step 3): Sample Offer Letter samples and Factory Test Reports, separate from the application / licence. */
export type StopMarkingTestReportModule = {
  applicable?: { sample?: 'Yes' | 'No'; ftr?: 'Yes' | 'No' }
  osl?: Record<string, unknown>
  ftr?: Record<string, unknown>
}

/** The reply letter to BIS, section by section (step 4). */
export type StopMarkingReplySections = {
  ourRef: string
  otherRefs: string
  subject: string
  general: string
  rootCause: string
  corrective: string
  preventive: string
  effectiveness: string
  newSamples: string
  stock: string
  payments: string
  request: string
  signatoryName: string
  signatoryDesignation: string
}
export const EMPTY_REPLY_SECTIONS: StopMarkingReplySections = {
  ourRef: '', otherRefs: '', subject: '', general: '', rootCause: '', corrective: '', preventive: '', effectiveness: '',
  newSamples: '', stock: '', payments: '', request: '', signatoryName: '', signatoryDesignation: '',
}
/** The headed sections of the letter body, in letter order. */
export const REPLY_BODY_SECTIONS: Array<{ key: keyof StopMarkingReplySections; title: string }> = [
  { key: 'subject', title: 'Subject' },
  { key: 'general', title: 'General Paragraph' },
  { key: 'rootCause', title: 'Root Cause of the Failure' },
  { key: 'corrective', title: 'Corrective Action' },
  { key: 'preventive', title: 'Preventive Action' },
  { key: 'effectiveness', title: 'Effectiveness of the Action' },
  { key: 'newSamples', title: 'Details of the New Samples' },
  { key: 'stock', title: 'Stock and Marking Details' },
  { key: 'payments', title: 'Payment Details' },
  { key: 'request', title: 'Request to BIS' },
]
/** The letter as plain text (kept in reply_draft for the "reply ready" check and as a fallback). */
export function replySectionsToText(s: StopMarkingReplySections): string {
  return REPLY_BODY_SECTIONS.map(({ key, title }) => (s[key].trim() ? (key === 'subject' ? `Subject: ${s[key].trim()}` : `${title}:\n${s[key].trim()}`) : ''))
    .filter(Boolean)
    .join('\n\n')
}

export type StopMarkingRow = {
  id: string
  client_id: string
  is_code_id: string
  bis_project_id: string | null
  cm_l_digits: string | null
  project_kind: string | null
  stop_date: string
  previous_project_status: string
  report_path: string | null
  report_name: string | null
  test_report_path: string | null
  test_report_name: string | null
  test_reports: StopMarkingDocument[] | null
  report_review: string
  report_findings: StopMarkingFinding[] | null
  report_details: Partial<StopMarkingReportDetails> | null
  report_observations: string
  reply_sections: Partial<StopMarkingReplySections> | null
  test_report_module: StopMarkingTestReportModule | null
  documents: StopMarkingDocument[] | null
  case_type: string
  sample_code: string
  sample_qr_code: string
  reason_type: string
  bis_reference: string
  bis_reason: string
  bis_deadline: string | null
  review_notes: string
  reply_draft: string
  reply_date: string | null
  ftr_samples: OslSampleRequirementRow[] | null
  status: string
  notes: string
  closed_at: string | null
  created_at?: string | null
  client: { company_name: string | null } | null
  is_code: {
    is_number: string | null
    title: string | null
    revision_year: string | null
    part_no?: string | null
    section_no?: string | null
    standard_prefix?: string | null
  } | null
}

/** Add dialog: the licence (client + IS code + CM/L) and the date BIS stopped marking. */
export type StopMarkingAddForm = ClientIsLicenseValue & { noticeType: string; stopDate: string; reasonType: string; sampleCode: string; sampleQrCode: string; letterFile: File | null }

/** Everything editable on an open case. */
export type StopMarkingCaseForm = {
  noticeType: string
  stopDate: string
  reasonType: string
  sampleCode: string
  sampleQrCode: string
  bisReference: string
  bisReason: string
  bisDeadline: string
  reviewNotes: string
  reportFindings: StopMarkingFinding[]
  replySections: StopMarkingReplySections
  reportObservations: string
  reportDetails: StopMarkingReportDetails
  replyDraft: string
  replyDate: string
  status: string
  notes: string
}

/** Which cases the list shows: still open, everything, or only closed ones. */
export type StopMarkingStatusFilter = 'active' | 'all' | 'closed'
export type StopMarkingNoticeFilter = 'all' | (typeof NOTICE_TYPE_OPTIONS)[number]['value']

export const todayIso = () => new Date().toISOString().slice(0, 10)

export function emptyStopMarkingAddForm(): StopMarkingAddForm {
  return { ...EMPTY_CLIENT_IS_LICENSE, noticeType: 'stop_marking', stopDate: todayIso(), reasonType: '', sampleCode: '', sampleQrCode: '', letterFile: null }
}

export function stopMarkingClientName(row: Pick<StopMarkingRow, 'client'>): string {
  return (row.client?.company_name ?? '').trim()
}

export function stopMarkingIsCodeLabel(row: Pick<StopMarkingRow, 'is_code'>): string {
  return row.is_code ? formatIsCodeLabel(row.is_code) : ''
}

export function rowToCaseForm(row: StopMarkingRow): StopMarkingCaseForm {
  return {
    noticeType: row.case_type || 'stop_marking',
    stopDate: row.stop_date?.slice(0, 10) || todayIso(),
    reasonType: row.reason_type ?? '',
    sampleCode: row.sample_code ?? '',
    sampleQrCode: row.sample_qr_code ?? '',
    bisReference: row.bis_reference ?? '',
    bisReason: row.bis_reason ?? '',
    bisDeadline: row.bis_deadline?.slice(0, 10) ?? '',
    reviewNotes: row.review_notes ?? '',
    reportFindings: row.report_findings ?? [],
    replySections: { ...EMPTY_REPLY_SECTIONS, ...(row.reply_sections ?? {}) },
    reportObservations: row.report_observations ?? '',
    reportDetails: { ...EMPTY_REPORT_DETAILS, ...(row.report_details ?? {}) },
    replyDraft: row.reply_draft ?? '',
    replyDate: row.reply_date?.slice(0, 10) ?? '',
    status: row.status || 'open',
    notes: row.notes ?? '',
  }
}
