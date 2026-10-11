import { supabase } from '@/lib/supabaseClient'

export type BisBranchOfficeRow = {
  id: string
  code: string
  name: string
  officeType: string
  region: string | null
  address: string | null
  pinCode: string | null
  city: string | null
  state: string | null
  country: string | null
  countryCode: string | null
  contactName: string | null
  email: string | null
  mobile: string | null
  remark: string | null
  gstNumber: string | null
  longitude: string | null
  latitude: string | null
  archivedAt: string | null
}

export type BisBranchOfficeForm = {
  code: string
  name: string
  officeType: string
  region: string
  address: string
  pinCode: string
  city: string
  state: string
  country: string
  countryCode: string
  contactName: string
  email: string
  mobile: string
  remark: string
  gstNumber: string
  longitude: string
  latitude: string
}

const OFFICE_TYPE_TO_LABEL: Record<string, string> = {
  HQ: 'Headquarters',
  RO: 'Regional Office',
  BO: 'Branch Office',
}

export function officeTypeToForm(raw: string | null | undefined): string {
  const text = String(raw ?? '').trim()
  if (!text) return 'Branch Office'
  return OFFICE_TYPE_TO_LABEL[text.toUpperCase()] ?? text
}

export function officeTypeToDb(raw: string | null | undefined): string {
  const key = String(raw ?? '').trim().toLowerCase()
  if (key === 'headquarters' || key === 'hq') return 'HQ'
  if (key === 'regional office' || key === 'ro') return 'RO'
  if (key === 'branch office' || key === 'bo') return 'BO'
  return String(raw ?? '').trim()
}

const BIS_OFFICE_NAME_PREFIX = 'Bureau of Indian Standards - '
const ROMAN_OFFICE_NUMBER: Record<string, string> = { I: '1', II: '2', III: '3', IV: '4' }

/** `Ahmedabad Branch Office I` → `Bureau of Indian Standards - Ahmedabad Branch Office 1`. */
export function formatBisBranchOfficeName(raw: string): string {
  let rest = raw.trim().replace(/\s+/g, ' ')
  rest = rest.replace(/^bureau of indian standards\s*[,–—-]?\s*/i, '')
  rest = rest.replace(/\s+(IV|III|II|I)$/i, (_, roman: string) => ` ${ROMAN_OFFICE_NUMBER[roman.toUpperCase()] ?? roman}`)
  rest = rest.trim()
  if (!rest) return ''
  return `${BIS_OFFICE_NAME_PREFIX}${rest}`
}

export function emptyBisBranchOfficeForm(): BisBranchOfficeForm {
  return {
    code: '',
    name: '',
    officeType: 'Branch Office',
    region: '',
    address: '',
    pinCode: '',
    city: '',
    state: '',
    country: 'India',
    countryCode: '+91',
    contactName: '',
    email: '',
    mobile: '',
    remark: '',
    gstNumber: '',
    longitude: '',
    latitude: '',
  }
}

function textOrNull(raw: unknown): string | null {
  if (raw == null) return null
  const text = String(raw).trim()
  return text || null
}

function mapRow(raw: Record<string, unknown>): BisBranchOfficeRow {
  return {
    id: String(raw.id ?? ''),
    code: String(raw.code ?? ''),
    name: String(raw.name ?? ''),
    officeType: officeTypeToForm(textOrNull(raw.office_type)),
    region: textOrNull(raw.region),
    address: textOrNull(raw.address),
    pinCode: textOrNull(raw.pin_code),
    city: textOrNull(raw.city),
    state: textOrNull(raw.state),
    country: textOrNull(raw.country),
    countryCode: textOrNull(raw.country_code),
    contactName: textOrNull(raw.contact_name),
    email: textOrNull(raw.email),
    mobile: textOrNull(raw.mobile),
    remark: textOrNull(raw.remark),
    gstNumber: textOrNull(raw.gst_number),
    longitude: raw.longitude == null ? null : String(raw.longitude),
    latitude: raw.latitude == null ? null : String(raw.latitude),
    archivedAt: raw.archived_at == null ? null : String(raw.archived_at),
  }
}

const BASE_COLUMNS = 'id, code, name, office_type, region, city, state'
const FULL_COLUMNS = `${BASE_COLUMNS}, address, pin_code, country, country_code, contact_name, email, mobile, remark, gst_number, longitude, latitude, archived_at`

function missingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  const message = error.message ?? ''
  return error.code === '42703' || error.code === 'PGRST204' || (/column/i.test(message) && /does not exist|schema cache/i.test(message))
}

export function missingBisOfficeTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message ?? '')
}

export async function listBisBranchOffices(includeArchived = false): Promise<BisBranchOfficeRow[]> {
  const run = (columns: string) => {
    let query = supabase.from('bis_offices').select(columns).order('name')
    if (!includeArchived && columns.includes('archived_at')) query = query.is('archived_at', null)
    return query
  }
  let { data, error } = await run(FULL_COLUMNS)
  if (error && missingColumn(error)) {
    const retry = await run(BASE_COLUMNS)
    data = retry.data
    error = retry.error
  }
  if (error) {
    if (missingBisOfficeTable(error)) return []
    throw error
  }
  return (Array.isArray(data) ? data : []).map((row) => mapRow(row as unknown as Record<string, unknown>))
}

export async function setBisBranchOfficesArchived(ids: string[], archived: boolean): Promise<void> {
  if (ids.length === 0) return
  const { error } = await supabase
    .from('bis_offices')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .in('id', ids)
  if (error) throw error
}

export async function deleteBisBranchOffices(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { error } = await supabase.from('bis_offices').delete().in('id', ids)
  if (error) throw error
}

export async function saveBisBranchOffice(form: BisBranchOfficeForm, editingId: string | null): Promise<string> {
  const base = {
    code: form.code.trim().toUpperCase(),
    name: formatBisBranchOfficeName(form.name),
    office_type: officeTypeToDb(form.officeType) || 'BO',
    region: form.region.trim() || null,
    city: form.city.trim() || null,
    state: form.state.trim() || null,
  }
  const full = {
    ...base,
    address: form.address.trim() || null,
    pin_code: form.pinCode.trim() || null,
    country: form.country.trim() || null,
    country_code: form.countryCode.trim() || '+91',
    contact_name: form.contactName.trim() || null,
    email: form.email.trim() || null,
    mobile: form.mobile.trim() || null,
    remark: form.remark.trim() || null,
    gst_number: form.gstNumber.trim().toUpperCase() || null,
    longitude: form.longitude.trim() || null,
    latitude: form.latitude.trim() || null,
  }
  const write = (payload: Record<string, string | null>) =>
    editingId
      ? supabase.from('bis_offices').update(payload).eq('id', editingId).select('id').single()
      : supabase.from('bis_offices').insert(payload).select('id').single()
  let { data, error } = await write(full)
  if (error && missingColumn(error)) {
    const retry = await write(base)
    data = retry.data
    error = retry.error
  }
  if (error) throw error
  return String((data as { id: string }).id)
}
