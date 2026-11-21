import { supabase } from '@/lib/supabaseClient'

export type LibraryApiKey = {
  id: string
  name: string
  key_prefix: string
  active: boolean
  created_by: string | null
  created_at: string
  revoked_at: string | null
  last_used_at: string | null
  use_count: number
}

export async function fetchApiKeys(): Promise<LibraryApiKey[]> {
  const { data, error } = await supabase
    .from('library_api_keys')
    .select('id, name, key_prefix, active, created_by, created_at, revoked_at, last_used_at, use_count')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as LibraryApiKey[]
}

/** Makes a key; the full key comes back only here, once. */
export async function createApiKey(name: string): Promise<{ id: string; apiKey: string }> {
  const { data, error } = await supabase.rpc('create_library_api_key', { p_name: name })
  if (error) throw new Error(error.message)
  const row = (Array.isArray(data) ? data[0] : data) as { id: string; api_key: string } | null
  if (!row?.api_key) throw new Error('The Key Could Not Be Made.')
  return { id: row.id, apiKey: row.api_key }
}

export async function revokeApiKey(id: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_library_api_key', { p_id: id })
  if (error) throw new Error(error.message)
}

/** Public base of the Library API (the app's API gateway). */
export function libraryApiBase(): string {
  return `${String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')}/functions/v1/library`
}
