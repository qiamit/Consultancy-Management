import { supabase } from '@/lib/supabaseClient'

/** Company-wide portal logins kept in Company Settings (the password is encrypted on the server). */
export type CompanyPortal = 'bsb'

export async function getCompanyPortalLoginInfo(portal: CompanyPortal): Promise<{ userId: string; passwordSet: boolean }> {
  const { data, error } = await supabase.rpc('company_portal_login_info', { p_portal: portal })
  if (error) throw new Error(error.message)
  const info = (data ?? {}) as { user_id?: string; password_set?: boolean }
  return { userId: String(info.user_id ?? ''), passwordSet: Boolean(info.password_set) }
}

/** Saves the User ID; password `null` keeps the saved one, '' clears it. Returns whether a password is saved. */
export async function saveCompanyPortalLogin(portal: CompanyPortal, userId: string, password: string | null): Promise<boolean> {
  const { data, error } = await supabase.rpc('company_portal_login_set', {
    p_portal: portal,
    p_user_id: userId.trim(),
    p_password: password,
  })
  if (error) throw new Error(error.message)
  return Boolean(data)
}

/** User ID + password for the extension's login fill (logged on the server). Null when none is saved. */
export async function getCompanyPortalLoginForExtension(portal: CompanyPortal): Promise<{ userId: string; password: string } | null> {
  const { data, error } = await supabase.rpc('company_portal_login_get', { p_portal: portal })
  if (error) throw new Error(error.message)
  if (!data) return null
  const login = data as { user_id?: string; password?: string }
  return { userId: String(login.user_id ?? ''), password: String(login.password ?? '') }
}
