import { supabase } from '@/lib/supabaseClient'
import type { SurveillanceForm, SurveillanceRow } from './types'

export { formatBisApiError } from '../projects/bisProjectsApi'

const SELECT_WITH_JOINS =
  '*, client:clients(company_name), is_code:is_codes(is_number, title, revision_year), bis_project:bis_projects(title, license_number)'

const LOOKUP_ID_LIMIT = 100

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

export async function fetchSurveillancePage({
  search,
  page,
  pageSize,
}: {
  search: string
  page: number
  pageSize: number
}): Promise<{ rows: SurveillanceRow[]; total: number }> {
  const term = sanitizeSearchTerm(search)

  let orFilter: string | null = null
  if (term) {
    const parts = [`allotted_employee_name.ilike.*${term}*`, `cm_l_digits.ilike.*${term}*`]
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

  let query = supabase.from('license_surveillance').select(SELECT_WITH_JOINS, { count: 'exact' })
  if (orFilter) query = query.or(orFilter)
  query = query.order('surveillance_date', { ascending: false }).order('id', { ascending: true })

  const from = (Math.max(1, page) - 1) * pageSize
  const { data, error, count } = await query.range(from, from + pageSize - 1)
  if (error) throw error

  return {
    rows: (Array.isArray(data) ? data : []) as unknown as SurveillanceRow[],
    total: count ?? 0,
  }
}

export async function saveSurveillance(
  form: SurveillanceForm,
  editingId: string | null,
): Promise<void> {
  const payload = {
    client_id: form.clientId,
    is_code_id: form.isCodeId,
    bis_project_id: form.bisProjectId || null,
    cm_l_digits: form.cmLDigits || null,
    project_kind: form.projectKind || null,
    surveillance_date: form.surveillanceDate,
    allotted_employee_name: form.allottedEmployeeName.trim(),
  }

  if (editingId) {
    const { error } = await supabase.from('license_surveillance').update(payload).eq('id', editingId)
    if (error) throw error
    return
  }
  const { error } = await supabase.from('license_surveillance').insert(payload)
  if (error) throw error
}

export async function deleteSurveillance(ids: string[]): Promise<void> {
  const { error } = await supabase.from('license_surveillance').delete().in('id', ids)
  if (error) throw error
}
