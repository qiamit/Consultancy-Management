import { supabase } from '@/lib/supabaseClient'
import type { ClientContactForm, ClientSiteForm } from './types'

export type SimilarClient = {
  id: string
  company_name: string | null
  gst_number: string | null
  similarity: number
}

export type ClientCertificateFile = {
  id: string
  client_id: string
  cert_name: string
  document_number: string
  /** Free-text name of the document (cert_name holds the document type). */
  doc_title: string
  issued_on: string
  file_name: string
  storage_path: string
  file_size: number | null
  mime_type: string | null
  created_at: string
}

export type ClientCertificateInput = {
  certName: string
  documentNumber: string
  issuedOn: string
  docTitle?: string
  file: File
  existing?: ClientCertificateFile
}

export const CERT_BUCKET = 'client-certificates'
const CERT_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
const CERT_MAX = 25 * 1024 * 1024
export function isSameFirmName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/** Case-insensitive firm name. The same GSTIN may belong to another unit. */
export async function firmNameTaken(name: string, exceptId?: string | null): Promise<boolean> {
  const trimmed = name.trim()
  if (!trimmed) return false
  const { data, error } = await supabase
    .from('clients')
    .select('id, company_name')
    .ilike('company_name', trimmed.replace(/[%_\\]/g, '\\$&'))
    .limit(20)
  if (error) throw error
  return (Array.isArray(data) ? data : []).some((raw) => {
    const row = raw as { id?: string; company_name?: string | null }
    if (exceptId && String(row.id ?? '') === exceptId) return false
    return isSameFirmName(String(row.company_name ?? ''), trimmed)
  })
}

export const FIRM_NAME_TAKEN = 'A firm with this name already exists.'

export function firmNameConstraintMessage(error: { code?: string; message?: string } | null): string | null {
  if (!error || error.code !== '23505') return null
  if (/company_name|clients_company_name/i.test(error.message ?? '')) return FIRM_NAME_TAKEN
  return null
}

const OPTION_CLIENT_COLUMN: Record<string, string> = {
  state: 'state',
  country: 'country',
  district: 'district',
  pin_code: 'pin_code',
  country_code: 'country_code',
  company_type: 'company_type',
  company_scale: 'company_scale',
  payment_term: 'payment_term',
}

export function formatClientOptionLabel(category: string, rawLabel: string): string {
  if (category === 'pin_code') return rawLabel.trim().replace(/[^0-9]/g, '').slice(0, 6)
  const text = rawLabel.trim().replace(/\s+/g, ' ')
  if (category === 'country_code') {
    if (!text) return ''
    return text.startsWith('+') ? text : `+${text}`
  }
  return text
}

function optionIdIsStored(id: string): boolean {
  return Boolean(id) && !id.startsWith('default-') && !id.startsWith('db-') && !id.startsWith('tmp-')
}

function missingOptionColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === '42703' || error.code === 'PGRST204' || /does not exist|schema cache/i.test(error.message ?? '')
}

export async function updateClientMasterOption(
  id: string,
  category: string,
  rawLabel: string,
  oldLabel?: string,
): Promise<string> {
  const name = formatClientOptionLabel(category, rawLabel)
  if (!name || !id) return name
  if (optionIdIsStored(id)) {
    const { error } = await supabase.from('client_master_options').update({ label: name, value: name }).eq('id', id)
    if (error) throw error
  }
  if (!oldLabel || oldLabel === name) return name
  const column = OPTION_CLIENT_COLUMN[category]
  if (column) {
    const { error } = await supabase.from('clients').update({ [column]: name }).eq(column, oldLabel)
    if (error) throw error
  }
  if (category === 'women_entrepreneur' || category === 'startup') {
    const column = category === 'women_entrepreneur' ? 'women_entrepreneur' : 'startup_status'
    const flag = category === 'women_entrepreneur' ? 'is_women_entrepreneur' : 'is_startup'
    const { error } = await supabase
      .from('clients')
      .update({ [column]: name, [flag]: name.trim().toLowerCase() === 'yes' })
      .eq(column, oldLabel)
    if (error && !missingOptionColumn(error)) throw error
  }
  return name
}

export async function deleteClientMasterOption(id: string): Promise<void> {
  if (!optionIdIsStored(id)) return
  const { error } = await supabase.from('client_master_options').delete().eq('id', id)
  if (error) throw error
}

export async function findSimilarClients(name: string, gstin: string): Promise<SimilarClient[]> {
  const { data, error } = await supabase.rpc('find_similar_clients', {
    p_name: name,
    p_gstin: gstin,
  })
  if (error) {
    if (error.code === '42883' || error.code === 'PGRST202') return []
    throw error
  }
  return (Array.isArray(data) ? data : []).map((raw) => {
    const row = raw as Record<string, unknown>
    return {
      id: String(row.id ?? ''),
      company_name: row.company_name == null ? null : String(row.company_name),
      gst_number: row.gst_number == null ? null : String(row.gst_number),
      similarity: Number(row.similarity ?? 0) || 0,
    }
  })
}

export async function listClientSites(clientId: string): Promise<ClientSiteForm[]> {
  const { data, error } = await supabase
    .from('client_sites')
    .select('*')
    .eq('client_id', clientId)
    .order('is_primary', { ascending: false })
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return []
    throw error
  }
  return (Array.isArray(data) ? data : []).map((raw) => {
    const row = raw as Record<string, unknown>
    return {
      id: String(row.id ?? ''),
      siteRole: (row.site_role as ClientSiteForm['siteRole']) || 'Other',
      address: String(row.address ?? ''),
      district: String(row.district ?? ''),
      state: String(row.state ?? ''),
      pinCode: String(row.pin_code ?? ''),
      gstNumber: String(row.gst_number ?? ''),
      isPrimary: Boolean(row.is_primary),
      country: String(row.country ?? ''),
    }
  })
}

export async function listClientContacts(clientId: string): Promise<ClientContactForm[]> {
  const { data, error } = await supabase
    .from('client_contacts')
    .select('id, contact_role, name, designation, mobile, email, is_primary')
    .eq('client_id', clientId)
    .order('is_primary', { ascending: false })
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return []
    throw error
  }
  return (Array.isArray(data) ? data : []).map((raw) => {
    const row = raw as Record<string, unknown>
    return {
      id: String(row.id ?? ''),
      contactRole: (row.contact_role as ClientContactForm['contactRole']) || 'Other',
      name: String(row.name ?? ''),
      designation: String(row.designation ?? ''),
      mobile: String(row.mobile ?? ''),
      email: String(row.email ?? ''),
      isPrimary: Boolean(row.is_primary),
    }
  })
}

export async function saveClientSites(clientId: string, sites: ClientSiteForm[]): Promise<void> {
  const keep = sites.map((s) => s.id).filter((id): id is string => Boolean(id))
  let del = supabase.from('client_sites').delete().eq('client_id', clientId)
  if (keep.length > 0) del = del.not('id', 'in', `(${keep.join(',')})`)
  const { error: delErr } = await del
  if (delErr) throw delErr
  for (const site of sites) {
    const payload = {
      client_id: clientId,
      site_role: site.siteRole,
      address: site.address.trim() || null,
      district: site.district.trim() || null,
      state: site.state.trim() || null,
      pin_code: site.pinCode.trim() || null,
      gst_number: site.gstNumber.trim().toUpperCase() || null,
      is_primary: site.isPrimary,
      country: site.country?.trim() || null,
    }
    if (site.id) {
      const { error } = await supabase.from('client_sites').update(payload).eq('id', site.id)
      if (error) throw error
    } else {
      const { error } = await supabase.from('client_sites').insert(payload)
      if (error) throw error
    }
  }
}

export async function saveClientContacts(clientId: string, contacts: ClientContactForm[]): Promise<void> {
  const keep = contacts.map((c) => c.id).filter((id): id is string => Boolean(id))
  let del = supabase.from('client_contacts').delete().eq('client_id', clientId)
  if (keep.length > 0) del = del.not('id', 'in', `(${keep.join(',')})`)
  const { error: delErr } = await del
  if (delErr) throw delErr
  for (const contact of contacts) {
    const payload = {
      client_id: clientId,
      contact_role: contact.contactRole,
      name: contact.name.trim() || null,
      designation: contact.designation.trim() || null,
      mobile: contact.mobile.trim() || null,
      email: contact.email.trim() || null,
      is_primary: contact.isPrimary,
    }
    if (contact.id) {
      const { error } = await supabase.from('client_contacts').update(payload).eq('id', contact.id)
      if (error) throw error
    } else {
      const { error } = await supabase.from('client_contacts').insert(payload)
      if (error) throw error
    }
  }
}

const CERT_COLUMNS_TITLE = 'id, client_id, cert_name, doc_title, document_number, issued_on, file_name, storage_path, file_size, mime_type, created_at'
const CERT_COLUMNS = 'id, client_id, cert_name, document_number, issued_on, file_name, storage_path, file_size, mime_type, created_at'
const CERT_COLUMNS_BASE = 'id, client_id, cert_name, file_name, storage_path, file_size, mime_type, created_at'

function missingCertColumn(error: { code?: string; message?: string } | null) {
  if (!error) return false
  return error.code === '42703' || error.code === 'PGRST204' || /does not exist|schema cache/i.test(error.message ?? '')
}

function mapCertificate(row: Record<string, unknown>): ClientCertificateFile {
  return {
    id: String(row.id ?? ''),
    client_id: String(row.client_id ?? ''),
    cert_name: String(row.cert_name ?? ''),
    doc_title: row.doc_title == null ? '' : String(row.doc_title),
    document_number: row.document_number == null ? '' : String(row.document_number),
    issued_on: row.issued_on == null ? '' : String(row.issued_on).slice(0, 10),
    file_name: String(row.file_name ?? ''),
    storage_path: String(row.storage_path ?? ''),
    file_size: row.file_size == null ? null : Number(row.file_size),
    mime_type: row.mime_type == null ? null : String(row.mime_type),
    created_at: String(row.created_at ?? ''),
  }
}

export async function listClientCertificates(clientId: string): Promise<ClientCertificateFile[]> {
  const titled = await supabase
    .from('client_certificate_files')
    .select(CERT_COLUMNS_TITLE)
    .eq('client_id', clientId)
    .order('cert_name', { ascending: true })
  if (!titled.error) return (Array.isArray(titled.data) ? titled.data : []).map((row) => mapCertificate(row as unknown as Record<string, unknown>))
  const first = await supabase
    .from('client_certificate_files')
    .select(CERT_COLUMNS)
    .eq('client_id', clientId)
    .order('cert_name', { ascending: true })
  if (!first.error) return (Array.isArray(first.data) ? first.data : []).map((row) => mapCertificate(row as unknown as Record<string, unknown>))
  if (first.error.code === '42P01' || first.error.code === 'PGRST205') return []
  if (!missingCertColumn(first.error)) throw first.error
  const second = await supabase
    .from('client_certificate_files')
    .select(CERT_COLUMNS_BASE)
    .eq('client_id', clientId)
    .order('cert_name', { ascending: true })
  if (second.error) {
    if (second.error.code === '42P01' || second.error.code === 'PGRST205') return []
    throw second.error
  }
  return (Array.isArray(second.data) ? second.data : []).map((row) => mapCertificate(row as unknown as Record<string, unknown>))
}

function certificateDetails(input: Pick<ClientCertificateInput, 'certName' | 'documentNumber' | 'issuedOn' | 'docTitle'>) {
  return {
    cert_name: input.certName.trim(),
    document_number: input.documentNumber.trim() || null,
    issued_on: input.issuedOn || null,
    // Only written when the caller passes a title, so other edits never wipe it.
    ...(input.docTitle === undefined ? {} : { doc_title: input.docTitle.trim() || null }),
  }
}

async function storeCertificateFile(clientId: string, file: File) {
  if (!CERT_MIME.has(file.type)) throw new Error('Upload a PDF, JPG, PNG, or WebP file.')
  if (file.size > CERT_MAX) throw new Error('Certificate must be 25 MB or smaller.')
  const fileId = crypto.randomUUID()
  const safeName = file.name.replace(/[^\w.\- ]+/g, '_').slice(0, 180) || 'certificate'
  const storagePath = `${clientId}/${fileId}/${safeName}`
  const { error: upErr } = await supabase.storage.from(CERT_BUCKET).upload(storagePath, file, {
    contentType: file.type,
    upsert: false,
  })
  if (upErr) throw upErr
  return { fileId, safeName, storagePath }
}

export async function uploadClientCertificate(clientId: string, input: ClientCertificateInput): Promise<void> {
  const name = input.certName.trim()
  if (!name) throw new Error('Document name is required.')
  const stored = await storeCertificateFile(clientId, input.file)
  const details = certificateDetails(input)
  const inserted = await supabase.from('client_certificate_files').insert({
    id: stored.fileId,
    client_id: clientId,
    ...details,
    file_name: stored.safeName,
    storage_path: stored.storagePath,
    file_size: input.file.size,
    mime_type: input.file.type,
  })
  if (!inserted.error) {
    if (input.existing?.storage_path) {
      await supabase.storage.from(CERT_BUCKET).remove([input.existing.storage_path])
      await supabase.from('client_certificate_files').delete().eq('id', input.existing.id)
    }
    return
  }
  if (!missingCertColumn(inserted.error)) throw inserted.error
  const { doc_title: _omitTitle, ...detailsNoTitle } = details as typeof details & { doc_title?: string | null }
  void _omitTitle
  const noTitle = await supabase.from('client_certificate_files').insert({
    id: stored.fileId,
    client_id: clientId,
    ...detailsNoTitle,
    file_name: stored.safeName,
    storage_path: stored.storagePath,
    file_size: input.file.size,
    mime_type: input.file.type,
  })
  if (!noTitle.error) {
    if (input.existing?.storage_path) {
      await supabase.storage.from(CERT_BUCKET).remove([input.existing.storage_path])
      await supabase.from('client_certificate_files').delete().eq('id', input.existing.id)
    }
    return
  }
  if (!missingCertColumn(noTitle.error)) throw noTitle.error
  const retry = await supabase.from('client_certificate_files').insert({
    id: stored.fileId,
    client_id: clientId,
    cert_name: details.cert_name,
    file_name: stored.safeName,
    storage_path: stored.storagePath,
    file_size: input.file.size,
    mime_type: input.file.type,
  })
  if (retry.error) throw retry.error
}

export async function updateClientCertificateDetails(
  id: string,
  input: Pick<ClientCertificateInput, 'certName' | 'documentNumber' | 'issuedOn' | 'docTitle'>,
): Promise<void> {
  const details = certificateDetails(input)
  if (!details.cert_name) throw new Error('Document name is required.')
  const first = await supabase.from('client_certificate_files').update(details).eq('id', id)
  if (!first.error) return
  if (!missingCertColumn(first.error)) throw first.error
  const { doc_title: _omitTitle, ...detailsNoTitle } = details as typeof details & { doc_title?: string | null }
  void _omitTitle
  const noTitle = await supabase.from('client_certificate_files').update(detailsNoTitle).eq('id', id)
  if (!noTitle.error) return
  if (!missingCertColumn(noTitle.error)) throw noTitle.error
  const second = await supabase.from('client_certificate_files').update({ cert_name: details.cert_name }).eq('id', id)
  if (second.error) throw second.error
}

export async function deleteClientCertificate(row: ClientCertificateFile): Promise<void> {
  const { error: storageErr } = await supabase.storage.from(CERT_BUCKET).remove([row.storage_path])
  if (storageErr) throw storageErr
  const { error } = await supabase.from('client_certificate_files').delete().eq('id', row.id)
  if (error) throw error
}

export async function openClientCertificate(row: ClientCertificateFile): Promise<void> {
  const { data, error } = await supabase.storage.from(CERT_BUCKET).createSignedUrl(row.storage_path, 60)
  if (error || !data?.signedUrl) throw error ?? new Error('Unable to open the file.')
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
}

export type PinPlace = { district: string; state: string; country: string }

export type ClientAddressDirectory = {
  byPin: Map<string, PinPlace>
  districts: string[]
  states: string[]
  countries: string[]
}

function cleanPlace(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function pinDigits(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '').slice(0, 6)
}

function placeScore(place: PinPlace): number {
  return (place.district ? 4 : 0) + (place.state ? 2 : 0) + (place.country ? 1 : 0)
}

function missingCityColumn(error: { message?: string; code?: string }): boolean {
  const message = String(error.message ?? '')
  return /city/i.test(message) && /does not exist|schema cache|PGRST204|42703/i.test(`${error.code ?? ''} ${message}`)
}

/** Distinct PIN → district/state/country taken from saved clients, plus the place names for the dropdowns. */
export async function loadClientAddressDirectory(): Promise<ClientAddressDirectory> {
  const pageSize = 1000
  const rows: Array<{ pin: string; district: string; city: string; state: string; country: string }> = []
  let includeCity = true
  let from = 0
  while (true) {
    const query = includeCity
      ? supabase.from('clients').select('pin_code, district, city, state, country')
      : supabase.from('clients').select('pin_code, district, state, country')
    const { data, error } = await query.order('id', { ascending: true }).range(from, from + pageSize - 1)
    if (error) {
      if (includeCity && from === 0 && missingCityColumn(error)) {
        includeCity = false
        continue
      }
      throw error
    }
    const batch = data ?? []
    for (const row of batch) {
      rows.push({
        pin: pinDigits(row.pin_code),
        district: cleanPlace(row.district),
        city: cleanPlace('city' in row ? row.city : ''),
        state: cleanPlace(row.state),
        country: cleanPlace(row.country),
      })
    }
    if (batch.length < pageSize) break
    from += pageSize
  }

  const pinCounts = new Map<string, Map<string, { place: PinPlace; n: number }>>()
  const districts = new Set<string>()
  const states = new Set<string>()
  const countries = new Set<string>()
  for (const row of rows) {
    const district = row.district || row.city
    if (district) districts.add(district)
    if (row.city && row.city.toLowerCase() !== district.toLowerCase()) districts.add(row.city)
    if (row.state) states.add(row.state)
    if (row.country) countries.add(row.country)
    if (row.pin.length !== 6) continue
    const place: PinPlace = { district, state: row.state, country: row.country }
    if (!place.district && !place.state && !place.country) continue
    const signature = `${place.district.toLowerCase()}|${place.state.toLowerCase()}|${place.country.toLowerCase()}`
    let bucket = pinCounts.get(row.pin)
    if (!bucket) {
      bucket = new Map()
      pinCounts.set(row.pin, bucket)
    }
    const current = bucket.get(signature)
    if (current) current.n += 1
    else bucket.set(signature, { place, n: 1 })
  }

  const byPin = new Map<string, PinPlace>()
  for (const [pin, bucket] of pinCounts) {
    let best: { place: PinPlace; n: number } | null = null
    for (const item of bucket.values()) {
      if (!best || item.n > best.n || (item.n === best.n && placeScore(item.place) > placeScore(best.place))) best = item
    }
    if (best) byPin.set(pin, best.place)
  }

  const sort = (values: Set<string>) => Array.from(values).sort((a, b) => a.localeCompare(b))
  return { byPin, districts: sort(districts), states: sort(states), countries: sort(countries) }
}
