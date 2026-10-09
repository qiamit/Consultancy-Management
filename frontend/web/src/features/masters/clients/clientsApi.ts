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
  file_name: string
  storage_path: string
  file_size: number | null
  mime_type: string | null
  created_at: string
}

const CERT_BUCKET = 'client-certificates'
const CERT_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
const CERT_MAX = 25 * 1024 * 1024

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
    .select('id, site_role, address, district, state, pin_code, gst_number, is_primary')
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

export async function listClientCertificates(clientId: string): Promise<ClientCertificateFile[]> {
  const { data, error } = await supabase
    .from('client_certificate_files')
    .select('id, client_id, cert_name, file_name, storage_path, file_size, mime_type, created_at')
    .eq('client_id', clientId)
    .order('cert_name', { ascending: true })
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return []
    throw error
  }
  return (Array.isArray(data) ? data : []) as ClientCertificateFile[]
}

export async function uploadClientCertificate(clientId: string, certName: string, file: File): Promise<void> {
  const name = certName.trim()
  if (!name) throw new Error('Certificate name is required.')
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
  const { error } = await supabase.from('client_certificate_files').insert({
    id: fileId,
    client_id: clientId,
    cert_name: name,
    file_name: safeName,
    storage_path: storagePath,
    file_size: file.size,
    mime_type: file.type,
  })
  if (error) throw error
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
