import { supabase } from '@/lib/supabaseClient'

export type ActiveUserProfileOption = {
  id: string
  name: string
  designation: string
  departmentName: string
}

/** Active users from User Management (`user_profiles`). */
export async function fetchActiveUserProfiles(): Promise<ActiveUserProfileOption[]> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, full_name, designation, department_name, status')
    .order('full_name', { ascending: true })

  if (error) throw error

  return (Array.isArray(data) ? data : [])
    .filter((u) => String((u as { status?: string }).status ?? '').toLowerCase() !== 'inactive')
    .map((u) => ({
      id: String((u as { id: string }).id),
      name:
        String((u as { full_name?: string }).full_name ?? '').trim() ||
        String((u as { id: string }).id),
      designation: String((u as { designation?: string }).designation ?? '').trim(),
      departmentName: String((u as { department_name?: string }).department_name ?? '').trim(),
    }))
}
