import { supabase } from '@/lib/supabaseClient'
import { formatIsCodeLabelFromParts } from '@/features/masters/is-codes/formatIsCodeLabel'
import { formatClientAddress } from '@/features/masters/clients/types'
import type { FilterComboboxOption } from '@/features/sample-handling/receiving/FilterCombobox'
import {
  buildBisProjectTitle,
  DEFAULT_APPLICATION_STAGE,
  DEFAULT_BILLING_FREQUENCY,
  DEFAULT_CASE_HANDLED_BY,
  DEFAULT_CASE_REFERRED_BY,
  DEFAULT_PROJECT_KIND,
  dueSoonEndIsoDate,
  sanitizeBisLicenseScopeNotes,
  todayIsoDate,
  type BisApplicationDetailsForm,
  type BisProjectForm,
  type BisProjectRow,
  type BisProjectsListMode,
} from './types'

const SELECT_WITH_JOINS =
  '*, client:clients(company_name), is_code:is_codes(is_number, title, revision_year)'

const LOOKUP_ID_LIMIT = 100
const LOOKUP_OPTION_LIMIT = 30

export function formatBisApiError(err: unknown): string {
  if (!err) return 'Unknown error'
  const anyErr = err as { message?: string; details?: string; hint?: string; code?: string }
  const message = typeof err === 'string' ? err : (anyErr.message ?? '')
  const lower = message.toLowerCase()
  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed')
  ) {
    return 'Network connection failed. Check your internet and try again.'
  }
  if (typeof err === 'string') return err
  const parts = [anyErr.message, anyErr.details, anyErr.hint]
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean)
  return parts.length ? parts.join(' | ') : 'Unknown error'
}

/** Strips characters that would break PostgREST `or=(...)` / ilike syntax. */
function sanitizeSearchTerm(raw: string): string {
  return raw.replace(/[,()"\\*%_]/g, ' ').replace(/\s+/g, ' ').trim()
}

async function matchingClientIds(term: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('id')
    .ilike('company_name', `%${term}%`)
    .limit(LOOKUP_ID_LIMIT)
  if (error) throw error
  return (data ?? []).map((r) => String((r as { id: string }).id))
}

async function matchingIsCodeIds(term: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('is_codes')
    .select('id')
    .or(`is_number.ilike.*${term}*,title.ilike.*${term}*`)
    .limit(LOOKUP_ID_LIMIT)
  if (error) throw error
  return (data ?? []).map((r) => String((r as { id: string }).id))
}

export type BisQeManagedFilter = 'all' | 'managed' | 'not_managed'
export type BisProjectKindFilter = 'all' | 'Application' | 'Licence'
/** License validity bucket filter (header). Deferred = no validity date. */
export type BisLicenseStatusFilter =
  | 'all'
  | 'operative'
  | 'renewal'
  | 'deferred'
  | 'expired'

/** Sortable table columns (Action excluded). */
export type BisProjectSortKey = 'client' | 'isCode' | 'cmL' | 'validity' | 'billing'
export type BisProjectSortDir = 'asc' | 'desc'

export type FetchBisProjectsParams = {
  listMode: BisProjectsListMode
  search: string
  page: number
  pageSize: number
  qeManagedFilter?: BisQeManagedFilter
  projectKindFilter?: BisProjectKindFilter
  licenseStatusFilter?: BisLicenseStatusFilter
  /** Default: validity ascending (least days remaining first). */
  sortKey?: BisProjectSortKey
  sortDir?: BisProjectSortDir
}

export async function fetchBisProjectsPage({
  listMode,
  search,
  page,
  pageSize,
  qeManagedFilter = 'all',
  projectKindFilter = 'all',
  licenseStatusFilter = 'all',
  sortKey = 'validity',
  sortDir = 'asc',
}: FetchBisProjectsParams): Promise<{ rows: BisProjectRow[]; total: number }> {
  const term = sanitizeSearchTerm(search)

  let orFilter: string | null = null
  if (term) {
    const parts = [
      `title.ilike.*${term}*`,
      `license_number.ilike.*${term}*`,
      `cm_l_digits.ilike.*${term}*`,
    ]
    const digits = term.replace(/\D/g, '')
    if (digits.length >= 3 && digits !== term) parts.push(`cm_l_digits.ilike.*${digits}*`)

    const [clientIds, isCodeIds] = await Promise.all([
      matchingClientIds(term),
      matchingIsCodeIds(term),
    ])
    if (clientIds.length > 0) parts.push(`client_id.in.(${clientIds.join(',')})`)
    if (isCodeIds.length > 0) parts.push(`is_code_id.in.(${isCodeIds.join(',')})`)
    orFilter = parts.join(',')
  }

  let query = supabase.from('bis_projects').select(SELECT_WITH_JOINS, { count: 'exact' })

  const today = todayIsoDate()
  if (listMode === 'our') query = query.eq('is_qe_managed', true)
  else if (qeManagedFilter === 'managed') query = query.eq('is_qe_managed', true)
  else if (qeManagedFilter === 'not_managed') query = query.eq('is_qe_managed', false)

  // Header license-status filter overrides dedicated expired / due-soon list modes when set.
  const effectiveLicenseStatus: BisLicenseStatusFilter =
    licenseStatusFilter !== 'all'
      ? licenseStatusFilter
      : listMode === 'expired'
        ? 'expired'
        : listMode === 'due_soon'
          ? 'renewal'
          : 'all'

  if (effectiveLicenseStatus === 'expired') {
    query = query.lt('license_validity_date', today)
  } else if (effectiveLicenseStatus === 'renewal') {
    query = query
      .gte('license_validity_date', today)
      .lte('license_validity_date', dueSoonEndIsoDate(today))
  } else if (effectiveLicenseStatus === 'operative') {
    query = query.gt('license_validity_date', dueSoonEndIsoDate(today))
  } else if (effectiveLicenseStatus === 'deferred') {
    query = query.is('license_validity_date', null)
  }

  if (listMode === 'stop_marking') query = query.eq('status', 'stop_marking')
  if (listMode === 'applications') {
    query = query.or('project_kind.eq.Application,project_kind.eq.application')
  } else if (listMode === 'inclusion') {
    query = query.eq('project_kind', 'Inclusion')
  } else if (projectKindFilter === 'Application') {
    query = query.or('project_kind.eq.Application,project_kind.eq.application')
  } else if (projectKindFilter === 'Licence') {
    query = query.not('project_kind', 'in', '("Application","application")')
  }
  // projectKindFilter === 'all' → show Application + License on general lists
  if (orFilter) query = query.or(orFilter)

  const ascending = sortDir === 'asc'
  // Null validity dates last when sorting by days remaining (asc or desc).
  const nullsFirst = false
  if (sortKey === 'client') {
    query = query
      .order('company_name', { ascending, foreignTable: 'client', nullsFirst })
      .order('id', { ascending: true })
  } else if (sortKey === 'isCode') {
    query = query
      .order('is_number', { ascending, foreignTable: 'is_code', nullsFirst })
      .order('id', { ascending: true })
  } else if (sortKey === 'cmL') {
    query = query.order('cm_l_digits', { ascending, nullsFirst }).order('id', { ascending: true })
  } else if (sortKey === 'billing') {
    query = query.order('billing_amount', { ascending, nullsFirst }).order('id', { ascending: true })
  } else {
    // validity — least days remaining first when ascending
    query = query
      .order('license_validity_date', { ascending, nullsFirst })
      .order('id', { ascending: true })
  }

  const from = (Math.max(1, page) - 1) * pageSize
  const { data, error, count } = await query.range(from, from + pageSize - 1)
  if (error) throw error

  return {
    rows: (Array.isArray(data) ? data : []) as unknown as BisProjectRow[],
    total: count ?? 0,
  }
}

export async function searchClientOptions(term: string): Promise<FilterComboboxOption[]> {
  const clean = sanitizeSearchTerm(term)
  let query = supabase.from('clients').select('id, company_name').order('company_name', { ascending: true })
  if (clean) query = query.ilike('company_name', `%${clean}%`)
  const { data, error } = await query.limit(LOOKUP_OPTION_LIMIT)
  if (error) throw error
  return (data ?? []).map((r) => {
    const row = r as { id: string; company_name: string | null }
    return { id: String(row.id), label: (row.company_name ?? '').trim() || 'Unnamed' }
  })
}

/** Client master lookup filtered to company_type = Testing Laboratory. */
export async function searchTestingLaboratoryClientOptions(
  term: string,
): Promise<FilterComboboxOption[]> {
  const clean = sanitizeSearchTerm(term)
  let query = supabase
    .from('clients')
    .select('id, company_name')
    .eq('company_type', 'Testing Laboratory')
    .order('company_name', { ascending: true })
  if (clean) query = query.ilike('company_name', `%${clean}%`)
  const { data, error } = await query.limit(LOOKUP_OPTION_LIMIT)
  if (error) throw error
  return (data ?? []).map((r) => {
    const row = r as { id: string; company_name: string | null }
    return { id: String(row.id), label: (row.company_name ?? '').trim() || 'Unnamed' }
  })
}

type TestingLabAddressRow = {
  id: string
  company_name: string | null
  address: string | null
  district: string | null
  pin_code: string | null
  state: string | null
  country: string | null
}

/** Full postal address for a Testing Laboratory from Client master (by company name). */
export async function fetchTestingLaboratoryAddressByName(
  companyName: string,
): Promise<string> {
  const name = companyName.trim()
  if (!name) return ''

  const selectCols = 'id, company_name, address, district, pin_code, state, country'

  // Case-insensitive exact match first.
  const exact = await supabase
    .from('clients')
    .select(selectCols)
    .eq('company_type', 'Testing Laboratory')
    .ilike('company_name', name)
    .limit(1)
    .maybeSingle()
  if (exact.error) throw exact.error

  let row = (exact.data as TestingLabAddressRow | null) ?? null
  if (!row) {
    // Fallback: unique partial match when the stored name is slightly longer/shorter.
    const { data, error } = await supabase
      .from('clients')
      .select(selectCols)
      .eq('company_type', 'Testing Laboratory')
      .ilike('company_name', `%${name}%`)
      .order('company_name', { ascending: true })
      .limit(2)
    if (error) throw error
    if ((data ?? []).length === 1) {
      row = data![0] as TestingLabAddressRow
    }
  }

  if (!row) return ''
  const address = formatClientAddress(row)
  return address === '-' ? '' : address
}

export async function searchIsCodeOptions(term: string): Promise<FilterComboboxOption[]> {
  const clean = sanitizeSearchTerm(term)
  let query = supabase
    .from('is_codes')
    .select('id, is_number, revision_year, title')
    .order('is_number', { ascending: true })
  if (clean) query = query.or(`is_number.ilike.*${clean}*,title.ilike.*${clean}*`)
  const { data, error } = await query.limit(LOOKUP_OPTION_LIMIT)
  if (error) throw error
  return (data ?? []).map((r) => {
    const row = r as {
      id: string
      is_number: string | null
      revision_year: string | null
    }
    return {
      id: String(row.id),
      // Dropdown shows only `IS 10748: 2024` (number + revision year).
      label: formatIsCodeLabelFromParts(row.is_number, row.revision_year) || 'Unnamed',
    }
  })
}

export async function fetchBisProjectById(id: string): Promise<BisProjectRow | null> {
  const trimmed = id.trim()
  if (!trimmed) return null
  const { data, error } = await supabase
    .from('bis_projects')
    .select(SELECT_WITH_JOINS)
    .eq('id', trimmed)
    .maybeSingle()
  if (error) throw error
  return (data as BisProjectRow | null) ?? null
}

export async function saveBisProject(
  form: BisProjectForm,
  editingId: string | null,
): Promise<void> {
  const billing = Number.parseFloat(form.billingAmount)
  const kindRaw = form.projectKind.trim() || DEFAULT_PROJECT_KIND
  // Normalize UI "License" → stored "Licence"; keep Application / Inclusion as-is.
  const projectKind =
    kindRaw.toLowerCase() === 'license' ? 'Licence' : kindRaw
  const payload = {
    client_id: form.clientId || null,
    is_code_id: form.isCodeId || null,
    project_kind: projectKind,
    title: form.title.trim() || buildBisProjectTitle(form),
    status: form.status || 'in_progress',
    // NOT NULL on production — never send null (overrides DB default).
    application_stage:
      form.applicationStage.trim() || DEFAULT_APPLICATION_STAGE,
    cm_l_digits: form.cmLDigits || null,
    license_validity_date: form.licenseValidityDate || null,
    granted_date: form.grantedDate || null,
    is_qe_managed: form.isQeManaged,
    case_handled_by: form.caseHandledBy.trim() || DEFAULT_CASE_HANDLED_BY,
    case_referred_by: form.caseReferredBy.trim() || DEFAULT_CASE_REFERRED_BY,
    billing_amount: Number.isFinite(billing) ? billing : 0,
    billing_frequency:
      form.billingFrequency.trim() || DEFAULT_BILLING_FREQUENCY,
    portal_user_id: form.portalUserId.trim() || null,
    portal_password: form.portalPassword || null,
    notes: sanitizeBisLicenseScopeNotes(form.notes).trim() || null,
  }

  if (editingId) {
    const { error } = await supabase.from('bis_projects').update(payload).eq('id', editingId)
    if (error) throw error
    return
  }
  const { error } = await supabase.from('bis_projects').insert(payload)
  if (error) throw error
}

export async function deleteBisProjects(ids: string[]): Promise<void> {
  const { error } = await supabase.from('bis_projects').delete().in('id', ids)
  if (error) throw error
}

/** Saves Notes / License Scope (shared with Manufacturing Scope Declaration module). */
export async function saveBisProjectNotes(
  projectId: string,
  notes: string,
): Promise<void> {
  const { error } = await supabase
    .from('bis_projects')
    .update({ notes: sanitizeBisLicenseScopeNotes(notes).trim() || null })
    .eq('id', projectId)
  if (error) throw error
}

export async function saveBisApplicationDetails(
  projectId: string,
  form: BisApplicationDetailsForm,
): Promise<void> {
  const licenseDigits = form.licenseNumberDigits.replace(/\D/g, '').slice(0, 10)
  const applicationNumber = form.applicationNumber.replace(/\D/g, '')
  const payload = {
    application_process: form.applicationProcess === 'normal' ? 'normal' : 'simplified',
    application_number: applicationNumber || null,
    application_date: form.applicationDate || null,
    inspection_date: form.inspectionDate || null,
    cm_l_digits: licenseDigits || null,
    license_number: licenseDigits ? `CM/L-${licenseDigits}` : null,
    granted_date: form.grantedDate || null,
    license_validity_date: form.licenseValidityDate || null,
    branch_name: form.branchName.trim() || null,
    branch_state: form.branchState.trim() || null,
    branch_head_name: form.branchHeadName.trim() || null,
    branch_head_designation: form.branchHeadDesignation.trim() || null,
    inspection_officer_name: form.inspectionOfficerName.trim() || null,
    inspection_officer_designation: form.inspectionOfficerDesignation.trim() || null,
    dealing_officer_name: form.dealingOfficerName.trim() || null,
    dealing_officer_designation: form.dealingOfficerDesignation.trim() || null,
    type_of_inspection: form.typeOfInspection.trim() || null,
  }
  const { error } = await supabase.from('bis_projects').update(payload).eq('id', projectId)
  if (error) throw error
}
