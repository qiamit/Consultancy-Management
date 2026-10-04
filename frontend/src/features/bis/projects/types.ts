import { formatIsCodeLabelFromParts } from '@/features/masters/is-codes/formatIsCodeLabel'

export type BisProjectsListMode =
  | 'all'
  | 'our'
  | 'expired'
  | 'due_soon'
  | 'stop_marking'
  | 'applications'
  | 'inclusion'

export const BIS_PROJECTS_LIST_TITLES: Record<BisProjectsListMode, string> = {
  all: 'All BIS Licenses',
  our: 'QE BIS Licenses',
  expired: 'Expired Licenses',
  due_soon: 'Licenses Due Soon',
  stop_marking: 'License in Stop Marking',
  applications: 'BIS New Application',
  inclusion: 'BIS New Inclusion',
}

export const BIS_PROJECT_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'lead', label: 'Lead' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'completed', label: 'Completed' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'stop_marking', label: 'Stop Marking' },
]

export const BIS_PROJECT_KIND_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'Licence', label: 'Licence' },
  { value: 'Application', label: 'Application' },
  { value: 'application', label: 'Application (legacy)' },
  { value: 'Inclusion', label: 'Inclusion' },
]

export const BIS_BILLING_FREQUENCIES = [
  'Monthly',
  'Quarterly',
  'Half Yearly',
  'Yearly',
  'Based on Work',
] as const

export const DEFAULT_CASE_HANDLED_BY = 'Amit Kumar'
export const DEFAULT_CASE_REFERRED_BY = 'QE'
export const DEFAULT_BILLING_FREQUENCY = 'Yearly'
export const DEFAULT_PROJECT_KIND = 'Licence'

export type BisProjectClientJoin = {
  company_name: string | null
}

export type BisProjectIsCodeJoin = {
  is_number: string | null
  title: string | null
  revision_year: string | null
}

export type BisProjectRow = {
  id: string
  client_id: string | null
  project_kind: string | null
  title: string | null
  status: string | null
  license_number: string | null
  start_date: string | null
  target_date: string | null
  notes: string | null
  is_code_id: string | null
  cm_l_digits: string | null
  license_validity_date: string | null
  case_handled_by: string | null
  case_referred_by: string | null
  billing_amount: number | string | null
  billing_frequency: string | null
  portal_user_id: string | null
  portal_password: string | null
  application_stage: string | null
  is_qe_managed: boolean | null
  created_at?: string | null
  updated_at?: string | null
  client: BisProjectClientJoin | null
  is_code: BisProjectIsCodeJoin | null
}

export type BisProjectForm = {
  projectKind: string
  title: string
  clientId: string
  clientLabel: string
  isCodeId: string
  isCodeLabel: string
  cmLDigits: string
  licenseValidityDate: string
  status: string
  applicationStage: string
  isQeManaged: boolean
  caseHandledBy: string
  caseReferredBy: string
  billingAmount: string
  billingFrequency: string
  portalUserId: string
  portalPassword: string
  notes: string
}

export function emptyBisProjectForm(): BisProjectForm {
  return {
    projectKind: DEFAULT_PROJECT_KIND,
    title: '',
    clientId: '',
    clientLabel: '',
    isCodeId: '',
    isCodeLabel: '',
    cmLDigits: '',
    licenseValidityDate: '',
    status: 'in_progress',
    applicationStage: '',
    isQeManaged: true,
    caseHandledBy: DEFAULT_CASE_HANDLED_BY,
    caseReferredBy: DEFAULT_CASE_REFERRED_BY,
    billingAmount: '0.00',
    billingFrequency: DEFAULT_BILLING_FREQUENCY,
    portalUserId: '',
    portalPassword: '',
    notes: '',
  }
}

export function clientDisplayName(row: Pick<BisProjectRow, 'client'>): string {
  return (row.client?.company_name ?? '').trim()
}

export function isCodeDisplayLabel(row: Pick<BisProjectRow, 'is_code'>): string {
  const code = row.is_code
  if (!code) return ''
  return formatIsCodeLabelFromParts(code.is_number, code.revision_year)
}

export function rowToBisProjectForm(row: BisProjectRow): BisProjectForm {
  const amount = Number(row.billing_amount)
  return {
    projectKind: row.project_kind?.trim() || DEFAULT_PROJECT_KIND,
    title: row.title ?? '',
    clientId: row.client_id ?? '',
    clientLabel: clientDisplayName(row),
    isCodeId: row.is_code_id ?? '',
    isCodeLabel: isCodeDisplayLabel(row),
    cmLDigits: String(row.cm_l_digits ?? '').replace(/\D/g, '').slice(0, 10),
    licenseValidityDate: row.license_validity_date ?? '',
    status: row.status?.trim() || 'in_progress',
    applicationStage: row.application_stage ?? '',
    isQeManaged: row.is_qe_managed !== false,
    caseHandledBy: row.case_handled_by ?? DEFAULT_CASE_HANDLED_BY,
    caseReferredBy: row.case_referred_by ?? DEFAULT_CASE_REFERRED_BY,
    billingAmount: Number.isFinite(amount) ? amount.toFixed(2) : '0.00',
    billingFrequency: row.billing_frequency?.trim() || DEFAULT_BILLING_FREQUENCY,
    portalUserId: row.portal_user_id ?? '',
    portalPassword: row.portal_password ?? '',
    notes: row.notes ?? '',
  }
}

export function sanitizeCurrencyInput(raw: string): string {
  let s = raw.replace(/[^0-9.]/g, '')
  const dot = s.indexOf('.')
  if (dot !== -1) {
    const intPart = s.slice(0, dot)
    const frac = s.slice(dot + 1).replace(/\./g, '').slice(0, 2)
    s = `${intPart}.${frac}`
  }
  if (s === '.') return '0.'
  if (s.startsWith('.')) s = `0${s}`
  return s
}

export function buildBisProjectTitle(form: BisProjectForm): string {
  const parts = [form.clientLabel.trim(), form.isCodeLabel.trim()].filter(Boolean)
  if (form.cmLDigits) parts.push(`CM/L-${form.cmLDigits}`)
  return parts.join(' — ') || 'BIS License'
}

export function todayIsoDate(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

export function formatDisplayDate(value: string | null | undefined): string {
  if (!value) return '—'
  const [y, m, d] = value.slice(0, 10).split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}

export function formatCmL(digits: string | null | undefined): string {
  const d = String(digits ?? '').replace(/\D/g, '')
  return d ? `CM/L-${d}` : '—'
}

export function formatInr(value: number | string | null | undefined): string {
  if (value == null || value === '') return '—'
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function projectStatusLabel(status: string | null | undefined): string {
  const value = (status ?? '').trim()
  if (!value) return '—'
  return (
    BIS_PROJECT_STATUS_OPTIONS.find((o) => o.value === value)?.label ??
    value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  )
}

export type LicenseValidityState = 'operative' | 'expiring' | 'expired' | 'unknown'

export const RENEWAL_WINDOW_DAYS = 90

/** Inclusive end date (YYYY-MM-DD) for the due-soon renewal window. */
export function dueSoonEndIsoDate(today: string = todayIsoDate(), days = RENEWAL_WINDOW_DAYS): string {
  const d = new Date(`${today.slice(0, 10)}T00:00:00`)
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function licenseValidityState(
  validityDate: string | null | undefined,
  today: string = todayIsoDate(),
): { state: LicenseValidityState; daysLeft: number | null } {
  if (!validityDate) return { state: 'unknown', daysLeft: null }
  const end = new Date(`${validityDate.slice(0, 10)}T00:00:00`)
  const now = new Date(`${today}T00:00:00`)
  if (Number.isNaN(end.getTime())) return { state: 'unknown', daysLeft: null }
  const daysLeft = Math.round((end.getTime() - now.getTime()) / 86_400_000)
  if (daysLeft < 0) return { state: 'expired', daysLeft }
  if (daysLeft <= RENEWAL_WINDOW_DAYS) return { state: 'expiring', daysLeft }
  return { state: 'operative', daysLeft }
}
