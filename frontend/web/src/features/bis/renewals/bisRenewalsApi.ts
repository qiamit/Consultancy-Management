import { supabase } from '@/lib/supabaseClient'
import { formatIsCodeLabel } from '@/features/masters/is-codes/formatIsCodeLabel'
import type { FilterComboboxOption } from '@/features/sample-handling/receiving/FilterCombobox'
import { formatBisApiError } from '../projects/bisProjectsApi'
import {
  renewalClientName,
  coveredProductionExceedsTotal,
  calculateRenewalProductionRow,
  type RenewalSlabRate,
  type BisRenewalForm,
  type BisRenewalRow,
} from './types'

export { formatBisApiError }

const PROJECT_JOIN =
  'project:bis_projects(id, title, cm_l_digits, license_validity_date, status, client_id, is_code:is_codes(is_number, title, revision_year, part_no, section_no, standard_prefix, unit_of_is, slab_1_quantity, slab_1_rate, slab_2_quantity, slab_2_rate, slab_3_quantity, slab_3_rate))'
const SELECT_WITH_JOINS = `*, client:clients(company_name, address, email), ${PROJECT_JOIN}`

const LOOKUP_ID_LIMIT = 100
const LOOKUP_OPTION_LIMIT = 30

function sanitizeSearchTerm(raw: string): string {
  return raw.replace(/[,()"\\*%_]/g, ' ').replace(/\s+/g, ' ').trim()
}

async function matchingClientIds(term: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('id')
    .is('archived_at', null)
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

export async function fetchRenewalById(id: string): Promise<BisRenewalRow | null> {
  const { data, error } = await supabase
    .from('bis_renewal_applications')
    .select(SELECT_WITH_JOINS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data as unknown as BisRenewalRow | null
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
  projectLabel: string
  clientId: string
  clientLabel: string
  clientAddress: string
  clientEmail: string
  currentValidity: string
  cmLDigits: string
  isCodeLabel: string
  unitOfIs: string
  slabRates: RenewalSlabRate[]
}

export async function fetchRenewalSlabRates(projectId: string): Promise<RenewalSlabRate[]> {
  const { data: project, error: projectError } = await supabase
    .from('bis_projects')
    .select('is_code_id')
    .eq('id', projectId)
    .maybeSingle()
  if (projectError) throw projectError
  const isCodeId = (project as { is_code_id?: string | null } | null)?.is_code_id
  if (!isCodeId) return []

  const { data, error } = await supabase
    .from('is_codes')
    .select('slab_1_quantity, slab_1_rate, slab_2_quantity, slab_2_rate, slab_3_quantity, slab_3_rate')
    .eq('id', isCodeId)
    .maybeSingle()
  if (error) throw error
  const isCode = data as {
    slab_1_quantity?: string | null
    slab_1_rate?: number | string | null
    slab_2_quantity?: string | null
    slab_2_rate?: number | string | null
    slab_3_quantity?: string | null
    slab_3_rate?: number | string | null
  } | null
  if (!isCode) return []
  return [
    { quantity: isCode.slab_1_quantity ?? '', rate: String(isCode.slab_1_rate ?? '') },
    { quantity: isCode.slab_2_quantity ?? '', rate: String(isCode.slab_2_rate ?? '') },
    { quantity: isCode.slab_3_quantity ?? '', rate: String(isCode.slab_3_rate ?? '') },
  ]
}

export async function fetchRenewalProjectSummary(
  projectId: string,
): Promise<RenewalProjectSummary | null> {
  const { data, error } = await supabase
    .from('bis_projects')
    .select(
      'id, title, client_id, is_code_id, cm_l_digits, license_validity_date, client:clients(company_name, address, email), is_code:is_codes(id, is_number, revision_year, part_no, section_no, standard_prefix, unit_of_is, slab_1_quantity, slab_1_rate, slab_2_quantity, slab_2_rate, slab_3_quantity, slab_3_rate)',
    )
    .eq('id', projectId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = data as unknown as {
    title: string | null
    client_id: string | null
    is_code_id: string | null
    cm_l_digits: string | null
    license_validity_date: string | null
    client: { company_name: string | null; address: string | null; email: string | null } | null
    is_code: {
      is_number: string | null
      revision_year: string | null
      part_no?: string | null
      section_no?: string | null
      standard_prefix?: string | null
      unit_of_is?: string | null
      slab_1_quantity?: string | null
      slab_1_rate?: number | string | null
      slab_2_quantity?: string | null
      slab_2_rate?: number | string | null
      slab_3_quantity?: string | null
      slab_3_rate?: number | string | null
    } | null
  }
  let isCode = row.is_code
  if (!isCode?.unit_of_is && row.is_code_id) {
    const { data: fetchedIsCode, error: isCodeError } = await supabase
      .from('is_codes')
      .select('unit_of_is, slab_1_quantity, slab_1_rate, slab_2_quantity, slab_2_rate, slab_3_quantity, slab_3_rate')
      .eq('id', row.is_code_id)
      .maybeSingle()
    if (isCodeError) throw isCodeError
    if (fetchedIsCode) isCode = fetchedIsCode as typeof row.is_code
  }
  const unitOfIs = isCode?.unit_of_is?.trim() ?? ''
  const slabRates = isCode ? [
    { quantity: isCode.slab_1_quantity ?? '', rate: String(isCode.slab_1_rate ?? '') },
    { quantity: isCode.slab_2_quantity ?? '', rate: String(isCode.slab_2_rate ?? '') },
    { quantity: isCode.slab_3_quantity ?? '', rate: String(isCode.slab_3_rate ?? '') },
  ] : []
  const cmLDigits = String(row.cm_l_digits ?? '').replace(/\D/g, '')
  return {
    projectLabel: (row.title ?? '').trim() || (cmLDigits ? `CM/L-${cmLDigits}` : 'BIS License'),
    clientId: row.client_id ?? '',
    clientLabel: renewalClientName({ client: row.client }),
    clientAddress: row.client?.address?.trim() ?? '',
    clientEmail: row.client?.email?.trim() ?? '',
    currentValidity: row.license_validity_date ?? '',
    cmLDigits,
    isCodeLabel: row.is_code
      ? formatIsCodeLabel(row.is_code)
      : '',
    unitOfIs,
    slabRates,
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

export async function saveRenewal(
  form: BisRenewalForm,
  editingId: string | null,
  draftId?: string,
): Promise<string> {
  if (form.productionRows.some(coveredProductionExceedsTotal)) {
    throw new Error('Covered Production must be equal to or less than Total Production for every period.')
  }
  const renewalId = editingId ?? draftId ?? globalThis.crypto.randomUUID()
  const payload = {
    id: renewalId,
    project_id: form.projectId,
    client_id: form.clientId || null,
    application_date: dateOrNull(form.applicationDate),
    submission_mode: textOrNull(form.submissionMode),
    acknowledgment_number: textOrNull(form.acknowledgmentNumber),
    bis_office: textOrNull(form.bisOffice),
    bis_desk_officer: textOrNull(form.bisDeskOfficer),
    marking_fee_rate: numberOrNull(form.markingFeeRate),
    renewal_period_from: dateOrNull(form.renewalPeriodFrom),
    renewal_period_to: dateOrNull(form.renewalPeriodTo),
    renewal_term_years: Number.parseInt(form.renewalTermYears, 10) || 5,
    basic_unit_rate: numberOrNull(form.basicUnitRate),
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
    production_details: form.productionRows.map((row, index) => calculateRenewalProductionRow(
      index === 0 ? { ...row, periodFrom: form.renewalPeriodFrom } : row,
      form.basicUnitRate,
      form.slabRates,
    )),
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
    const { error } = await supabase
      .from('bis_renewal_applications')
      .upsert(payload, { onConflict: 'id' })
    if (error) throw error
  }

  // Renewal records remain linked to the same BIS license/project. Update its current
  // validity only after BIS has actually granted the renewal; draft target dates are not
  // license history and must not make a license appear renewed prematurely.
  const newValidity = dateOrNull(form.newValidityTo)
  if (newValidity && form.renewalStatus === 'Renewal Granted') {
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

  return renewalId
}

export async function deleteRenewals(ids: string[]): Promise<void> {
  const { error } = await supabase.from('bis_renewal_applications').delete().in('id', ids)
  if (error) throw error
}

/** The licence's latest saved renewal (Renewal Sheet), or null. */
export async function fetchLatestRenewalForProject(projectId: string): Promise<BisRenewalRow | null> {
  const { data, error } = await supabase
    .from('bis_renewal_applications')
    .select(SELECT_WITH_JOINS)
    .eq('project_id', projectId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data as unknown as BisRenewalRow | null
}
