import { supabase } from '@/lib/supabaseClient'

export type LaboratoryRow = {
  id: string
  legacy_client_id: string | null
  name: string
  lab_type: string
  osl_code: string | null
  recognised_from: string | null
  recognised_upto: string | null
  address: string | null
  pin_code: string | null
  district: string | null
  state: string | null
  country: string | null
  country_code: string | null
  contact_name: string | null
  email: string | null
  mobile: string | null
  gst_number: string | null
  opening_balance: string | null
  balance_type: string | null
  payment_term: string | null
  remark: string | null
  archived_at: string | null
}

export type LaboratoryForm = {
  name: string
  labType: string
  oslCode: string
  address: string
  pinCode: string
  district: string
  state: string
  country: string
  countryCode: string
  contactName: string
  email: string
  mobile: string
  gstNumber: string
  openingBalance: string
  balanceType: string
  paymentTerm: string
  remark: string
}

export const LAB_TYPES = ['BIS', 'OSL', 'Other'] as const

export type LabType = (typeof LAB_TYPES)[number]

export function normalizeLabType(value: string): LabType {
  const key = value.trim().toLowerCase()
  if (key === 'bis' || key === 'bis lab') return 'BIS'
  if (key === 'osl' || key === 'bis-recognised osl' || key === 'bis recognised osl') return 'OSL'
  return 'Other'
}

export function emptyLaboratoryForm(): LaboratoryForm {
  return {
    name: '',
    labType: 'OSL',
    oslCode: '',
    address: '',
    pinCode: '',
    district: 'Raipur',
    state: 'Chhattisgarh',
    country: 'India',
    countryCode: '+91',
    contactName: '',
    email: '',
    mobile: '',
    gstNumber: '',
    openingBalance: '',
    balanceType: 'Dr',
    paymentTerm: '100 % Advance',
    remark: '',
  }
}

function mapRow(raw: Record<string, unknown>): LaboratoryRow {
  return {
    id: String(raw.id ?? ''),
    legacy_client_id: raw.legacy_client_id == null ? null : String(raw.legacy_client_id),
    name: String(raw.name ?? ''),
    lab_type: normalizeLabType(String(raw.lab_type ?? 'OSL')),
    osl_code: raw.osl_code == null ? null : String(raw.osl_code),
    recognised_from: raw.recognised_from == null ? null : String(raw.recognised_from).slice(0, 10),
    recognised_upto: raw.recognised_upto == null ? null : String(raw.recognised_upto).slice(0, 10),
    address: raw.address == null ? null : String(raw.address),
    pin_code: raw.pin_code == null ? null : String(raw.pin_code),
    district: raw.district == null ? null : String(raw.district),
    state: raw.state == null ? null : String(raw.state),
    country: raw.country == null ? null : String(raw.country),
    country_code: raw.country_code == null ? null : String(raw.country_code),
    contact_name: raw.contact_name == null ? null : String(raw.contact_name),
    email: raw.email == null ? null : String(raw.email),
    mobile: raw.mobile == null ? null : String(raw.mobile),
    gst_number: raw.gst_number == null ? null : String(raw.gst_number),
    opening_balance: raw.opening_balance == null ? null : String(raw.opening_balance),
    balance_type: raw.balance_type == null ? null : String(raw.balance_type),
    payment_term: raw.payment_term == null ? null : String(raw.payment_term),
    remark: raw.remark == null ? null : String(raw.remark),
    archived_at: raw.archived_at == null ? null : String(raw.archived_at),
  }
}

const LAB_COLUMNS_BASE =
  'id, legacy_client_id, name, lab_type, osl_code, address, state, contact_name, email, mobile, archived_at'
const LAB_COLUMNS_ADDRESS =
  `${LAB_COLUMNS_BASE}, pin_code, district, country, country_code`
const LAB_COLUMNS =
  `${LAB_COLUMNS_ADDRESS}, gst_number, opening_balance, balance_type, payment_term, remark`

function missingColumn(error: { code?: string; message?: string }): boolean {
  const message = error.message ?? ''
  return error.code === '42703' || error.code === 'PGRST204' || (/column/i.test(message) && /does not exist|schema cache/i.test(message))
}

export async function listLaboratories(includeArchived = false): Promise<LaboratoryRow[]> {
  const run = (columns: string) => {
    let query = supabase.from('laboratories').select(columns).order('name')
    if (!includeArchived) query = query.is('archived_at', null)
    return query
  }
  let { data, error } = await run(LAB_COLUMNS)
  if (error && missingColumn(error)) {
    const retry = await run(LAB_COLUMNS_ADDRESS)
    data = retry.data
    error = retry.error
  }
  if (error && missingColumn(error)) {
    const retry = await run(LAB_COLUMNS_BASE)
    data = retry.data
    error = retry.error
  }
  if (error) throw error
  return (Array.isArray(data) ? data : []).map((row) => mapRow(row as unknown as Record<string, unknown>))
}

export async function setLaboratoriesArchived(ids: string[], archived: boolean): Promise<void> {
  if (ids.length === 0) return
  const { error } = await supabase
    .from('laboratories')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .in('id', ids)
  if (error) throw error
}

export async function deleteLaboratories(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { error } = await supabase.from('laboratories').delete().in('id', ids)
  if (error) throw error
}

export async function saveLaboratory(form: LaboratoryForm, editingId: string | null): Promise<string> {
  const base = {
    name: form.name.trim(),
    lab_type: normalizeLabType(form.labType),
    osl_code: form.oslCode.trim() || null,
    address: form.address.trim() || null,
    state: form.state.trim() || null,
    contact_name: form.contactName.trim() || null,
    email: form.email.trim() || null,
    mobile: form.mobile.trim() || null,
  }
  const withAddress = {
    ...base,
    pin_code: form.pinCode.trim() || null,
    district: form.district.trim() || null,
    country: form.country.trim() || null,
    country_code: form.countryCode.trim() || '+91',
  }
  const withFinance = {
    ...withAddress,
    gst_number: form.gstNumber.trim().toUpperCase() || null,
    opening_balance: form.openingBalance.trim() || null,
    balance_type: form.balanceType === 'Cr' ? 'Cr' : 'Dr',
    payment_term: form.paymentTerm.trim() || null,
    remark: form.remark.trim() || null,
  }
  const write = (payload: Record<string, string | null>) =>
    editingId
      ? supabase.from('laboratories').update(payload).eq('id', editingId).select('id').single()
      : supabase.from('laboratories').insert(payload).select('id').single()
  let { data, error } = await write(withFinance)
  if (error && missingColumn(error)) {
    const retry = await write(withAddress)
    data = retry.data
    error = retry.error
  }
  if (error && missingColumn(error)) {
    const retry = await write(base)
    data = retry.data
    error = retry.error
  }
  if (error) throw error
  return String((data as { id: string }).id)
}

export async function findLaboratoryAddressByName(companyName: string): Promise<string> {
  const name = companyName.trim()
  if (!name) return ''
  const { data, error } = await supabase
    .from('laboratories')
    .select('address, state')
    .ilike('name', name)
    .is('archived_at', null)
    .limit(1)
    .maybeSingle()
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return ''
    throw error
  }
  if (!data) return ''
  const row = data as { address?: string | null; state?: string | null }
  return [row.address, row.state].filter(Boolean).join(', ')
}
