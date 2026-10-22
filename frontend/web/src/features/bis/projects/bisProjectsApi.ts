import { fetchProjectIdsWithOpenNotices } from './bisOpenNotices'
import { searchClients } from '@/lib/clientsApi'
import { supabase } from '@/lib/supabaseClient'
import { formatIsCodeLabel } from '@/features/masters/is-codes/formatIsCodeLabel'
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
  '*, client:clients(company_name, email, manak_user_id, manak_password_set), is_code:is_codes(is_number, title, revision_year, part_no, section_no, standard_prefix, unit_of_is), scheme:certification_schemes(code, name)'
const SELECT_WITH_JOINS_LEGACY =
  '*, client:clients(company_name, email), is_code:is_codes(is_number, title, revision_year, part_no, section_no, standard_prefix, unit_of_is), scheme:certification_schemes(code, name)'

function missingManakColumn(error: { code?: string; message?: string } | null) {
  if (!error) return false
  const message = error.message ?? ''
  return error.code === '42703' || error.code === 'PGRST204' || /manak_user_id|manak_password_set|does not exist|schema cache/i.test(message)
}

const LOOKUP_ID_LIMIT = 100
const LOOKUP_OPTION_LIMIT = 30

/** Read the testing charge configured for an IS code master record. */
export async function fetchIsCodeTestingCharges(isCodeId: string): Promise<number | null> {
  const id = isCodeId.trim()
  if (!id) return null
  const { data, error } = await supabase
    .from('is_codes')
    .select('testing_charges')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  const raw = (data as { testing_charges: number | string | null } | null)?.testing_charges
  if (raw == null || raw === '') return null
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? value : null
}

export function formatBisApiError(err: unknown): string {
  if (!err) return 'Unknown error'
  const anyErr = err as { message?: string; details?: string; hint?: string; code?: string; constraint?: string }
  const message = typeof err === 'string' ? err : (anyErr.message ?? '')
  const lower = message.toLowerCase()
  if (
    anyErr.code === '23505' &&
    (anyErr.constraint === 'bis_projects_cm_l_digits_uidx' || lower.includes('bis_projects_cm_l_digits_uidx'))
  ) {
    return 'This CM/L number is already assigned to another BIS license. Check the existing license record and correct the duplicate CM/L number before saving.'
  }
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
/** Domestic (Scheme-I and older rows without a scheme) or FMCS (foreign manufacturers). */
export type BisSchemeFilter = 'all' | 'domestic' | 'fmcs'

let fmcsSchemeIdCache: Promise<string | null> | null = null
/** Id of the FMCS row in `certification_schemes` (cached for the session). */
export function fetchFmcsSchemeId(): Promise<string | null> {
  fmcsSchemeIdCache ??= Promise.resolve(
    supabase.from('certification_schemes').select('id').eq('code', 'fmcs').maybeSingle(),
  ).then(({ data, error }) => {
    if (error) {
      fmcsSchemeIdCache = null
      return null
    }
    return (data as { id?: string } | null)?.id ?? null
  })
  return fmcsSchemeIdCache
}
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
  schemeFilter?: BisSchemeFilter
  projectKindFilter?: BisProjectKindFilter
  licenseStatusFilter?: BisLicenseStatusFilter
  /** 'open' = only licences with an open BIS notice (License Non-Conformity case). */
  openNoticeFilter?: 'all' | 'open'
  /** Default: validity ascending (least days remaining first). */
  sortKey?: BisProjectSortKey
  sortDir?: BisProjectSortDir
}

export async function fetchBisProjectsPage(
  params: FetchBisProjectsParams,
  selectColumns = SELECT_WITH_JOINS,
  includeInclusionProgressColumn = true,
): Promise<{ rows: BisProjectRow[]; total: number }> {
  const {
    listMode,
    search,
    page,
    pageSize,
    qeManagedFilter = 'all',
    schemeFilter = 'all',
    projectKindFilter = 'all',
    licenseStatusFilter = 'all',
    openNoticeFilter = 'all',
    sortKey = 'validity',
    sortDir = 'asc',
  } = params
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

  let query = supabase.from('bis_projects').select(selectColumns, { count: 'exact' })
  if (openNoticeFilter === 'open') {
    const noticeIds = await fetchProjectIdsWithOpenNotices()
    if (noticeIds.length === 0) return { rows: [], total: 0 }
    query = query.in('id', noticeIds)
  }

  const today = todayIsoDate()
  if (listMode === 'our' || listMode === 'due_soon') query = query.eq('is_qe_managed', true)
  else if (qeManagedFilter === 'managed') query = query.eq('is_qe_managed', true)
  else if (qeManagedFilter === 'not_managed') query = query.eq('is_qe_managed', false)

  if (schemeFilter !== 'all') {
    const fmcsId = await fetchFmcsSchemeId()
    if (schemeFilter === 'fmcs') {
      if (!fmcsId) return { rows: [], total: 0 }
      query = query.eq('certification_scheme_id', fmcsId)
    } else if (fmcsId) {
      query = query.or(`certification_scheme_id.is.null,certification_scheme_id.neq.${fmcsId}`)
    }
  }

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
  if (listMode === 'due_soon') {
    query = query.not('project_kind', 'in', '("Application","application")')
  }
  if (listMode === 'applications') {
    query = query.or('project_kind.eq.Application,project_kind.eq.application')
  } else if (listMode === 'inclusion') {
    query = includeInclusionProgressColumn
      ? query.or('inclusion_in_progress.eq.true,project_kind.eq.Inclusion,project_kind.eq.inclusion')
      : query.or('project_kind.eq.Inclusion,project_kind.eq.inclusion')
  } else if (projectKindFilter === 'Application') {
    query = query.or('project_kind.eq.Application,project_kind.eq.application')
  } else if (projectKindFilter === 'Licence') {
    query = query.not('project_kind', 'in', '("Application","application")')
  }
  if (listMode !== 'applications' && listMode !== 'inclusion') {
    // Inclusion workflows edit their source license row and must never show as
    // an additional license entry in the general / QE / renewal lists.
    query = query.not('project_kind', 'in', '("Inclusion","inclusion")')
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
  if (
    error &&
    listMode === 'inclusion' &&
    includeInclusionProgressColumn &&
    /inclusion_in_progress.*(does not exist|schema cache)/i.test(error.message ?? '')
  ) {
    // Keep legacy Inclusion records visible until the Railway migration is applied.
    return fetchBisProjectsPage(params, selectColumns, false)
  }
  if (error && selectColumns !== SELECT_WITH_JOINS_LEGACY && missingManakColumn(error)) {
    return fetchBisProjectsPage(params, SELECT_WITH_JOINS_LEGACY)
  }
  if (error) throw error

  let rows = (Array.isArray(data) ? data : []) as unknown as BisProjectRow[]
  if (listMode === 'inclusion') {
    const cmLDigits = [...new Set(rows
      .map((row) => String(row.cm_l_digits ?? '').replace(/\D/g, ''))
      .filter(Boolean))]
    if (cmLDigits.length) {
      const { data: licenses, error: licenseError } = await supabase
        .from('bis_projects')
        .select('cm_l_digits, license_validity_date')
        .in('cm_l_digits', cmLDigits)
        .in('project_kind', ['Licence', 'License', 'licence', 'license'])
      if (licenseError) throw licenseError
      const validityByCmL = new Map<string, string>()
      for (const license of licenses ?? []) {
        const row = license as { cm_l_digits?: string | null; license_validity_date?: string | null }
        const key = String(row.cm_l_digits ?? '').replace(/\D/g, '')
        if (key && row.license_validity_date && !validityByCmL.has(key)) {
          validityByCmL.set(key, row.license_validity_date)
        }
      }
      rows = rows.map((row) => {
        const key = String(row.cm_l_digits ?? '').replace(/\D/g, '')
        return key && validityByCmL.has(key)
          ? { ...row, license_validity_date: validityByCmL.get(key) ?? row.license_validity_date }
          : row
      })
    }
  }

  return { rows, total: count ?? 0 }
}

export async function searchClientOptions(term: string): Promise<FilterComboboxOption[]> {
  const { rows } = await searchClients({ search: term, limit: LOOKUP_OPTION_LIMIT })
  return rows.map((row) => ({
    id: String(row.id),
    label: (row.company_name ?? '').trim() || 'Unnamed',
  }))
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
    .is('archived_at', null)
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

  const { findLaboratoryAddressByName } = await import('@/features/masters/laboratories/laboratoriesApi')
  const fromLab = await findLaboratoryAddressByName(name)
  if (fromLab) return fromLab

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
    .select('id, is_number, revision_year, part_no, section_no, standard_prefix, title')
    .is('archived_at', null)
    .order('is_number', { ascending: true })
  if (clean) query = query.or(`is_number.ilike.*${clean}*,title.ilike.*${clean}*`)
  const { data, error } = await query.limit(LOOKUP_OPTION_LIMIT)
  if (error) throw error
  return (data ?? []).map((r) => {
    const row = r as {
      id: string
      is_number: string | null
      revision_year: string | null
      part_no: string | null
      section_no: string | null
      standard_prefix: string | null
    }
    return {
      id: String(row.id),
      label: formatIsCodeLabel(row) || 'Unnamed',
    }
  })
}

/** IS codes already licensed by the selected client (used by the Inclusion form). */
export async function searchClientLicensedIsCodeOptions(
  clientId: string,
  term: string,
): Promise<FilterComboboxOption[]> {
  const id = clientId.trim()
  if (!id) return []
  const { data, error } = await supabase
    .from('bis_projects')
    .select('is_code_id')
    .eq('client_id', id)
    .in('project_kind', ['Licence', 'License', 'licence', 'license'])
    .not('is_code_id', 'is', null)
    .limit(LOOKUP_ID_LIMIT)
  if (error) throw error
  const isCodeIds = [...new Set((data ?? [])
    .map((row) => String((row as { is_code_id?: string | null }).is_code_id ?? '').trim())
    .filter(Boolean))]
  if (!isCodeIds.length) return []

  const clean = sanitizeSearchTerm(term)
  let query = supabase
    .from('is_codes')
    .select('id, is_number, revision_year, part_no, section_no, standard_prefix, title')
    .in('id', isCodeIds)
    .is('archived_at', null)
    .order('is_number', { ascending: true })
  if (clean) query = query.or(`is_number.ilike.*${clean}*,title.ilike.*${clean}*`)
  const { data: codes, error: codeError } = await query.limit(LOOKUP_OPTION_LIMIT)
  if (codeError) throw codeError
  return (codes ?? []).map((row) => {
    const code = row as {
      id: string
      is_number: string | null
      revision_year: string | null
      part_no: string | null
      section_no: string | null
      standard_prefix: string | null
    }
    return { id: String(code.id), label: formatIsCodeLabel(code) || 'Unnamed' }
  })
}

/** Return a client's CM/L when exactly one license matches the selected IS code. */
export async function findClientCmLForIsCode(
  clientId: string,
  isCodeId: string,
  selectedCmLDigits = '',
): Promise<{ cmLDigits: string; ambiguous: boolean; license: BisProjectRow | null }> {
  const client = clientId.trim()
  const code = isCodeId.trim()
  if (!client || !code) return { cmLDigits: '', ambiguous: false, license: null }
  let query = supabase
    .from('bis_projects')
    .select(SELECT_WITH_JOINS)
    .eq('client_id', client)
    .eq('is_code_id', code)
    .in('project_kind', ['Licence', 'License', 'licence', 'license'])
    .not('cm_l_digits', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(LOOKUP_OPTION_LIMIT)
  const selectedDigits = selectedCmLDigits.replace(/\D/g, '')
  if (selectedDigits) query = query.eq('cm_l_digits', selectedDigits)
  const { data, error } = await query
  if (error) throw error
  const licenses = (data ?? []) as unknown as BisProjectRow[]
  const numbers = [...new Set(licenses
    .map((row) => String(row.cm_l_digits ?? '').replace(/\D/g, ''))
    .filter(Boolean))]
  return numbers.length === 1
    ? {
        cmLDigits: numbers[0],
        ambiguous: false,
        license: licenses.find((row) => String(row.cm_l_digits ?? '').replace(/\D/g, '') === numbers[0]) ?? null,
      }
    : { cmLDigits: '', ambiguous: numbers.length > 1, license: null }
}

export type BisExistingLicenseScopeRecord = {
  id: string
  cmLDigits: string
  clientName: string
  isCodeLabel: string
  notes: string
}

/** Load the source license scope by CM/L so Inclusion records stay linked to that license. */
export async function fetchExistingLicenseScopesByCmL(
  cmLDigits: string,
): Promise<BisExistingLicenseScopeRecord[]> {
  const digits = cmLDigits.replace(/\D/g, '')
  if (!digits) return []
  const { data, error } = await supabase
    .from('bis_projects')
    .select('id, cm_l_digits, notes, client:clients(company_name), is_code:is_codes(is_number, title, revision_year, part_no, section_no, standard_prefix)')
    .eq('cm_l_digits', digits)
    .in('project_kind', ['Licence', 'License', 'licence', 'license'])
    .order('updated_at', { ascending: false })
    .limit(20)
  if (error) throw error
  return (data ?? []).map((row) => {
    const record = row as {
      id: string
      cm_l_digits: string | null
      notes: string | null
      client?: { company_name?: string | null } | null
      is_code?: {
        is_number?: string | null
        title?: string | null
        revision_year?: string | null
        part_no?: string | null
        section_no?: string | null
        standard_prefix?: string | null
      } | null
    }
    return {
      id: String(record.id),
      cmLDigits: String(record.cm_l_digits ?? digits).replace(/\D/g, ''),
      clientName: record.client?.company_name?.trim() ?? '',
      isCodeLabel: formatIsCodeLabel(record.is_code ?? {}) || 'IS code not set',
      notes: sanitizeBisLicenseScopeNotes(record.notes ?? '').trim(),
    }
  })
}

export async function fetchBisProjectById(id: string): Promise<BisProjectRow | null> {
  const trimmed = id.trim()
  if (!trimmed) return null
  let result = await supabase
    .from('bis_projects')
    .select(SELECT_WITH_JOINS)
    .eq('id', trimmed)
    .maybeSingle()
  if (result.error && missingManakColumn(result.error)) {
    result = await supabase
      .from('bis_projects')
      .select(SELECT_WITH_JOINS_LEGACY)
      .eq('id', trimmed)
      .maybeSingle()
  }
  if (result.error) throw result.error
  return (result.data as BisProjectRow | null) ?? null
}

export async function saveBisProject(
  form: BisProjectForm,
  editingId: string | null,
  finishInclusion = false,
): Promise<string> {
  const billing = Number.parseFloat(form.billingAmount)
  const kindRaw = form.projectKind.trim() || DEFAULT_PROJECT_KIND
  // Normalize UI "License" → stored "Licence"; keep Application / Inclusion as-is.
  const projectKind =
    kindRaw.toLowerCase() === 'license' ? 'Licence' : kindRaw
  const payload = {
    client_id: form.clientId || null,
    factory_site_id: form.factorySiteId || null,
    certification_scheme_id: form.certificationSchemeId || null,
    bis_office_id: form.bisOfficeId || null,
    licence_status_id: form.licenceStatusId || null,
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
    notes: sanitizeBisLicenseScopeNotes(form.notes).trim() || null,
  }

  // Give a useful validation message before the database's unique index fires.
  // The unique index remains authoritative for concurrent saves and writes from
  // other clients, so this check is not used as a replacement for the constraint.
  const cmLDigits = String(payload.cm_l_digits ?? '').replace(/\D/g, '')
  if (cmLDigits && projectKind.toLowerCase() !== 'inclusion') {
    let duplicateQuery = supabase
      .from('bis_projects')
      .select('id, client:clients(company_name), is_code:is_codes(is_number)')
      .eq('cm_l_digits', cmLDigits)
      .limit(1)
    if (editingId) duplicateQuery = duplicateQuery.neq('id', editingId)
    const { data: duplicates, error: duplicateError } = await duplicateQuery
    if (duplicateError) throw duplicateError
    if (duplicates?.length) {
      const duplicate = duplicates[0] as {
        client?: { company_name?: string | null } | null
        is_code?: { is_number?: string | null } | null
      }
      const company = duplicate.client?.company_name?.trim()
      const isNumber = duplicate.is_code?.is_number?.trim()
      const owner = [company, isNumber ? `IS ${isNumber}` : ''].filter(Boolean).join(' · ')
      throw new Error(owner
        ? `CM/L ${cmLDigits} is already assigned to ${owner}. Open and update the existing license record instead of creating a duplicate.`
        : `CM/L ${cmLDigits} is already assigned to another BIS license. Open and update the existing record instead of creating a duplicate.`)
    }
  }

  if (projectKind.toLowerCase() === 'inclusion') {
    const editingProject = editingId
      ? await supabase
          .from('bis_projects')
          .select('id, project_kind')
          .eq('id', editingId)
          .maybeSingle()
      : null
    if (editingProject?.error) throw editingProject.error
    const editingProjectKind = String(
      (editingProject?.data as { project_kind?: string | null } | null)?.project_kind ?? '',
    ).toLowerCase()

    // Keep legacy Inclusion rows editable. New Inclusion work always resolves
    // to the existing Licence row, so all project modules retain the same id.
    if (editingProjectKind !== 'inclusion') {
      let licenseQuery = supabase
        .from('bis_projects')
        .select('id, project_kind, cm_l_digits, notes')
        .eq('cm_l_digits', cmLDigits)
        .eq('client_id', payload.client_id)
        .eq('is_code_id', payload.is_code_id)
        .in('project_kind', ['Licence', 'License', 'licence', 'license'])
        .order('updated_at', { ascending: false })
        .limit(1)
      if (editingId) licenseQuery = licenseQuery.eq('id', editingId)
      const { data: licenseData, error: licenseError } = await licenseQuery
      if (licenseError) throw licenseError
      const license = (licenseData?.[0] ?? null) as {
        id?: string
        project_kind?: string | null
        notes?: string | null
      } | null
      if (!license?.id) {
        throw new Error('Select an existing license with this client, IS Code, and CM/L number before saving an Inclusion.')
      }

      const { error } = await supabase
        .from('bis_projects')
        .update({
          ...payload,
          project_kind: license.project_kind || 'Licence',
          inclusion_in_progress: !finishInclusion,
          notes: finishInclusion
            ? payload.notes
            : license.notes ?? null,
          inclusion_scope_draft: finishInclusion
            ? null
            : payload.notes,
        })
        .eq('id', license.id)
      if (error) throw error
      return String(license.id)
    }
  }

  let id = editingId ?? ''
  if (editingId) {
    const { error } = await supabase.from('bis_projects').update(payload).eq('id', editingId)
    if (error) throw error
    id = editingId
  } else {
    // FMCS (foreign manufacturers) applies under Option 1 (normal procedure), not Option 2.
    const fmcsId = payload.certification_scheme_id ? await fetchFmcsSchemeId() : null
    const insertRow = fmcsId && payload.certification_scheme_id === fmcsId ? { ...payload, application_process: 'normal' } : payload
    const { data, error } = await supabase.from('bis_projects').insert(insertRow).select('id').single()
    if (error) throw error
    id = String((data as { id?: string } | null)?.id ?? '')
  }
  if (!id) throw new Error('BIS project was saved but its id was missing.')
  return id
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
    production_unit: form.productionUnit.trim() || null,
    installed_capacity: form.installedCapacity.trim() || null,
    actual_capacity: form.actualCapacity.trim() || null,
    production_rate: form.productionRate.trim() || null,
    production_value: form.productionValue.trim() || null,
  }
  const { error } = await supabase.from('bis_projects').update(payload).eq('id', projectId)
  if (error) throw error
}
