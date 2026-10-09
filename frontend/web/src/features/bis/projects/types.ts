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

/** Primary Type of Project choices on Add/Edit (Application converts to License later). */
export const BIS_PROJECT_KIND_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'Application', label: 'Application' },
  { value: 'Licence', label: 'License' },
]

/** Extra kinds used by filtered list pages (not shown on Type of Project). */
export const BIS_PROJECT_KIND_EXTRA_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'Inclusion', label: 'Inclusion' },
]

export const DEFAULT_PROJECT_KIND = 'Application'

/** Default project_kind when creating a row from a filtered list page. */
export function defaultProjectKindForListMode(mode: BisProjectsListMode): string {
  if (mode === 'applications') return 'Application'
  if (mode === 'inclusion') return 'Inclusion'
  return DEFAULT_PROJECT_KIND
}

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
export const DEFAULT_APPLICATION_STAGE = 'Under Preparation'

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
  factory_site_id?: string | null
  certification_scheme_id?: string | null
  bis_office_id?: string | null
  licence_status_id?: string | null
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
  /** @deprecated S6: always null. The password lives in private.bis_portal_secrets. */
  portal_password: string | null
  portal_password_set: boolean
  application_stage: string | null
  is_qe_managed: boolean | null
  application_process: string | null
  application_number: string | null
  application_date: string | null
  inspection_date: string | null
  granted_date: string | null
  branch_name: string | null
  branch_state: string | null
  branch_head_name: string | null
  branch_head_designation: string | null
  inspection_officer_name: string | null
  inspection_officer_designation: string | null
  dealing_officer_name: string | null
  dealing_officer_designation: string | null
  type_of_inspection: string | null
  created_at?: string | null
  updated_at?: string | null
  client: BisProjectClientJoin | null
  is_code: BisProjectIsCodeJoin | null
}

export type BisApplicationProcess = 'simplified' | 'normal'

export type BisApplicationDetailsForm = {
  applicationProcess: BisApplicationProcess
  applicationNumber: string
  applicationDate: string
  inspectionDate: string
  licenseNumberDigits: string
  grantedDate: string
  licenseValidityDate: string
  branchName: string
  branchState: string
  branchHeadName: string
  branchHeadDesignation: string
  inspectionOfficerName: string
  inspectionOfficerDesignation: string
  dealingOfficerName: string
  dealingOfficerDesignation: string
  typeOfInspection: string
}

export type BisProjectForm = {
  projectKind: string
  title: string
  clientId: string
  clientLabel: string
  factorySiteId: string
  certificationSchemeId: string
  bisOfficeId: string
  licenceStatusId: string
  isCodeId: string
  isCodeLabel: string
  cmLDigits: string
  licenseValidityDate: string
  grantedDate: string
  status: string
  applicationStage: string
  isQeManaged: boolean
  caseHandledBy: string
  caseReferredBy: string
  billingAmount: string
  billingFrequency: string
  portalUserId: string
  /** New password typed in this edit. Empty means unchanged. */
  portalPassword: string
  portalPasswordSet: boolean
  clearPortalPassword: boolean
  notes: string
}

/** Marker prefix for License Scope table JSON stored in the notes field. */
export const BIS_NOTES_TABLE_PREFIX = '@@BIS_SCOPE_TABLE@@'

/** Legacy separator from earlier multi-textarea experiment. */
const BIS_NOTES_COLUMN_SEP_LEGACY = '⟦COL⟧'

export const BIS_NOTES_COLUMN_COUNT_OPTIONS = [1, 2, 3, 4, 5, 6] as const

export type BisNotesScopePlain = { mode: 'plain'; text: string }
export type BisNotesScopeTable = { mode: 'table'; headers: string[]; rows: string[][] }
export type BisNotesScope = BisNotesScopePlain | BisNotesScopeTable

function emptyRow(columnCount: number): string[] {
  return Array.from({ length: columnCount }, () => '')
}

function defaultHeaderAt(index: number, columnCount: number): string {
  if (columnCount === 2) {
    return index === 0 ? 'Component' : 'Value'
  }
  return `Column ${index + 1}`
}

function defaultHeaders(columnCount: number): string[] {
  return Array.from({ length: columnCount }, (_, i) => defaultHeaderAt(i, columnCount))
}

function normalizeTable(headers: string[], rows: string[][]): BisNotesScopeTable {
  const colCount = Math.max(2, Math.min(6, headers.length || 2))
  const nextHeaders = Array.from(
    { length: colCount },
    (_, i) => headers[i] ?? defaultHeaderAt(i, colCount),
  )
  const nextRows =
    rows.length > 0
      ? rows.map((row) => Array.from({ length: colCount }, (_, i) => row[i] ?? ''))
      : [emptyRow(colCount)]
  return { mode: 'table', headers: nextHeaders, rows: nextRows }
}

/**
 * Notes sometimes holds imported Manak / checklist JSON (branch, officers, etc.).
 * License Scope editor should only keep the human-readable `license_scope` text.
 */
export function sanitizeBisLicenseScopeNotes(notes: string): string {
  const raw = notes ?? ''
  if (raw.startsWith(BIS_NOTES_TABLE_PREFIX)) return raw
  if (raw.includes(BIS_NOTES_COLUMN_SEP_LEGACY)) return raw
  const trimmed = raw.trim()
  if (!trimmed.startsWith('{')) return raw
  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return ''
    const obj = parsed as Record<string, unknown>
    const looksLikeChecklist =
      obj.type === 'application_checklist' ||
      'meta' in obj ||
      'license_scope' in obj ||
      (obj.meta != null && typeof obj.meta === 'object')
    if (!looksLikeChecklist) return raw
    return String(obj.license_scope ?? '').trim()
  } catch {
    return raw
  }
}

export function parseBisNotesScope(notes: string): BisNotesScope {
  const raw = sanitizeBisLicenseScopeNotes(notes ?? '')
  if (raw.startsWith(BIS_NOTES_TABLE_PREFIX)) {
    try {
      const parsed = JSON.parse(raw.slice(BIS_NOTES_TABLE_PREFIX.length)) as {
        headers?: unknown
        rows?: unknown
      }
      const headers = Array.isArray(parsed.headers)
        ? parsed.headers.map((h) => String(h ?? ''))
        : defaultHeaders(2)
      const rows = Array.isArray(parsed.rows)
        ? parsed.rows.map((row) =>
            Array.isArray(row) ? row.map((cell) => String(cell ?? '')) : emptyRow(headers.length),
          )
        : [emptyRow(headers.length)]
      return normalizeTable(headers, rows)
    } catch {
      return { mode: 'plain', text: raw }
    }
  }

  // Migrate legacy side-by-side column text into a table.
  if (raw.includes(BIS_NOTES_COLUMN_SEP_LEGACY)) {
    const cols = raw.split(/\n?⟦COL⟧\n?/)
    const colCount = Math.max(2, Math.min(6, cols.length))
    const headers = defaultHeaders(colCount)
    const maxLines = Math.max(1, ...cols.map((c) => c.split('\n').length))
    const rows = Array.from({ length: maxLines }, (_, r) =>
      Array.from({ length: colCount }, (_, c) => {
        const lines = (cols[c] ?? '').split('\n')
        return lines[r] ?? ''
      }),
    )
    return { mode: 'table', headers, rows }
  }

  return { mode: 'plain', text: raw }
}

export function serializeBisNotesScope(scope: BisNotesScope): string {
  if (scope.mode === 'plain') return scope.text
  const table = normalizeTable(scope.headers, scope.rows)
  return `${BIS_NOTES_TABLE_PREFIX}${JSON.stringify({
    headers: table.headers,
    rows: table.rows,
  })}`
}

/** Switch between plain text (1) and table (2–6 columns). */
export function setBisNotesScopeColumnCount(notes: string, count: number): string {
  const n = Math.max(1, Math.min(6, Math.floor(count)))
  const current = parseBisNotesScope(notes)

  if (n === 1) {
    if (current.mode === 'plain') return current.text
    const lines = current.rows.map((row) =>
      row
        .map((cell, i) => {
          const header = current.headers[i]?.trim()
          const value = cell.trim()
          if (!value) return ''
          return header ? `${header}: ${value}` : value
        })
        .filter(Boolean)
        .join(' | '),
    )
    return lines.filter(Boolean).join('\n')
  }

  if (current.mode === 'table') {
    const headers = Array.from(
      { length: n },
      (_, i) => current.headers[i] ?? defaultHeaderAt(i, n),
    )
    const rows = current.rows.map((row) => Array.from({ length: n }, (_, i) => row[i] ?? ''))
    return serializeBisNotesScope({ mode: 'table', headers, rows: rows.length ? rows : [emptyRow(n)] })
  }

  const headers = defaultHeaders(n)
  const first = current.text.trim()
  const rows = [Array.from({ length: n }, (_, i) => (i === 0 ? first : ''))]
  return serializeBisNotesScope({ mode: 'table', headers, rows })
}

export function bisNotesScopeColumnCount(notes: string): number {
  const scope = parseBisNotesScope(notes)
  return scope.mode === 'table' ? scope.headers.length : 1
}

/** Flatten notes / license-scope table for print / plain-text consumers. */
export function flattenBisNotesColumns(notes: string): string {
  const scope = parseBisNotesScope(notes)
  if (scope.mode === 'plain') return scope.text.trim()

  const headerLine = scope.headers.map((h) => h.trim()).join('\t')
  const body = scope.rows
    .map((row) => row.map((cell) => cell.trim()).join('\t'))
    .filter((line) => line.replace(/\t/g, '').trim().length > 0)
  return [headerLine, ...body].filter(Boolean).join('\n')
}

export function emptyBisProjectForm(projectKind: string = DEFAULT_PROJECT_KIND): BisProjectForm {
  return {
    projectKind: projectKind.trim() || DEFAULT_PROJECT_KIND,
    title: '',
    clientId: '',
    clientLabel: '',
    factorySiteId: '',
    certificationSchemeId: '',
    bisOfficeId: '',
    licenceStatusId: '',
    isCodeId: '',
    isCodeLabel: '',
    cmLDigits: '',
    licenseValidityDate: '',
    grantedDate: '',
    status: 'in_progress',
    applicationStage: DEFAULT_APPLICATION_STAGE,
    isQeManaged: true,
    caseHandledBy: DEFAULT_CASE_HANDLED_BY,
    caseReferredBy: DEFAULT_CASE_REFERRED_BY,
    billingAmount: '0.00',
    billingFrequency: DEFAULT_BILLING_FREQUENCY,
    portalUserId: '',
    portalPassword: '',
    portalPasswordSet: false,
    clearPortalPassword: false,
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
  const kindRaw = row.project_kind?.trim() || DEFAULT_PROJECT_KIND
  // Normalize legacy "License" spelling to stored "Licence".
  const projectKind =
    kindRaw.toLowerCase() === 'license' ? 'Licence' : kindRaw
  return {
    projectKind,
    title: row.title ?? '',
    clientId: row.client_id ?? '',
    clientLabel: clientDisplayName(row),
    factorySiteId: row.factory_site_id ?? '',
    certificationSchemeId: row.certification_scheme_id ?? '',
    bisOfficeId: row.bis_office_id ?? '',
    licenceStatusId: row.licence_status_id ?? '',
    isCodeId: row.is_code_id ?? '',
    isCodeLabel: isCodeDisplayLabel(row),
    cmLDigits: String(row.cm_l_digits ?? '').replace(/\D/g, '').slice(0, 10),
    licenseValidityDate: row.license_validity_date ?? '',
    grantedDate: row.granted_date ?? '',
    status: row.status?.trim() || 'in_progress',
    applicationStage: row.application_stage?.trim() || DEFAULT_APPLICATION_STAGE,
    isQeManaged: row.is_qe_managed !== false,
    caseHandledBy: row.case_handled_by ?? DEFAULT_CASE_HANDLED_BY,
    caseReferredBy: row.case_referred_by ?? DEFAULT_CASE_REFERRED_BY,
    billingAmount: Number.isFinite(amount) ? amount.toFixed(2) : '0.00',
    billingFrequency: row.billing_frequency?.trim() || DEFAULT_BILLING_FREQUENCY,
    portalUserId: row.portal_user_id ?? '',
    portalPassword: '',
    portalPasswordSet: Boolean(row.portal_password_set),
    clearPortalPassword: false,
    notes: sanitizeBisLicenseScopeNotes(row.notes ?? ''),
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

export function formatCmA(digits: string | null | undefined): string {
  const d = String(digits ?? '').replace(/\D/g, '')
  return d ? `CM/A-${d}` : '—'
}

export function emptyBisApplicationDetailsForm(): BisApplicationDetailsForm {
  return {
    applicationProcess: 'simplified',
    applicationNumber: '',
    applicationDate: '',
    inspectionDate: '',
    licenseNumberDigits: '',
    grantedDate: '',
    licenseValidityDate: '',
    branchName: '',
    branchState: '',
    branchHeadName: '',
    branchHeadDesignation: '',
    inspectionOfficerName: '',
    inspectionOfficerDesignation: '',
    dealingOfficerName: '',
    dealingOfficerDesignation: '',
    typeOfInspection: '',
  }
}

export function rowToBisApplicationDetailsForm(
  row: BisProjectRow,
): BisApplicationDetailsForm {
  const processRaw = (row.application_process ?? '').trim().toLowerCase()
  const licenseDigits = String(row.cm_l_digits ?? row.license_number ?? '')
    .replace(/\D/g, '')
    .slice(0, 10)
  return {
    applicationProcess: processRaw === 'normal' ? 'normal' : 'simplified',
    applicationNumber: String(row.application_number ?? '').replace(/\D/g, ''),
    applicationDate: row.application_date ?? '',
    inspectionDate: row.inspection_date ?? '',
    licenseNumberDigits: licenseDigits,
    grantedDate: row.granted_date ?? '',
    licenseValidityDate: row.license_validity_date ?? '',
    branchName: row.branch_name ?? '',
    branchState: row.branch_state ?? '',
    branchHeadName: row.branch_head_name ?? '',
    branchHeadDesignation: row.branch_head_designation ?? '',
    inspectionOfficerName: row.inspection_officer_name ?? '',
    inspectionOfficerDesignation: row.inspection_officer_designation ?? '',
    dealingOfficerName: row.dealing_officer_name ?? '',
    dealingOfficerDesignation: row.dealing_officer_designation ?? '',
    typeOfInspection: row.type_of_inspection ?? '',
  }
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
