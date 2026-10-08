import { supabase } from '@/lib/supabaseClient'

export type TeamUserRecord = {
  id: string
  email: string
  full_name: string
  mobile: string
  designation: string
  department_name: string
  division: string
  status: string
}

function mapRow(row: Record<string, unknown>): TeamUserRecord | null {
  const id = String(row.id ?? '').trim()
  if (!id) return null
  const status = String(row.status ?? 'Active').trim() || 'Active'
  return {
    id,
    email: String(row.email ?? '').trim(),
    full_name: String(row.full_name ?? '').trim(),
    mobile: String(row.mobile ?? '').trim(),
    designation: String(row.designation ?? '').trim(),
    department_name: String(row.department_name ?? '').trim(),
    division: String(row.division ?? '').trim(),
    status,
  }
}

/** Team directory from Railway Postgres (RPC joins auth email, else user_profiles). */
export async function fetchTeamUsers(): Promise<TeamUserRecord[]> {
  const rpc = await supabase.rpc('list_team_users')
  if (!rpc.error && Array.isArray(rpc.data)) {
    return (rpc.data as Array<Record<string, unknown>>)
      .map((row) => mapRow(row))
      .filter((row): row is TeamUserRecord => Boolean(row))
  }

  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, email, full_name, mobile, designation, department_name, division, status')
    .order('full_name', { ascending: true })

  if (!error && Array.isArray(data)) {
    return data
      .map((row) => mapRow(row as Record<string, unknown>))
      .filter((row): row is TeamUserRecord => Boolean(row))
  }

  if (rpc.error) throw rpc.error
  if (error) throw error
  throw new Error('Unable to load users')
}
