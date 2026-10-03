import { supabase } from '@/lib/supabaseClient'
import { formatIsCodeLabelFromParts } from '@/features/masters/is-codes/formatIsCodeLabel'
import type { FilterComboboxOption } from '@/features/sample-handling/receiving/FilterCombobox'
import { formatBisApiError } from '../projects/bisProjectsApi'
import {
  renewalClientName,
  type BisRenewalForm,
  type BisRenewalRow,
} from './types'

export { formatBisApiError }

const PROJECT_JOIN =
  'project:bis_projects(id, title, cm_l_digits, license_validity_date, status, client_id, is_code:is_codes(is_number, title, revision_year))'
const SELECT_WITH_JOINS = `*, client:clients(company_name), ${PROJECT_JOIN}`

const LOOKUP_ID_LIMIT = 100
const LOOKUP_OPTION_LIMIT = 30

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

async function matchingProjectIds(term: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('bis_projects')
    .select('id')
    .or(`title.ilike.*${term}*,cm_l_digits.ilike.*${term}*,license_number.ilike.*${term}*`)
    .limit(LOOKUP_ID_LIMIT)
  if (error) throw error
  return (data ?? []).map((r) => String((r as { id: string }).id))
}

export async function fetchRenewalsPage({
  search,
  page,
  pageSize,
}: {
  search: string
  page: number
  pageSize: number
}): Promise<{ rows: BisRenewalRow[]; total: number }> {
  const term = sanitizeSearchTerm(search)

  let orFilter: string | null = null
  if (term) {
    const parts = [
      `acknowledgment_number.ilike.*${term}*`,
      `fee_challan_number.ilike.*${term}*`,
      `test_report_number.ilike.*${term}*`,
      `renewal_status.ilike.*${term}*`,
    ]
    const [clientIds, projectIds] = await Promise.all([
      matchingClientIds(term),
      matchingProjectIds(term),
    ])
    if (clientIds.length > 0) parts.push(`client_id.in.(${clientIds.join(',')})`)
    if (projectIds.length > 0) parts.push(`project_id.in.(${projectIds.join(',')})`)
    orFilter = parts.join(',')
  }

  let query = supabase.from('bis_renewal_applications').select(SELECT_WITH_JOINS, { count: 'exact' })
  if (orFilter) query = query.or(orFilter)
  query = query.order('created_at', { ascending: false }).order('id', { ascending: true })

  const from = (Math.max(1, page) - 1) * pageSize
  const { data, error, count } = await query.range(from, from + pageSize - 1)
  if (error) throw error

  return {
    rows: (Array.isArray(data) ? data : []) as unknown as BisRenewalRow[],
    total: count ?? 0,
  }
}

export async function searchRenewalProjectOptions(term: string): Promise<FilterComboboxOption[]> {
  const clean = sanitizeSearchTerm(term)
  let query = supabase
    .from('bis_projects')
    .select('id, title, cm_l_digits, license_validity_date')
    .order('title', { ascending: true })
  if (clean) {
    const parts = [`title.ilike.*${clean}*`, `cm_l_digits.ilike.*${clean}*`]
    const clientIds = await matchingClientIds(clean)
    if (clientIds.length > 0) parts.push(`client_id.in.(${clientIds.join(',')})`)
    query = query.or(parts.join(','))
  }
  const { data, error } = await query.limit(LOOKUP_OPTION_LIMIT)
  if (error) throw error
  return (data ?? []).map((r) => {
    const row = r as {
      id: string
      title: string | null
      cm_l_digits: string | null
      license_validity_date: string | null
    }
    return {
      id: String(row.id),
      label: (row.title ?? '').trim() || (row.cm_l_digits ? `CM/L-${row.cm_l_digits}` : 'BIS License'),
      secondaryLabel: row.license_validity_date ? `Valid till ${row.license_validity_date}` : undefined,
    }
  })
}

export type RenewalProjectSummary = {
  clientId: string
  clientLabel: string
  currentValidity: string
  cmLDigits: string
  isCodeLabel: string
}

export async function fetchRenewalProjectSummary(
  projectId: string,
): Promise<RenewalProjectSummary | null> {
  const { data, error } = await supabase
    .from('bis_projects')
    .select(
      'id, client_id, cm_l_digits, license_validity_date, client:clients(company_name), is_code:is_codes(is_number, revision_year)',
    )
    .eq('id', projectId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = data as unknown as {
    client_id: string | null
    cm_l_digits: string | null
    license_validity_date: string | null
    client: { company_name: string | null } | null
    is_code: { is_number: string | null; revision_year: string | null } | null
  }
  return {
    clientId: row.client_id ?? '',
    clientLabel: renewalClientName({ client: row.client }),
    currentValidity: row.license_validity_date ?? '',
    cmLDigits: String(row.cm_l_digits ?? '').replace(/\D/g, ''),
    isCodeLabel: row.is_code
      ? formatIsCodeLabelFromParts(row.is_code.is_number, row.is_code.revision_year)
      : '',
  }
}

function textOrNull(value: string): string | null {
  const v = value.trim()
  return v ? v : null
}

function dateOrNull(value: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
}

function numberOrNull(value: string): number | null {
  const n = Number.parseFloat(value)
  return Number.isFinite(n) ? n : null
}

export async function saveRenewal(form: BisRenewalForm, editingId: string | null): Promise<void> {
  const payload = {
    project_id: form.projectId,
    client_id: form.clientId || null,
    application_date: dateOrNull(form.applicationDate),
    submission_mode: textOrNull(form.submissionMode),
    acknowledgment_number: textOrNull(form.acknowledgmentNumber),
    bis_office: textOrNull(form.bisOffice),
    bis_desk_officer: textOrNull(form.bisDeskOfficer),
    marking_fee_rate: numberOrNull(form.markingFeeRate),
    marking_fee_quantity: numberOrNull(form.markingFeeQuantity),
    marking_fee_total: numberOrNull(form.markingFeeTotal),
    fee_challan_number: textOrNull(form.feeChallanNumber),
    fee_payment_date: dateOrNull(form.feePaymentDate),
    fee_payment_mode: textOrNull(form.feePaymentMode),
    test_report_number: textOrNull(form.testReportNumber),
    test_report_date: dateOrNull(form.testReportDate),
    test_lab_name: textOrNull(form.testLabName),
    test_lab_nabl_no: textOrNull(form.testLabNablNo),
    test_result: textOrNull(form.testResult),
    inspection_notice_date: dateOrNull(form.inspectionNoticeDate),
    inspection_date: dateOrNull(form.inspectionDate),
    bis_inspector_name: textOrNull(form.bisInspectorName),
    inspection_result: textOrNull(form.inspectionResult),
    renewal_granted_date: dateOrNull(form.renewalGrantedDate),
    new_validity_from: dateOrNull(form.newValidityFrom),
    new_validity_to: dateOrNull(form.newValidityTo),
    renewal_status: form.renewalStatus || 'Initiated',
    notes: textOrNull(form.notes),
    updated_at: new Date().toISOString(),
  }

  if (editingId) {
    const { error } = await supabase
      .from('bis_renewal_applications')
      .update(payload)
      .eq('id', editingId)
    if (error) throw error
  } else {
    const { error } = await supabase.from('bis_renewal_applications').insert(payload)
    if (error) throw error
  }

  // A granted validity date becomes the license's current validity (same as Consultancy Pro).
  const newValidity = dateOrNull(form.newValidityTo)
  if (newValidity) {
    const { error } = await supabase
      .from('bis_projects')
      .update({
        license_validity_date: newValidity,
        status: 'completed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', form.projectId)
    if (error) {
      throw new Error(
        `Renewal saved, but the license validity could not be updated: ${formatBisApiError(error)}`,
      )
    }
  }
}

export async function deleteRenewals(ids: string[]): Promise<void> {
  const { error } = await supabase.from('bis_renewal_applications').delete().in('id', ids)
  if (error) throw error
}
