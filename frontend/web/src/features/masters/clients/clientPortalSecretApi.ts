import { supabase } from '@/lib/supabaseClient'

/** Map Postgres errors without ever echoing a password value. */
function friendlyPortalError(error: { message?: string; code?: string }): Error {
  const code = String(error.code ?? '')
  const message = String(error.message ?? '')
  if (code === 'PGRST202' || /could not find the function/i.test(message)) {
    return new Error('Manak password storage is not on the database yet. Apply the client credentials migration, then save again.')
  }
  if (code === '42501' || message.includes('42501')) return new Error('No permission')
  if (code === '54000' || /too many password requests/i.test(message)) {
    return new Error('Too many password requests. Try again in a few minutes.')
  }
  if (/password is too long/i.test(message)) {
    return new Error('Password is too long (max 200 characters).')
  }
  if (/not signed in/i.test(message)) return new Error('No permission')
  if (/not found/i.test(message)) return new Error('Client not found')
  return new Error(message.trim() || 'Could not use the portal password.')
}

export async function setClientPortalPassword(clientId: string, password: string | null): Promise<boolean> {
  const { data, error } = await supabase.rpc('client_portal_secret_set', {
    p_client_id: clientId,
    p_password: password,
  })
  if (error) throw friendlyPortalError(error)
  return Boolean(data)
}

export async function revealClientPortalPassword(clientId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('client_portal_secret_get', {
    p_client_id: clientId,
    p_purpose: 'reveal',
  })
  if (error) throw friendlyPortalError(error)
  if (data == null || data === '') return null
  return String(data)
}
