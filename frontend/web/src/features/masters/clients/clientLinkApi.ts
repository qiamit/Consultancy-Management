import { supabase } from '@/lib/supabaseClient'

/**
 * Writes used by the BIS application wizard so that edits made on the application
 * go straight to Client Master (the application is linked to the client until a
 * licence number exists).
 */

export type ClientSiteRow = {
  id: string
  site_role: string
  address: string | null
  district: string | null
  state: string | null
  pin_code: string | null
  is_primary: boolean
}

function errMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message
  if (err && typeof err === 'object') {
    const e = err as { message?: string; details?: string; hint?: string }
    return [e.message, e.details, e.hint].filter(Boolean).join(' — ') || 'Could not save'
  }
  return 'Could not save'
}

function missingColumn(err: { code?: string; message?: string } | null): string | null {
  if (!err) return null
  const m = err.message ?? ''
  if (err.code !== '42703' && err.code !== 'PGRST204' && !/does not exist|schema cache/i.test(m)) return null
  return m.match(/'([a-z0-9_]+)' column/i)?.[1] ?? m.match(/column (?:[a-z0-9_]+\.)?([a-z0-9_]+) does not exist/i)?.[1] ?? null
}

/** Update columns on `clients`. Columns the database does not have yet are dropped one at a time. */
export async function patchClient(clientId: string, patch: Record<string, unknown>): Promise<void> {
  const row = { ...patch }
  for (let i = 0; i <= Object.keys(patch).length; i += 1) {
    const { data, error } = await supabase.from('clients').update(row).eq('id', clientId).select('id')
    if (!error) {
      if (!data || data.length === 0) throw new Error('You do not have edit access to this client.')
      return
    }
    const col = missingColumn(error)
    if (!col || !(col in row)) throw new Error(errMessage(error))
    delete row[col]
  }
}

export async function listSites(clientId: string): Promise<ClientSiteRow[]> {
  const { data, error } = await supabase
    .from('client_sites')
    .select('id, site_role, address, district, state, pin_code, is_primary')
    .eq('client_id', clientId)
  if (error) return []
  return (Array.isArray(data) ? data : []) as ClientSiteRow[]
}

/** Update (or create) the Office or Factory site of a client. */
export async function patchSite(
  clientId: string,
  role: 'Registered Office' | 'Factory',
  patch: Partial<Pick<ClientSiteRow, 'address' | 'district' | 'state' | 'pin_code'>>,
  preferSiteId?: string | null,
): Promise<void> {
  const sites = await listSites(clientId)
  const existing =
    sites.find((s) => preferSiteId && s.id === preferSiteId && s.site_role === role) ??
    (role === 'Registered Office'
      ? sites.find((s) => s.is_primary) ?? sites.find((s) => s.site_role === 'Registered Office')
      : sites.find((s) => s.site_role === 'Factory'))
  if (existing) {
    const { error } = await supabase.from('client_sites').update(patch).eq('id', existing.id)
    if (error) throw new Error(errMessage(error))
    return
  }
  const { error } = await supabase
    .from('client_sites')
    .insert({ client_id: clientId, site_role: role, is_primary: role === 'Registered Office', ...patch })
  if (error) throw new Error(errMessage(error))
}
