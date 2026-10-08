import { supabase } from '@/lib/supabaseClient'

/** Map Postgres errors without ever echoing a password value. */
function friendlyPortalError(error: { message?: string; code?: string }): Error {
  const code = String(error.code ?? '')
  const message = String(error.message ?? '')
  if (code === '42501' || message.includes('42501')) return new Error('No permission')
  if (code === '54000' || /too many password requests/i.test(message)) {
    return new Error('Too many password requests. Try again in a few minutes.')
  }
  if (/password is too long/i.test(message)) {
    return new Error('Password is too long (max 200 characters).')
  }
  if (/not signed in/i.test(message)) return new Error('No permission')
  if (/not found/i.test(message)) return new Error('BIS project not found')
  return new Error(message.trim() || 'Could not use the portal password.')
}

export async function setPortalPassword(
  projectId: string,
  password: string | null,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('bis_portal_secret_set', {
    p_project_id: projectId,
    p_password: password,
  })
  if (error) throw friendlyPortalError(error)
  return Boolean(data)
}

export async function getPortalPasswordForExtension(projectId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('bis_portal_secret_get', {
    p_project_id: projectId,
    p_purpose: 'extension_login',
  })
  if (error) throw friendlyPortalError(error)
  if (data == null || data === '') return null
  return String(data)
}

export async function revealPortalPassword(projectId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('bis_portal_secret_get', {
    p_project_id: projectId,
    p_purpose: 'reveal',
  })
  if (error) throw friendlyPortalError(error)
  if (data == null || data === '') return null
  return String(data)
}
