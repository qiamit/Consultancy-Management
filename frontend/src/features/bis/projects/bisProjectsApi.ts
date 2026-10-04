import { supabase } from '@/lib/supabaseClient'
import { formatIsCodeLabelFromParts } from '@/features/masters/is-codes/formatIsCodeLabel'
import type { FilterComboboxOption } from '@/features/sample-handling/receiving/FilterCombobox'
import {
  buildBisProjectTitle,
  DEFAULT_PROJECT_KIND,
  dueSoonEndIsoDate,
  todayIsoDate,
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

export type FetchBisProjectsParams = {
  listMode: BisProjectsListMode
  search: string
  page: number
  pageSize: number
}

export async function fetchBisProjectsPage({
  listMode,
  search,
  page,
  pageSize,
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
  if (listMode === 'expired') query = query.lt('license_validity_date', today)
  if (listMode === 'due_soon') {
    query = query
      .gte('license_validity_date', today)
      .lte('license_validity_date', dueSoonEndIsoDate(today))
  }
  if (listMode === 'stop_marking') query = query.eq('status', 'stop_marking')
  if (listMode === 'applications') {
    query = query.or('project_kind.eq.Application,project_kind.eq.application')
  }
  if (listMode === 'inclusion') query = query.eq('project_kind', 'Inclusion')
  if (orFilter) query = query.or(orFilter)

  query =
    listMode === 'expired' || listMode === 'due_soon'
      ? query
          .order('license_validity_date', { ascending: listMode === 'due_soon' })
          .order('id', { ascending: true })
      : query.order('created_at', { ascending: false }).order('id', { ascending: true })

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
      title: string | null
    }
    return {
      id: String(row.id),
      label: formatIsCodeLabelFromParts(row.is_number, row.revision_year) || 'Unnamed',
      secondaryLabel: (row.title ?? '').trim() || undefined,
    }
  })
}

export async function saveBisProject(
  form: BisProjectForm,
  editingId: string | null,
): Promise<void> {
  const billing = Number.parseFloat(form.billingAmount)
  const payload = {
    client_id: form.clientId || null,
    is_code_id: form.isCodeId || null,
    project_kind: form.projectKind || DEFAULT_PROJECT_KIND,
    title: form.title.trim() || buildBisProjectTitle(form),
    status: form.status || 'in_progress',
    application_stage: form.applicationStage.trim() || null,
    cm_l_digits: form.cmLDigits || null,
    license_validity_date: form.licenseValidityDate || null,
    is_qe_managed: form.isQeManaged,
    case_handled_by: form.caseHandledBy.trim() || null,
    case_referred_by: form.caseReferredBy.trim() || null,
    billing_amount: Number.isFinite(billing) ? billing : 0,
    billing_frequency: form.billingFrequency.trim() || null,
    portal_user_id: form.portalUserId.trim() || null,
    portal_password: form.portalPassword || null,
    notes: form.notes.trim() || null,
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
