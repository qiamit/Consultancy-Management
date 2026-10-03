import { formatIsCodeLabelFromParts } from '@/features/masters/is-codes/formatIsCodeLabel'
import {
  EMPTY_CLIENT_IS_LICENSE,
  type ClientIsLicenseValue,
} from '../shared/ClientIsLicenseFields'

export const SAMPLE_FAILURE_TYPE_OPTIONS = [
  { value: 'pi_sample', label: 'PI Sample' },
  { value: 'market_sample', label: 'Market Sample' },
  { value: 'surveillance_sample', label: 'Surveillance Sample' },
  { value: 'verification_sample', label: 'Verification Sample' },
] as const

export const SAMPLE_FAILURE_STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'drafted', label: 'Drafted' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'closed', label: 'Closed' },
] as const

export function sampleFailureTypeLabel(value: string | null | undefined): string {
  const v = (value ?? '').trim()
  if (!v) return '—'
  return SAMPLE_FAILURE_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v
}

export function sampleFailureStatusLabel(value: string | null | undefined): string {
  const v = (value ?? '').trim()
  if (!v) return '—'
  return SAMPLE_FAILURE_STATUS_OPTIONS.find((o) => o.value === v)?.label ?? v
}

export const SAMPLE_FAILURE_STATUS_STYLES: Record<string, string> = {
  open: 'bg-amber-50 text-amber-900 ring-amber-200',
  drafted: 'bg-sky-50 text-sky-800 ring-sky-200',
  submitted: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  closed: 'bg-stone-100 text-stone-700 ring-stone-300',
}

export type SampleFailureReplyRow = {
  id: string
  client_id: string
  is_code_id: string
  bis_project_id: string | null
  cm_l_digits: string | null
  project_kind: string | null
  sample_failure_type: string
  sample_code: string | null
  sample_qr_code: string | null
  failure_letter_path: string | null
  failure_letter_name: string | null
  offer_letter_path: string | null
  offer_letter_name: string | null
  factory_test_report_path: string | null
  factory_test_report_name: string | null
  reply_draft: string | null
  status: string
  notes: string | null
  created_by: string | null
  created_at?: string | null
  updated_at?: string | null
  client: { company_name: string | null } | null
  is_code: { is_number: string | null; title: string | null; revision_year: string | null } | null
  bis_project: { title: string | null; license_number: string | null } | null
}

export type SampleFailureReplyForm = ClientIsLicenseValue & {
  sampleFailureType: string
  sampleCode: string
  sampleQrCode: string
  status: string
  notes: string
  replyDraft: string
}

export function emptySampleFailureReplyForm(): SampleFailureReplyForm {
  return {
    ...EMPTY_CLIENT_IS_LICENSE,
    sampleFailureType: 'market_sample',
    sampleCode: '',
    sampleQrCode: '',
    status: 'open',
    notes: '',
    replyDraft: '',
  }
}

export function sampleFailureClientName(row: Pick<SampleFailureReplyRow, 'client'>): string {
  return (row.client?.company_name ?? '').trim()
}

export function sampleFailureIsCodeLabel(row: Pick<SampleFailureReplyRow, 'is_code'>): string {
  const code = row.is_code
  if (!code) return ''
  return formatIsCodeLabelFromParts(code.is_number, code.revision_year)
}

export function rowToSampleFailureReplyForm(row: SampleFailureReplyRow): SampleFailureReplyForm {
  return {
    clientId: row.client_id,
    clientLabel: sampleFailureClientName(row),
    isCodeId: row.is_code_id,
    isCodeLabel: sampleFailureIsCodeLabel(row),
    bisProjectId: row.bis_project_id ?? '',
    cmLDigits: String(row.cm_l_digits ?? '').replace(/\D/g, '').slice(0, 10),
    projectKind: row.project_kind ?? '',
    sampleFailureType: row.sample_failure_type || 'market_sample',
    sampleCode: row.sample_code ?? '',
    sampleQrCode: row.sample_qr_code ?? '',
    status: row.status || 'open',
    notes: row.notes ?? '',
    replyDraft: row.reply_draft ?? '',
  }
}

export type SampleFailureAttachment = { label: string; name: string | null; path: string | null }

export function sampleFailureAttachments(row: SampleFailureReplyRow): SampleFailureAttachment[] {
  return [
    { label: 'Failure Letter', name: row.failure_letter_name, path: row.failure_letter_path },
    { label: 'Offer Letter', name: row.offer_letter_name, path: row.offer_letter_path },
    {
      label: 'Factory Test Report',
      name: row.factory_test_report_name,
      path: row.factory_test_report_path,
    },
  ]
}
