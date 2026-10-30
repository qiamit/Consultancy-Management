import { supabase } from '@/lib/supabaseClient'
import { formatIsCodeLabelFromParts } from '@/features/masters/is-codes/formatIsCodeLabel'

/* Admin side of the Customer Portal: who may log in for a client, which licences each login sees, and which
   licence files are shared. The tables are admin-only in the database; invites go through the functions server. */

export type PortalClientLicence = { id: string; label: string; validity: string | null }
export type PortalLogin = {
  user_id: string
  email: string
  full_name: string
  active: boolean
  invited_at: string
  licence_ids: string[]
}
export type PortalLicenceFile = { id: string; file_name: string; doc_kind: string; customer_visible: boolean }

const NOT_LICENCE_KINDS = '("Application","application","Inclusion","inclusion")'

export async function listClientLicences(clientId: string): Promise<PortalClientLicence[]> {
  const { data, error } = await supabase
    .from('bis_projects')
    .select('id, cm_l_digits, license_validity_date, is_code:is_codes(is_number, revision_year)')
    .eq('client_id', clientId)
    .not('project_kind', 'in', NOT_LICENCE_KINDS)
    .order('license_validity_date', { ascending: true, nullsFirst: false })
  if (error) throw error
  return ((data ?? []) as unknown as Array<{
    id: string
    cm_l_digits: string | null
    license_validity_date: string | null
    is_code: { is_number?: string | null; revision_year?: string | null } | null
  }>).map((r) => {
    const cmL = String(r.cm_l_digits ?? '').replace(/\D/g, '')
    const is = formatIsCodeLabelFromParts(r.is_code?.is_number, r.is_code?.revision_year)
    return { id: r.id, label: [cmL ? `CM/L-${cmL}` : 'Licence', is].filter(Boolean).join(' · '), validity: r.license_validity_date }
  })
}

export async function listPortalLogins(clientId: string): Promise<PortalLogin[]> {
  const { data: links, error } = await supabase
    .from('portal_customers')
    .select('user_id, invited_at')
    .eq('client_id', clientId)
    .order('invited_at')
  if (error) throw error
  const ids = (links ?? []).map((l) => String(l.user_id))
  if (ids.length === 0) return []
  const [profiles, access] = await Promise.all([
    supabase.from('user_profiles').select('id, email, full_name, status').in('id', ids),
    supabase.from('portal_licence_access').select('user_id, project_id').in('user_id', ids),
  ])
  if (profiles.error) throw profiles.error
  if (access.error) throw access.error
  return (links ?? []).map((l) => {
    const p = (profiles.data ?? []).find((x) => x.id === l.user_id)
    return {
      user_id: String(l.user_id),
      email: String(p?.email ?? ''),
      full_name: String(p?.full_name ?? ''),
      active: ['', 'active'].includes(String(p?.status ?? '').trim().toLowerCase()),
      invited_at: String(l.invited_at),
      licence_ids: (access.data ?? []).filter((a) => a.user_id === l.user_id).map((a) => String(a.project_id)),
    }
  })
}

async function callPortalFunction(name: string, body: Record<string, unknown>): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Session expired. Please log in again.')
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'x-user-jwt': session.access_token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: unknown } | null
    throw new Error(payload?.error ? String(payload.error) : `${name} failed (${response.status})`)
  }
}

export function inviteCustomer(input: { email: string; full_name: string; client_id: string; project_ids: string[] }) {
  return callPortalFunction('portal-invite-customer', input)
}

export function resendCustomerInvite(userId: string) {
  return callPortalFunction('portal-resend-invite', { user_id: userId })
}

/** Removes the login completely (the same admin action as deleting a team user). */
export function removeCustomerLogin(userId: string) {
  return callPortalFunction('delete-user', { user_id: userId })
}

export async function setLicenceAccess(userId: string, projectId: string, allowed: boolean): Promise<void> {
  const { error } = allowed
    ? await supabase.from('portal_licence_access').insert({ user_id: userId, project_id: projectId })
    : await supabase.from('portal_licence_access').delete().eq('user_id', userId).eq('project_id', projectId)
  if (error) throw error
}

export async function setLoginActive(userId: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('user_profiles').update({ status: active ? 'Active' : 'Inactive' }).eq('id', userId)
  if (error) throw error
}

export async function listLicenceFiles(projectId: string): Promise<PortalLicenceFile[]> {
  const { data, error } = await supabase
    .from('bis_project_files')
    .select('id, file_name, doc_kind, customer_visible')
    .eq('bis_project_id', projectId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as PortalLicenceFile[]
}

export async function setFileShared(fileId: string, shared: boolean): Promise<void> {
  const { error } = await supabase.from('bis_project_files').update({ customer_visible: shared }).eq('id', fileId)
  if (error) throw error
}
