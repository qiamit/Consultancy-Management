import { formatClientAddress } from '@/features/masters/clients/types'
import { formatIsCodeLabel } from '@/features/masters/is-codes/buildIsCodeAssistantContext'
import { parseLabSettingsRow, resolveLabSettingsRowId } from '@/features/settings/lab-settings/labSettingsDb'
import { supabase } from '@/lib/supabaseClient'
import { CONSENT_LETTER_DEFAULTS } from './consentLetterDefaults'
import { fetchReportResultRowsForSample } from './reportResultRows'

export type ConsentLetterClientOption = {
  id: string
  companyName: string
  addressBlock: string
}

export type ConsentLetterIsCodeOption = {
  id: string
  label: string
  isNumber: string
  revisionYear: string | null
  title: string
}

export type ConsentLetterTestParameterOption = {
  key: string
  testName: string
  clauseNo: string | null
  specificRequirement: string | null
  uncertaintyMu: string | null
  underAccreditation: string | null
}

export type ConsentLetterLabDetails = {
  labName: string
  address: string
  contacts: string
  website: string
  email: string
  bisOslCode: string
  nablCertificateNo: string
}

export type ConsentLetterFormData = {
  defaultClientId: string | null
  clients: ConsentLetterClientOption[]
  isCodes: ConsentLetterIsCodeOption[]
  testParameters: ConsentLetterTestParameterOption[]
  lab: ConsentLetterLabDetails
}

function clientAddressBlock(row: {
  company_name?: string | null
  address?: string | null
  district?: string | null
  pin_code?: string | null
  state?: string | null
  country?: string | null
}): string {
  const name = row.company_name?.trim() ?? ''
  const address = formatClientAddress({
    address: row.address ?? '',
    district: row.district ?? '',
    pin_code: row.pin_code ?? '',
    state: row.state ?? '',
    country: row.country ?? '',
  })
  const lines = [name, address !== '-' ? address : ''].filter(Boolean)
  return lines.join('\n')
}

async function fetchLabDetails(): Promise<ConsentLetterLabDetails> {
  const rowId = await resolveLabSettingsRowId(supabase)
  const { data } = await supabase.from('lab_settings').select('*').eq('id', rowId).maybeSingle()
  const parsed = data ? parseLabSettingsRow(data as Record<string, unknown>) : null
  const mobile = parsed?.mobile?.trim()
  return {
    labName: parsed?.labName?.trim() || CONSENT_LETTER_DEFAULTS.labName,
    address: parsed?.address?.trim() || CONSENT_LETTER_DEFAULTS.address,
    contacts: mobile || CONSENT_LETTER_DEFAULTS.contacts,
    website: CONSENT_LETTER_DEFAULTS.website,
    email: parsed?.email?.trim() || CONSENT_LETTER_DEFAULTS.email,
    bisOslCode: CONSENT_LETTER_DEFAULTS.bisOslCode,
    nablCertificateNo: CONSENT_LETTER_DEFAULTS.nablCertificateNo,
  }
}

function mapClientRows(data: unknown): ConsentLetterClientOption[] {
  return (Array.isArray(data) ? data : []).map((row) => {
    const r = row as {
      id: string
      company_name?: string | null
      address?: string | null
      district?: string | null
      pin_code?: string | null
      state?: string | null
      country?: string | null
    }
    return {
      id: r.id,
      companyName: r.company_name?.trim() || '—',
      addressBlock: clientAddressBlock(r),
    }
  })
}

function mapIsCodeRows(data: unknown): ConsentLetterIsCodeOption[] {
  return (Array.isArray(data) ? data : []).map((row) => {
    const r = row as { id: string; is_number: string; revision_year: string | null; title: string }
    return {
      id: r.id,
      label: formatIsCodeLabel(r),
      isNumber: r.is_number?.trim() ?? '',
      revisionYear: r.revision_year?.trim() || null,
      title: r.title?.trim() ?? '',
    }
  })
}

async function ensureIsCodeInList(
  isCodes: ConsentLetterIsCodeOption[],
  isCodeId: string | null,
): Promise<ConsentLetterIsCodeOption[]> {
  if (!isCodeId || isCodes.some((c) => c.id === isCodeId)) return isCodes
  const { data: extra } = await supabase
    .from('is_codes')
    .select('id, is_number, revision_year, title')
    .eq('id', isCodeId)
    .maybeSingle()
  if (!extra) return isCodes
  const r = extra as { id: string; is_number: string; revision_year: string | null; title: string }
  return [
    {
      id: r.id,
      label: formatIsCodeLabel(r),
      isNumber: r.is_number?.trim() ?? '',
      revisionYear: r.revision_year?.trim() || null,
      title: r.title?.trim() ?? '',
    },
    ...isCodes,
  ]
}

export async function fetchTestParametersForIsCode(
  isCodeId: string,
): Promise<ConsentLetterTestParameterOption[]> {
  const id = isCodeId.trim()
  if (!id) return []

  const [{ data, error }, { data: abData }] = await Promise.all([
    supabase
      .from('test_parameters')
      .select(
        'id, item_name, clause_no, specific_requirement, uncertainty_mu, under_accreditation_ids',
      )
      .eq('is_code_id', id)
      .order('item_name', { ascending: true }),
    supabase.from('accreditation_bodies').select('id, name').order('name', { ascending: true }),
  ])

  if (error) throw error

  const bodies = new Map<string, string>()
  for (const b of Array.isArray(abData) ? abData : []) {
    const entry = b as { id: string; name: string }
    bodies.set(entry.id, entry.name)
  }

  const accrLabel = (ids: string[] | null | undefined) => {
    if (!Array.isArray(ids) || ids.length === 0) return 'Not Accredited'
    const names = ids.map((i) => bodies.get(i)).filter(Boolean) as string[]
    return names.length > 0 ? names.join(', ') : 'Not Accredited'
  }

  return (Array.isArray(data) ? data : []).map((row) => {
    const r = row as {
      id: string
      item_name?: string | null
      clause_no?: string | null
      specific_requirement?: string | null
      uncertainty_mu?: string | null
      under_accreditation_ids?: string[] | null
    }
    const testName = (r.item_name ?? '').trim() || r.id
    return {
      key: r.id,
      testName,
      clauseNo: (r.clause_no ?? '').trim() || null,
      specificRequirement: (r.specific_requirement ?? '').trim() || null,
      uncertaintyMu: (r.uncertainty_mu ?? '').trim() || null,
      underAccreditation: accrLabel(r.under_accreditation_ids),
    }
  })
}

export async function refreshConsentLetterMasterLists(): Promise<{
  clients: ConsentLetterClientOption[]
  isCodes: ConsentLetterIsCodeOption[]
}> {
  const [clientsRes, isCodesRes] = await Promise.all([
    supabase
      .from('clients')
      .select('id, company_name, address, district, pin_code, state, country')
      .order('company_name', { ascending: true }),
    supabase.from('is_codes').select('id, is_number, revision_year, title').order('is_number', { ascending: true }),
  ])

  if (clientsRes.error) throw clientsRes.error
  if (isCodesRes.error) throw isCodesRes.error

  return {
    clients: mapClientRows(clientsRes.data),
    isCodes: mapIsCodeRows(isCodesRes.data),
  }
}

export async function fetchStandaloneConsentLetterFormData(
  defaultIsCodeId?: string | null,
  defaultClientId?: string | null,
): Promise<ConsentLetterFormData> {
  const [clientsRes, isCodesRes, lab] = await Promise.all([
    supabase
      .from('clients')
      .select('id, company_name, address, district, pin_code, state, country')
      .order('company_name', { ascending: true }),
    supabase.from('is_codes').select('id, is_number, revision_year, title').order('is_number', { ascending: true }),
    fetchLabDetails(),
  ])

  if (clientsRes.error) throw clientsRes.error
  if (isCodesRes.error) throw isCodesRes.error

  const clients = mapClientRows(clientsRes.data)
  let isCodes = mapIsCodeRows(isCodesRes.data)
  const preferredIsCodeId = defaultIsCodeId?.trim() || null
  isCodes = await ensureIsCodeInList(isCodes, preferredIsCodeId)

  const resolvedIsCodeId = preferredIsCodeId ?? isCodes[0]?.id ?? null
  const testParameters = resolvedIsCodeId ? await fetchTestParametersForIsCode(resolvedIsCodeId) : []

  return {
    defaultClientId: defaultClientId?.trim() || clients[0]?.id || null,
    clients,
    isCodes,
    testParameters,
    lab,
  }
}

export async function fetchConsentLetterFormData(
  sampleId: string,
  defaultIsCodeId: string | null,
): Promise<ConsentLetterFormData> {
  const [sampleRes, clientsRes, isCodesRes, resultRows, lab] = await Promise.all([
    supabase
      .from('samples')
      .select('client_id, test_report_is_code_id')
      .eq('id', sampleId)
      .maybeSingle(),
    supabase
      .from('clients')
      .select('id, company_name, address, district, pin_code, state, country')
      .order('company_name', { ascending: true }),
    supabase.from('is_codes').select('id, is_number, revision_year, title').order('is_number', { ascending: true }),
    fetchReportResultRowsForSample(sampleId),
    fetchLabDetails(),
  ])

  if (sampleRes.error) throw sampleRes.error
  if (clientsRes.error) throw clientsRes.error
  if (isCodesRes.error) throw isCodesRes.error

  const sample = sampleRes.data as { client_id?: string | null; test_report_is_code_id?: string | null } | null
  const defaultClientId = sample?.client_id?.trim() || null
  const sampleIsCodeId = defaultIsCodeId?.trim() || sample?.test_report_is_code_id?.trim() || null

  const clients = mapClientRows(clientsRes.data)
  let isCodes = mapIsCodeRows(isCodesRes.data)
  isCodes = await ensureIsCodeInList(isCodes, sampleIsCodeId)

  const seen = new Set<string>()
  const testParameters: ConsentLetterTestParameterOption[] = []
  for (const row of resultRows) {
    const testName = row.testName?.trim()
    if (!testName) continue
    const key = `${testName}::${row.clauseNo ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    testParameters.push({
      key,
      testName,
      clauseNo: row.clauseNo?.trim() || row.testMethodClause?.trim() || null,
      specificRequirement: null,
      uncertaintyMu: null,
      underAccreditation: null,
    })
  }

  return {
    defaultClientId,
    clients,
    isCodes,
    testParameters,
    lab,
  }
}
