import { formatIsCodeLabel } from '@/features/masters/is-codes/formatIsCodeLabel'
import { EMPTY_CLIENT_IS_LICENSE, type ClientIsLicenseValue } from '../shared/ClientIsLicenseFields'
import type { OslSampleRequirementRow } from '../projects/oslSampleRequirementsModel'

export const STOP_MARKING_STATUS_OPTIONS = [
  { value: 'open', label: 'Report Awaited' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'replied', label: 'Reply Sent' },
  { value: 'closed', label: 'Closed' },
] as const

/** Fixed reasons BIS gives for stopping marking, picked when a licence is added. */
export const STOP_MARKING_REASON_OPTIONS = [
  'Sample Failure',
  'Multiple Sample Failure',
  'Non-submission of Reply',
  'Non-submission of Production Returns on Time',
  'Non-payment of Marking Fee',
  'Non-compliance of Scheme of Testing & Inspection',
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
export type StopMarkingAddForm = ClientIsLicenseValue & { stopDate: string; reasonType: string; letterFile: File | null }

/** Everything editable on an open case. */
export type StopMarkingCaseForm = {
  stopDate: string
  reasonType: string
  bisReference: string
  bisReason: string
  bisDeadline: string
  reviewNotes: string
  replyDraft: string
  replyDate: string
  status: string
  notes: string
}

/** Which cases the list shows: still open, everything, or only closed ones. */
export type StopMarkingStatusFilter = 'active' | 'all' | 'closed'

export const todayIso = () => new Date().toISOString().slice(0, 10)

export function emptyStopMarkingAddForm(): StopMarkingAddForm {
  return { ...EMPTY_CLIENT_IS_LICENSE, stopDate: todayIso(), reasonType: '', letterFile: null }
}

export function stopMarkingClientName(row: Pick<StopMarkingRow, 'client'>): string {
  return (row.client?.company_name ?? '').trim()
}

export function stopMarkingIsCodeLabel(row: Pick<StopMarkingRow, 'is_code'>): string {
  return row.is_code ? formatIsCodeLabel(row.is_code) : ''
}

export function rowToCaseForm(row: StopMarkingRow): StopMarkingCaseForm {
  return {
    stopDate: row.stop_date?.slice(0, 10) || todayIso(),
    reasonType: row.reason_type ?? '',
    bisReference: row.bis_reference ?? '',
    bisReason: row.bis_reason ?? '',
    bisDeadline: row.bis_deadline?.slice(0, 10) ?? '',
    reviewNotes: row.review_notes ?? '',
    replyDraft: row.reply_draft ?? '',
    replyDate: row.reply_date?.slice(0, 10) ?? '',
    status: row.status || 'open',
    notes: row.notes ?? '',
  }
}
