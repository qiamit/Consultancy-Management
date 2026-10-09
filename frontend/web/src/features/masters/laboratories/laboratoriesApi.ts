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
  state: string | null
  contact_name: string | null
  email: string | null
  mobile: string | null
  archived_at: string | null
}

export type LaboratoryForm = {
  name: string
  labType: string
  oslCode: string
  recognisedFrom: string
  recognisedUpto: string
  address: string
  state: string
  contactName: string
  email: string
  mobile: string
}

export const LAB_TYPES = [
  'BIS lab',
  'BIS-recognised OSL',
  'Empanelled',
  'In-house',
  'NABL',
  'Calibration',
] as const

export function emptyLaboratoryForm(): LaboratoryForm {
  return {
    name: '',
    labType: 'BIS-recognised OSL',
    oslCode: '',
    recognisedFrom: '',
    recognisedUpto: '',
    address: '',
    state: '',
    contactName: '',
    email: '',
    mobile: '',
  }
}

function mapRow(raw: Record<string, unknown>): LaboratoryRow {
  return {
    id: String(raw.id ?? ''),
    legacy_client_id: raw.legacy_client_id == null ? null : String(raw.legacy_client_id),
    name: String(raw.name ?? ''),
    lab_type: String(raw.lab_type ?? 'BIS-recognised OSL'),
    osl_code: raw.osl_code == null ? null : String(raw.osl_code),
    recognised_from: raw.recognised_from == null ? null : String(raw.recognised_from).slice(0, 10),
    recognised_upto: raw.recognised_upto == null ? null : String(raw.recognised_upto).slice(0, 10),
    address: raw.address == null ? null : String(raw.address),
    state: raw.state == null ? null : String(raw.state),
    contact_name: raw.contact_name == null ? null : String(raw.contact_name),
    email: raw.email == null ? null : String(raw.email),
    mobile: raw.mobile == null ? null : String(raw.mobile),
    archived_at: raw.archived_at == null ? null : String(raw.archived_at),
  }
}

export async function listLaboratories(): Promise<LaboratoryRow[]> {
  const { data, error } = await supabase
    .from('laboratories')
    .select('id, legacy_client_id, name, lab_type, osl_code, recognised_from, recognised_upto, address, state, contact_name, email, mobile, archived_at')
    .is('archived_at', null)
    .order('name')
  if (error) throw error
  return (Array.isArray(data) ? data : []).map((row) => mapRow(row as Record<string, unknown>))
}

export async function saveLaboratory(form: LaboratoryForm, editingId: string | null): Promise<string> {
  const payload = {
    name: form.name.trim(),
    lab_type: form.labType,
    osl_code: form.oslCode.trim() || null,
    recognised_from: form.recognisedFrom || null,
    recognised_upto: form.recognisedUpto || null,
    address: form.address.trim() || null,
    state: form.state.trim() || null,
    contact_name: form.contactName.trim() || null,
    email: form.email.trim() || null,
    mobile: form.mobile.trim() || null,
  }
  if (editingId) {
    const { data, error } = await supabase.from('laboratories').update(payload).eq('id', editingId).select('id').single()
    if (error) throw error
    return String((data as { id: string }).id)
  }
  const { data, error } = await supabase.from('laboratories').insert(payload).select('id').single()
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
